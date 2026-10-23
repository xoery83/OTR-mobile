import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  captureAccountScope,
  assertAccountRequestContext,
} from "../auth/accountRequestContext";
import { requireActiveUserId } from "../auth/authRepository";

const target = z.strictObject({ tripId: coreUuid, operationId: coreUuid });
const configuration = z
  .strictObject({
    version: z.literal(1),
    accountId: coreUuid,
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    creates: z.array(target).max(3),
    edits: z.array(target).max(6),
  })
  .superRefine((value, context) => {
    const duration = Date.parse(value.expiresAt) - Date.parse(value.startsAt);
    const operations = [...value.creates, ...value.edits].map((item) => item.operationId);
    if (
      duration <= 0 ||
      duration > 900_000 ||
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

// View-only isolation; retained historical rows/receipts are neither deleted nor relabelled.
export function filterNativeTripQaList<T extends { id: string }>(
  accountId: string | null,
  trips: readonly T[],
): readonly T[] {
  const scope = readConfiguration();
  if (!scope || scope.accountId !== accountId) return trips;
  const ids = new Set([...scope.creates, ...scope.edits].map((item) => item.tripId));
  return trips.filter((item) => ids.has(item.id));
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
    await createNativeTripCreateSyncRunner(
      { ...item, accountId: actor.accountId },
      enabled,
    )();
  }
  for (const item of scope.edits) {
    await assertAccountRequestContext(actor, requireActiveUserId);
    if (!enabled()) return null;
    await createNativeTripMetadataSyncRunner(enabled, {
      ...item,
      accountId: actor.accountId,
    })();
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
