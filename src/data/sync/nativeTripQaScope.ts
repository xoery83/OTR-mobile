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
const sustainedConfiguration = z
  .strictObject({
    version: z.literal(2),
    accountId: coreUuid,
    normal: z.strictObject({ newTripsFrom: z.iso.datetime() }),
    viewIsolationStartedAt: z.iso.datetime().optional(),
    preserveLocalTripViews: z.boolean().optional(),
    additionalAccounts: z
      .array(
        z.strictObject({
          accountId: coreUuid,
          normal: z.strictObject({ newTripsFrom: z.iso.datetime() }),
          recoverUnsentLegacyTrips: z.boolean().optional(),
          confirmedLocalTravelers: z
            .array(
              z.strictObject({
                tripId: coreUuid,
                localOperationId: coreUuid,
                operationId: coreUuid,
                confirmedDisplayNameSha256: z.string().regex(/^[a-f0-9]{64}$/),
              }),
            )
            .max(4)
            .optional(),
        }),
      )
      .max(2)
      .optional(),
  })
  .refine(
    (scope) =>
      new Set([
        scope.accountId,
        ...(scope.additionalAccounts ?? []).map((a) => a.accountId),
      ]).size ===
      1 + (scope.additionalAccounts?.length ?? 0),
  );
const configuration = z.union([finiteConfiguration, sustainedConfiguration]);

// Presence keeps historical queues quarantined even after expiry or malformed config.
export function hasNativeTripQaScope() {
  return Boolean(process.env.EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE);
}

// Normal Manual rollout is an environment gate, never an Account allowlist or Backend grant.
export function isGeneralAccountCloudSyncEnabled() {
  return (
    !hasNativeTripQaScope() &&
    process.env.EXPO_PUBLIC_OTR_NORMAL_CLOUD_SYNC_ENABLED === "true" &&
    process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev" &&
    process.env.EXPO_PUBLIC_OTR_API_BASE_URL === "https://api-dev.xoery.art"
  );
}

function readConfiguration(accountId?: string | null) {
  const raw = process.env.EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE;
  if (!raw)
    return isGeneralAccountCloudSyncEnabled() && coreUuid.safeParse(accountId).success
      ? {
          ...sustainedConfiguration.parse({
            version: 2,
            accountId,
            normal: { newTripsFrom: "1970-01-01T00:00:00.000Z" },
            preserveLocalTripViews: true,
          }),
          manualOnly: true as const,
        }
      : null;
  try {
    const scope = configuration.parse(JSON.parse(raw));
    if (scope.version === 2 && accountId && scope.accountId !== accountId) {
      const selected = scope.additionalAccounts?.find((a) => a.accountId === accountId);
      if (selected) return { ...scope, ...selected };
    }
    return scope;
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
  if (isGeneralAccountCloudSyncEnabled()) {
    const { readCommittedLocalPrincipal } = await import("../auth/authRepository");
    const principal = await readCommittedLocalPrincipal();
    await assertAccountRequestContext(actor, requireActiveUserId);
    if (principal?.kind !== "ACCOUNT" || principal.accountId !== actor.accountId)
      return null;
  }
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
  if (!hasNativeTripQaScope() && !isGeneralAccountCloudSyncEnabled()) return idle;
  const actor = await captureAccountScope(requireActiveUserId);
  const scope = readConfiguration(actor.accountId);
  if (!scope?.normal || !scopeEnabled(scope)) return idle;
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
    ...("manualOnly" in scope && scope.manualOnly ? { manualOnly: true } : {}),
  });
  await assertAccountRequestContext(actor, requireActiveUserId);
  return scopeEnabled(scope) ? activity : idle;
}

// Local opt-in only. It cannot enable dispatch or upgrade an existing queued request.
export function nativeTripQaCreateFormat(accountId: string | null): 2 | undefined {
  const scope = readConfiguration(accountId);
  return process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev" &&
    scope?.accountId === accountId
    ? 2
    : undefined;
}

// Only a fresh authored action opts into Person cloud creation; retained v1 names stay private.
export function nativeTripAuthoredCloudTravelers(accountId: string | null) {
  const scope = readConfiguration(accountId);
  return (
    !!scope && scope.version === 2 && scope.accountId === accountId && scopeEnabled(scope)
  );
}

// Dormant explicit Native opt-in. This never enables Backend authority or upgrades retained journals.
export function nativeTripQaFormalManualFlightScope(accountId: string) {
  const scope = readConfiguration(accountId);
  return process.env.EXPO_PUBLIC_OTR_MANUAL_P2_FORMAL_ENABLED === "true" &&
    scope?.version === 2 &&
    scope.accountId === accountId &&
    scopeEnabled(scope)
    ? {
        accountId,
        newTripsFrom: new Date(
          Math.max(
            Date.parse(scope.normal.newTripsFrom),
            "manualOnly" in scope && scope.manualOnly
              ? 0
              : Date.parse("2026-10-28T02:16:48Z"),
          ),
        ).toISOString(),
      }
    : null;
}

// View-only isolation; retained historical rows/receipts are neither deleted nor relabelled.
export function filterNativeTripQaList<
  T extends { id: string; syncFormatVersion?: 2; createdAt?: string | null },
>(accountId: string | null, trips: readonly T[]): readonly T[] {
  const scope = readConfiguration(accountId);
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
  if (!hasNativeTripQaScope() && !isGeneralAccountCloudSyncEnabled()) return;
  void import("./ledgerOperationalSync")
    .then(({ kickLedgerOperationalSync }) => kickLedgerOperationalSync())
    .catch(() => undefined);
}

// Read-only QA evidence: never refresh Auth, dispatch work or expose payloads/credentials.
export async function readNativeTripQaDiagnostic() {
  const session = await readLocalSession();
  const scope = readConfiguration(session?.identity?.userId);
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
    confirmedTravelerRecoveryAvailable:
      accountMatches &&
      !!scope &&
      "confirmedLocalTravelers" in scope &&
      Array.isArray(scope.confirmedLocalTravelers) &&
      scope.confirmedLocalTravelers.length > 0,
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
  let operations: {
    operationId: string;
    itemId: string;
    type: string;
    status: string;
    attempts: number;
    errorCode: string | null;
    failureCategory: string | null;
    nextAttemptAt: string | null;
    selection?: {
      valid: boolean;
      command?: string;
      admission?: string;
      intentState?: string | null;
      personCount?: number;
      participantsReady?: boolean;
    };
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
    const queue = await database.getAllAsync<{
      id: string;
      entity_id: string;
      operation_type: string;
      status: string;
      attempt_count: number;
      last_error_code: string | null;
      failure_category: string | null;
      next_attempt_at: string | null;
      trip_id: string;
      payload_json: string;
      intent_state: string | null;
    }>(
      "SELECT op.id,op.entity_id,op.operation_type,op.status,op.attempt_count,op.last_error_code,op.failure_category,op.next_attempt_at,op.trip_id,op.payload_json,i.state AS intent_state FROM sync_operations op JOIN local_trip_containers trip ON trip.id=op.trip_id AND trip.account_id=op.owner_user_id LEFT JOIN trip_core_pending_intents i ON i.account_id=op.owner_user_id AND i.operation_id=op.id AND i.trip_id=op.trip_id WHERE trip.account_id=? AND trip.created_at>=? AND op.operation_type IN ('CORE_V2_COMMAND','TRIP_NORMAL_READBACK','TRIP_PERSON_CLOUD_CREATE','TRIP_PERSON_CREATE') ORDER BY op.created_at DESC,op.rowid DESC LIMIT 12",
      scope.accountId,
      scope.normal.newTripsFrom,
    );
    await assertAccountRequestContext(actor, requireActiveUserId);
    const safeCode = (value: string | null) =>
      value && /^[A-Z0-9_]{1,80}$/.test(value) ? value : null;
    operations = queue.map((row) => ({
      operationId: row.id,
      itemId: row.entity_id,
      type: safeCode(row.operation_type) ?? "UNKNOWN",
      status: safeCode(row.status) ?? "UNKNOWN",
      attempts: row.attempt_count,
      errorCode: safeCode(row.last_error_code),
      failureCategory: safeCode(row.failure_category),
      nextAttemptAt:
        row.next_attempt_at && Number.isFinite(Date.parse(row.next_attempt_at))
          ? row.next_attempt_at
          : null,
    }));
    const { validateCoreCommand } = await import("@/domain/trip/tripCoreV2Commands");
    const { createTripPersonRepository } =
      await import("../repositories/tripPersonRepository");
    const { p1SharedParticipantsReady } =
      await import("./p1SharedParticipantQualification");
    for (let index = 0; index < queue.length; index++) {
      const row = queue[index];
      if (row.operation_type !== "CORE_V2_COMMAND") continue;
      operations[index].selection = { valid: false };
      try {
        if (!row.payload_json || row.payload_json.length > 65536) continue;
        const command = validateCoreCommand(JSON.parse(row.payload_json));
        const people = await createTripPersonRepository(
          database,
          requireActiveUserId,
        ).listTripPersons(row.trip_id);
        await assertAccountRequestContext(actor, requireActiveUserId);
        operations[index].selection = {
          valid: true,
          command: command.command,
          admission: command.admission.mode,
          intentState: safeCode(row.intent_state),
          personCount: people.length,
          participantsReady: p1SharedParticipantsReady(command, people),
        };
      } catch {
        await assertAccountRequestContext(actor, requireActiveUserId);
      }
    }
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
  return { gate, creates, operations, lastApiFailure: readLastApiFailure() };
}

export async function runNativeTripQaSync(input: { manualRetry?: boolean } = {}) {
  if (!hasNativeTripQaScope() && !isGeneralAccountCloudSyncEnabled()) return null;
  const actor = await captureAccountScope(requireActiveUserId);
  const parsed = readConfiguration(actor.accountId);
  if (!parsed) return null;
  const scope = Object.freeze(parsed);
  const enabled = () => scopeEnabled(scope);
  if (actor.accountId !== scope.accountId || !enabled()) return null;
  if (scope.normal) {
    const session = await readNormalDispatchSession(actor, enabled);
    if (stateFromSessionAndNetwork(session, true) !== "AUTHENTICATED_ONLINE") return null;
    if ("recoverUnsentLegacyTrips" in scope && scope.recoverUnsentLegacyTrips === true) {
      const { readLocalTripRepository } = await import("../repositories/tripRepository");
      const repository = await readLocalTripRepository();
      await assertAccountRequestContext(actor, requireActiveUserId);
      if (!enabled()) return null;
      await repository.enrollUnsentStructuredTrips(
        actor.accountId,
        scope.normal.newTripsFrom,
      );
      await assertAccountRequestContext(actor, requireActiveUserId);
      if (!enabled()) return null;
    }
    if (
      input.manualRetry === true &&
      "confirmedLocalTravelers" in scope &&
      Array.isArray(scope.confirmedLocalTravelers) &&
      scope.confirmedLocalTravelers.length
    ) {
      const { readCommittedLocalPrincipal } = await import("../auth/authRepository");
      const principal = await readCommittedLocalPrincipal();
      await assertAccountRequestContext(actor, requireActiveUserId);
      if (principal?.kind !== "ACCOUNT" || principal.accountId !== actor.accountId)
        throw Error("PERSON_ACCOUNT_PRINCIPAL_REQUIRED");
      const { readInitializedDatabase } = await import("../db/database");
      const { createTripPersonCloudCreateRepository } =
        await import("../repositories/tripPersonCloudCreateRepository");
      const database = await readInitializedDatabase();
      await assertAccountRequestContext(actor, requireActiveUserId);
      for (const confirmation of scope.confirmedLocalTravelers) {
        if (!enabled()) throw Error("TRIP_SYNC_PORT_CLOSED");
        await createTripPersonCloudCreateRepository(
          database,
          requireActiveUserId,
        ).confirmLocalShared({
          ...confirmation,
          dataOwnership: "CLOUD_SHARED_AUTHORED",
        });
        await assertAccountRequestContext(actor, requireActiveUserId);
      }
    }
    const { createNativeNormalTripSyncRunner } = await import("./tripNormalCoordinator");
    await assertAccountRequestContext(actor, requireActiveUserId);
    if (!enabled()) return null;
    const result = await createNativeNormalTripSyncRunner(
      {
        accountId: scope.accountId,
        newTripsFrom: scope.normal.newTripsFrom,
        ...("manualOnly" in scope && scope.manualOnly ? { manualOnly: true } : {}),
      },
      enabled,
      input.manualRetry === true,
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
