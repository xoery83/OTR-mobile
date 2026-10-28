import { z } from "zod";
import { readLocalSession, requireActiveUserId } from "../auth/authRepository";
import { ApiClientError } from "../api/client";
import { sessionAccessToken } from "../auth/sessionAccessToken";
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
const finiteConfiguration = z
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
const sustainedConfiguration = z.strictObject({
  version: z.literal(2),
  accountId: coreUuid,
  normal: z.strictObject({ newTripsFrom: z.iso.datetime() }),
  viewIsolationStartedAt: z.iso.datetime().optional(),
  preserveLocalTripViews: z.boolean().optional(),
});
const configuration = z.union([finiteConfiguration, sustainedConfiguration]);

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

function scopeEnabled(scope: NonNullable<ReturnType<typeof readConfiguration>>) {
  const now = Date.now();
  return (
    process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev" &&
    process.env.EXPO_PUBLIC_OTR_API_BASE_URL === "https://api-dev.xoery.art" &&
    (scope.version === 2 ||
      (now >= Date.parse(scope.startsAt) && now < Date.parse(scope.expiresAt)))
  );
}

// Existing token provider refreshes/persists only this Account; failure pauses dispatch, never local access.
async function readNormalDispatchSession(
  actor: Awaited<ReturnType<typeof captureAccountScope>>,
  enabled: () => boolean,
) {
  await assertAccountRequestContext(actor, requireActiveUserId);
  if (!enabled()) return null;
  try {
    await sessionAccessToken({ expectedUserId: actor.accountId });
  } catch (error) {
    // Account-generation changes must escape instead of being mistaken for a network pause.
    await assertAccountRequestContext(actor, requireActiveUserId);
    if (error instanceof ApiClientError && error.kind === "network") return null;
    throw error;
  }
  await assertAccountRequestContext(actor, requireActiveUserId);
  if (!enabled()) return null;
  const session = await readLocalSession();
  await assertAccountRequestContext(actor, requireActiveUserId);
  return enabled() && session?.identity?.userId === actor.accountId ? session : null;
}

// Only the owning normal selector contributes work to the existing operational timer.
// Exact finite QA and historical queues remain unscheduled.
export async function getNativeTripQaQueueActivity() {
  const idle = { actionableNow: 0, nextActionableAt: null };
  const scope = readConfiguration();
  if (!scope?.normal || !scopeEnabled(scope)) return idle;
  const actor = await captureAccountScope(requireActiveUserId);
  if (actor.accountId !== scope.accountId) return idle;
  const session = await readNormalDispatchSession(actor, () => scopeEnabled(scope));
  if (stateFromSessionAndNetwork(session, true) !== "AUTHENTICATED_ONLINE") return idle;
  const [{ readInitializedDatabase }, { getNormalTripQueueActivity }] = await Promise.all(
    [import("../db/database"), import("./tripNormalQueueActivity")],
  );
  const database = await readInitializedDatabase();
  await assertAccountRequestContext(actor, requireActiveUserId);
  if (!scopeEnabled(scope)) return idle;
  const activity = await getNormalTripQueueActivity(database, {
    accountId: actor.accountId,
    newTripsFrom: scope.normal.newTripsFrom,
  });
  await assertAccountRequestContext(actor, requireActiveUserId);
  return scopeEnabled(scope) ? activity : idle;
}

// Local opt-in only. It cannot enable dispatch or upgrade an existing queued request.
export function nativeTripQaCreateFormat(accountId: string | null): 2 | undefined {
  const scope = readConfiguration();
  return process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev" &&
    scope?.accountId === accountId
    ? 2
    : undefined;
}

// Only a fresh authored action opts into Person cloud creation; retained v1 names stay private.
export function nativeTripAuthoredCloudTravelers(accountId: string | null) {
  const scope = readConfiguration();
  return (
    !!scope && scope.version === 2 && scope.accountId === accountId && scopeEnabled(scope)
  );
}

// Dormant explicit Native opt-in. This never enables Backend authority or upgrades retained journals.
export function nativeTripQaFormalManualFlightScope(accountId: string) {
  const scope = readConfiguration();
  return process.env.EXPO_PUBLIC_OTR_MANUAL_P2_FORMAL_ENABLED === "true" &&
    scope?.version === 2 &&
    scope.accountId === accountId &&
    scopeEnabled(scope)
    ? {
        accountId,
        newTripsFrom: new Date(
          Math.max(
            Date.parse(scope.normal.newTripsFrom),
            Date.parse("2026-10-28T02:16:48Z"),
          ),
        ).toISOString(),
      }
    : null;
}

// View-only isolation; retained historical rows/receipts are neither deleted nor relabelled.
export function filterNativeTripQaList<
  T extends { id: string; syncFormatVersion?: 2; createdAt?: string | null },
>(accountId: string | null, trips: readonly T[]): readonly T[] {
  const scope = readConfiguration();
  if (!scope || scope.accountId !== accountId) return trips;
  // View-only retention never changes the normal runner's new-trip cutoff or queue eligibility.
  if (scope.version === 2 && scope.preserveLocalTripViews) return trips;
  const ids = new Set(
    scope.version === 1
      ? [...scope.creates, ...scope.edits].map((item) => item.tripId)
      : [],
  );
  const cutoff =
    scope.viewIsolationStartedAt ??
    (scope.version === 2 ? scope.normal.newTripsFrom : scope.startsAt);
  return trips.filter(
    (item) =>
      ids.has(item.id) ||
      // New local V2 creates remain visible after finite dispatch expires.
      // The owning Repository supplies Account-scoped original CREATE provenance.
      (item.syncFormatVersion === 2 &&
        typeof item.createdAt === "string" &&
        Date.parse(item.createdAt) >= Date.parse(cutoff)),
  );
}

export function kickNativeTripQaSync() {
  if (!hasNativeTripQaScope()) return;
  void import("./ledgerOperationalSync")
    .then(({ kickLedgerOperationalSync }) => kickLedgerOperationalSync())
    .catch(() => undefined);
}

// Read-only QA evidence: never refresh Auth, dispatch work or expose payloads/credentials.
export async function readNativeTripQaDiagnostic() {
  const scope = readConfiguration();
  const session = await readLocalSession();
  const accountMatches = !!scope && session?.identity?.userId === scope.accountId;
  const [{ isLedgerOperationalSyncPaused }, { readLastApiFailure }] = await Promise.all([
    import("./ledgerOperationalSync"),
    import("../api/client"),
  ]);
  const gate = {
    configured: hasNativeTripQaScope(),
    parsed: !!scope,
    version: scope?.version ?? null,
    accountMatches,
    transportMatches: process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev",
    apiMatches: process.env.EXPO_PUBLIC_OTR_API_BASE_URL === "https://api-dev.xoery.art",
    enabled: !!scope && scopeEnabled(scope),
    sessionState: stateFromSessionAndNetwork(session, true),
    paused: isLedgerOperationalSyncPaused(),
  };
  const creates: {
    tripId: string;
    operationId: string;
    createdAt: string;
    formatVersion: number | null;
    status: string;
    attempts: number;
    failureCategory: string | null;
    errorCode: string | null;
  }[] = [];
  if (scope?.normal && accountMatches) {
    const actor = await captureAccountScope(requireActiveUserId);
    if (actor.accountId !== scope.accountId) throw Error("TRIP_QA_ACCOUNT_CHANGED");
    const { readInitializedDatabase } = await import("../db/database");
    const database = await readInitializedDatabase();
    await assertAccountRequestContext(actor, requireActiveUserId);
    const rows = await database.getAllAsync<{
      trip_id: string;
      id: string;
      created_at: string;
      payload_json: string;
      status: string;
      attempt_count: number;
      failure_category: string | null;
      last_error_code: string | null;
    }>(
      "SELECT op.trip_id,op.id,op.created_at,op.payload_json,op.status,op.attempt_count,op.failure_category,op.last_error_code FROM local_trip_containers trip JOIN sync_operations op ON op.id=trip.create_operation_id AND op.owner_user_id=trip.account_id AND op.trip_id=trip.id WHERE trip.account_id=? AND trip.created_at>=? AND op.entity_type='TRIP' AND op.operation_type='CREATE_TRIP' ORDER BY trip.created_at DESC,trip.id LIMIT 5",
      scope.accountId,
      scope.normal.newTripsFrom,
    );
    await assertAccountRequestContext(actor, requireActiveUserId);
    for (const row of rows) {
      let formatVersion: number | null = null;
      try {
        if (row.payload_json.length <= 8192) {
          const payload = JSON.parse(row.payload_json);
          if (payload?.formatVersion === 2) formatVersion = 2;
        }
      } catch {
        /* Retained malformed payload remains untouched. */
      }
      const code = (value: string | null) =>
        value && /^[A-Z0-9_]{1,80}$/.test(value) ? value : null;
      creates.push({
        tripId: row.trip_id,
        operationId: row.id,
        createdAt: row.created_at,
        formatVersion,
        status: code(row.status) ?? "UNKNOWN",
        attempts: row.attempt_count,
        failureCategory: code(row.failure_category),
        errorCode: code(row.last_error_code),
      });
    }
  }
  return { gate, creates, lastApiFailure: readLastApiFailure() };
}

export async function runNativeTripQaSync() {
  const parsed = readConfiguration();
  if (!parsed) return null;
  const scope = Object.freeze(parsed);
  const enabled = () => scopeEnabled(scope);
  if (!enabled()) return null;
  const actor = await captureAccountScope(requireActiveUserId);
  if (actor.accountId !== scope.accountId || !enabled()) return null;
  if (scope.normal) {
    const session = await readNormalDispatchSession(actor, enabled);
    if (stateFromSessionAndNetwork(session, true) !== "AUTHENTICATED_ONLINE") return null;
    const { createNativeNormalTripSyncRunner } = await import("./tripNormalCoordinator");
    await assertAccountRequestContext(actor, requireActiveUserId);
    if (!enabled()) return null;
    const result = await createNativeNormalTripSyncRunner(
      { accountId: scope.accountId, newTripsFrom: scope.normal.newTripsFrom },
      enabled,
    )(stateFromSessionAndNetwork(session, true));
    await assertAccountRequestContext(actor, requireActiveUserId);
    if (!enabled()) return null;
    return {
      ...actor,
      journeyIds: result && "tripIds" in result ? (result.tripIds ?? []) : [],
    };
  }
  if (scope.version !== 1) return null;
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
