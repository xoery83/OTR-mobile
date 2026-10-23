import { z } from "zod";
import { readLocalSession, requireActiveUserId } from "../auth/authRepository";
import { stateFromSessionAndNetwork } from "@/domain/auth/localSession";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  captureAccountScope,
  assertAccountRequestContext,
} from "../auth/accountRequestContext";

const target = z.strictObject({
  tripId: coreUuid,
  operationId: coreUuid,
  lastAttemptAt: z.iso.datetime().nullable().optional(),
});
const configuration = z
  .strictObject({
    version: z.literal(1),
    accountId: coreUuid,
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    viewIsolationStartedAt: z.iso.datetime().optional(),
    normal: z.strictObject({ newTripsFrom: z.iso.datetime() }).optional(),
    creates: z.array(target).max(3),
    edits: z.array(target).max(6),
  })
  .superRefine((value, context) => {
    const duration = Date.parse(value.expiresAt) - Date.parse(value.startsAt);
    const operations = [...value.creates, ...value.edits].map((item) => item.operationId);
    if (
      duration <= 0 ||
      duration > (value.normal ? 86_400_000 : 900_000) ||
      (value.normal &&
        (operations.length > 0 ||
          Date.parse(value.normal.newTripsFrom) > Date.parse(value.startsAt))) ||
      new Set(operations).size !== operations.length
    )
      context.addIssue({ code: "custom", message: "INVALID_FINITE_QA_SCOPE" });
  });

// Presence keeps historical queues quarantined even after expiry or malformed config.
export function hasNativeTripQaScope() {
  return Boolean(process.env.EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE);
}

function readConfiguration() {
  const raw = process.env.EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE;
  if (!raw) return null;
  try {
    return configuration.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Local opt-in only. It cannot enable dispatch or upgrade an existing queued request.
export function nativeTripQaCreateFormat(accountId: string | null): 2 | undefined {
  const scope = readConfiguration();
  return process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev" &&
    scope?.accountId === accountId
    ? 2
    : undefined;
}

// View-only isolation; retained historical rows/receipts are neither deleted nor relabelled.
export function filterNativeTripQaList<
  T extends { id: string; syncFormatVersion?: 2; createdAt?: string | null },
>(accountId: string | null, trips: readonly T[]): readonly T[] {
  const scope = readConfiguration();
  if (!scope || scope.accountId !== accountId) return trips;
  const ids = new Set([...scope.creates, ...scope.edits].map((item) => item.tripId));
  return trips.filter(
    (item) =>
      ids.has(item.id) ||
      // New local V2 creates remain visible after finite dispatch expires.
      // The owning Repository supplies Account-scoped original CREATE provenance.
      (item.syncFormatVersion === 2 &&
        typeof item.createdAt === "string" &&
        Date.parse(item.createdAt) >=
          Date.parse(scope.viewIsolationStartedAt ?? scope.startsAt)),
  );
}

export function kickNativeTripQaSync() {
  if (!hasNativeTripQaScope()) return;
  void import("./ledgerOperationalSync")
    .then(({ kickLedgerOperationalSync }) => kickLedgerOperationalSync())
    .catch(() => undefined);
}

export async function runNativeTripQaSync() {
  const parsed = readConfiguration();
  if (!parsed) return null;
  const scope = Object.freeze(parsed);
  const enabled = () => {
    const now = Date.now();
    return (
      process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev" &&
      process.env.EXPO_PUBLIC_OTR_API_BASE_URL === "https://api-dev.xoery.art" &&
      now >= Date.parse(scope.startsAt) &&
      now < Date.parse(scope.expiresAt)
    );
  };
  if (!enabled()) return null;
  const actor = await captureAccountScope(requireActiveUserId);
  if (actor.accountId !== scope.accountId || !enabled()) return null;
  if (scope.normal) {
    const session = await readLocalSession();
    await assertAccountRequestContext(actor, requireActiveUserId);
    const { createNativeNormalTripSyncRunner } = await import("./tripNormalCoordinator");
    await assertAccountRequestContext(actor, requireActiveUserId);
    if (!enabled()) return null;
    const result = await createNativeNormalTripSyncRunner(
      { accountId: scope.accountId, newTripsFrom: scope.normal.newTripsFrom },
      enabled,
    )(stateFromSessionAndNetwork(session, true));
    await assertAccountRequestContext(actor, requireActiveUserId);
    if (!enabled()) return null;
    return { ...actor, journeyIds: result && "tripIds" in result ? result.tripIds ?? [] : [] };
  }
  const [{ createNativeTripCreateSyncRunner }, { createNativeTripMetadataSyncRunner }] =
    await Promise.all([
      import("./tripCreateCoordinator"),
      import("./tripMetadataCoordinator"),
    ]);
  await assertAccountRequestContext(actor, requireActiveUserId);
  if (!enabled()) return null;
  for (const item of scope.creates) {
    await assertAccountRequestContext(actor, requireActiveUserId);
    if (!enabled()) return null;
    const { lastAttemptAt = null, ...target } = item;
    await createNativeTripCreateSyncRunner(
      { ...target, accountId: actor.accountId },
      enabled,
      lastAttemptAt,
    )();
  }
  for (const item of scope.edits) {
    await assertAccountRequestContext(actor, requireActiveUserId);
    if (!enabled()) return null;
    const { lastAttemptAt = null, ...target } = item;
    await createNativeTripMetadataSyncRunner(
      enabled,
      { ...target, accountId: actor.accountId },
      lastAttemptAt,
    )();
  }
  await assertAccountRequestContext(actor, requireActiveUserId);
  if (!enabled()) return null;
  return {
    ...actor,
    journeyIds: [
      ...new Set([...scope.creates, ...scope.edits].map((item) => item.tripId)),
    ],
  };
}
