// QA observation only. Never an OTP eligibility rule or an Adoption qualification.
import { readCommittedLocalPrincipal } from "../auth/authRepository";
import { getAccountGeneration } from "../auth/accountGeneration";
import { guestTripDraftInventory } from "../auth/guestTripDraftInventory";
import { guestP1DraftInventory } from "../auth/guestP1DraftInventory";
import { createGuestRecoveryFiles } from "../auth/guestRecoveryFiles";
import type { GuestLocalWorkspace } from "../auth/guestLocalWorkspace";
import type { GuestDraftScope } from "../auth/guestDraftInventory";
import type { GuestExternalInventory } from "../auth/guestDatasetCensus";

// The caller must retain an owner handle from NORMAL bootstrap. No opener is a dependency.
type GuestOwner = Pick<
  GuestLocalWorkspace,
  "scope" | "readCensus" | "readCaptureInventory"
>;
type DraftReader = typeof guestTripDraftInventory.readParticipantCensus;
export type NativeQaAccountCoverage = {
  coverage: "ACCOUNT_NAMESPACE_QUEUE_AND_CORE_METADATA";
  status: "COMPLETE" | "UNKNOWN";
  reason?: string;
  coreIntentRows: number | null;
  unfinishedOperations: number | null;
  syncOperations?: import("../sync/syncOperationRepository").SyncQueueCensusV1;
  coreIntents?: import("../repositories/corePendingIntentCensus").CorePendingIntentCensus;
};
type Dependencies = {
  readPrincipal?: typeof readCommittedLocalPrincipal;
  generation?: typeof getAccountGeneration;
  readBootstrappedGuestOwner(): Promise<GuestOwner | null>;
  tripDrafts?: DraftReader;
  p1Drafts?: typeof guestP1DraftInventory.readParticipantCensus;
  readRecoveryAttempts?: (scope: GuestDraftScope) => Promise<readonly string[]>;
  readQualifiedExternalInventory?: (
    scope: GuestDraftScope,
  ) => Promise<GuestExternalInventory>;
  readAccountCoverage?: () => Promise<NativeQaAccountCoverage>;
};
const unknown = (reason: string) => ({ status: "UNKNOWN" as const, reason });
const count = (value: number | null) =>
  value !== null && Number.isSafeInteger(value) && value >= 0;
const sameScope = (a: GuestDraftScope, b: GuestDraftScope) =>
  a.kind === b.kind && a.localId === b.localId && a.generation === b.generation;

export function createNativeQaPreOtpCensus(deps: Dependencies) {
  const principal = deps.readPrincipal ?? readCommittedLocalPrincipal;
  const generation = deps.generation ?? getAccountGeneration;
  const readTripDrafts = deps.tripDrafts ?? guestTripDraftInventory.readParticipantCensus;
  const readP1Drafts = deps.p1Drafts ?? guestP1DraftInventory.readParticipantCensus;
  const recovery =
    deps.readRecoveryAttempts ??
    ((scope) => createGuestRecoveryFiles(scope.localId).listAttempts());
  return async () => {
    const startGeneration = generation();
    try {
      const before = await principal();
      if (generation() !== startGeneration) return unknown("SCOPE_CHANGED");
      if (before?.kind !== "GUEST") return unknown("CURRENT_PRINCIPAL_NOT_GUEST");
      const scope: GuestDraftScope = Object.freeze({
        ...before,
        generation: startGeneration,
      });
      const check = async () => {
        const current = await principal();
        if (
          generation() !== startGeneration ||
          current?.kind !== "GUEST" ||
          current.localId !== scope.localId
        )
          throw Error("NATIVE_QA_CENSUS_SCOPE_CHANGED");
      };
      const owner = await deps.readBootstrappedGuestOwner();
      await check();
      if (!owner) return unknown("BOOTSTRAPPED_GUEST_OWNER_UNAVAILABLE");
      if (!sameScope(scope, owner.scope))
        return unknown("BOOTSTRAPPED_GUEST_OWNER_SCOPE_MISMATCH");
      const trip = await readTripDrafts(scope);
      await check();
      const p1 = await readP1Drafts(scope);
      await check();
      const external = await deps.readQualifiedExternalInventory?.(scope);
      await check();
      const dataset = await owner.readCensus(external);
      await check();
      const capture = await owner.readCaptureInventory();
      await check();
      const attempts = await recovery(scope);
      await check();
      let account: NativeQaAccountCoverage | undefined;
      try {
        account = await deps.readAccountCoverage?.();
      } catch (error) {
        const code =
          error instanceof Error && /^[A-Z0-9_]{1,96}$/.test(error.message)
            ? error.message
            : "OWNER_READ_FAILED";
        account = {
          coverage: "ACCOUNT_NAMESPACE_QUEUE_AND_CORE_METADATA",
          status: "UNKNOWN",
          reason: code,
          unfinishedOperations: null,
          coreIntentRows: null,
        };
      }
      // A failed Account owner does not erase measured Guest facts; a scope change still does.
      await check();
      const afterDataset = await owner.readCensus(external);
      await check();
      const afterTrip = await readTripDrafts(scope);
      await check();
      const afterP1 = await readP1Drafts(scope);
      await check();
      if (
        ![trip, p1, afterTrip, afterP1, dataset, afterDataset, capture].every((x) =>
          sameScope(scope, x.scope),
        )
      )
        return unknown("OWNER_SCOPE_MISMATCH");
      if (
        trip.registrationVersion !== afterTrip.registrationVersion ||
        p1.registrationVersion !== afterP1.registrationVersion ||
        JSON.stringify(dataset.tables) !== JSON.stringify(afterDataset.tables)
      )
        return unknown("OWNER_OBSERVATION_CHANGED");
      const tables = dataset.tables.filter(
        (table) => !["schema_migrations", "sqlite_sequence"].includes(table.name),
      );
      const values = [
        ...tables.map((t) => t.rows),
        trip.registeredParticipantCount,
        p1.registeredParticipantCount,
        attempts.length,
        capture.totalPayloads,
        capture.orphanPayloads,
      ];
      if (!values.every(count)) return unknown("INVALID_OWNER_COUNTS");
      const coverage = {
        guestTables: {
          status: "COMPLETE" as const,
          nonBookkeepingRows: tables.reduce((sum, t) => sum + t.rows, 0),
        },
        tripDraftRegistrations: trip,
        p1DraftRegistrations: p1,
        capture: {
          coverage: capture.coverage,
          status: capture.status,
          totalPayloads: capture.totalPayloads,
          orphanPayloads: capture.orphanPayloads,
        },
        recovery: { status: "COMPLETE" as const, attempts: attempts.length },
        externalFilesAndDrafts: {
          status:
            dataset.totals.files !== null &&
            dataset.totals.fileBytes !== null &&
            dataset.totals.liveDrafts !== null
              ? ("COMPLETE" as const)
              : ("UNKNOWN" as const),
          files: dataset.totals.files,
          fileBytes: dataset.totals.fileBytes,
          liveDrafts: dataset.totals.liveDrafts,
        },
        account: account ?? {
          coverage: "ACCOUNT_NAMESPACE_QUEUE_AND_CORE_METADATA" as const,
          status: "UNKNOWN" as const,
          coreIntentRows: null,
          unfinishedOperations: null,
        },
      };
      // Suitability for Adoption is NOT the same as QA-empty. Inspect actual measured counts.
      const optionalCounts = [
        dataset.totals.files,
        dataset.totals.fileBytes,
        dataset.totals.liveDrafts,
        coverage.account.coreIntentRows,
        coverage.account.unfinishedOperations,
      ];
      const nonempty = [...values, ...optionalCounts].some((n) => count(n) && n! > 0);
      const complete =
        dataset.blockers.length === 0 &&
        capture.status === "CAPTURE_COMPLETE" &&
        coverage.externalFilesAndDrafts.status === "COMPLETE" &&
        coverage.account.status === "COMPLETE" &&
        coverage.account.coverage === "ACCOUNT_NAMESPACE_QUEUE_AND_CORE_METADATA" &&
        optionalCounts.every(count);
      await check();
      return {
        status: nonempty
          ? ("STOP_NONEMPTY" as const)
          : complete
            ? ("OBSERVED_EMPTY_QA_ONLY" as const)
            : ("UNKNOWN" as const),
        reason: nonempty
          ? "MEASURED_NONEMPTY"
          : complete
            ? "ALL_OWNER_COVERAGE_REPORTED_EMPTY"
            : "INCOMPLETE_OWNER_COVERAGE",
        scope,
        coverage,
        blockers: [...dataset.blockers],
        authOrAdoptionAuthority: false as const,
      };
    } catch (error) {
      // Never leak previous-principal observations or private error bodies on a failed/stale read.
      const code =
        error instanceof Error && /^[A-Z0-9_]{1,96}$/.test(error.message)
          ? error.message
          : "OWNER_READ_FAILED";
      return unknown(code);
    }
  };
}

// Existing DEV diagnostics may call this explicitly; never called by normal OTP.
// Each getter below borrows an existing initialized handle; none opens or migrates.
export async function readCurrentNativeQaPreOtpCensus() {
  const [
    { readInitializedGuestOwner },
    { readInitializedDatabase },
    { readUnfinishedSyncQueueCensus },
    { readCorePendingIntentCensus },
  ] = await Promise.all([
    import("../auth/guestLocalWorkspace"),
    import("../db/database"),
    import("../sync/syncOperationRepository"),
    import("../repositories/corePendingIntentCensus"),
  ]);
  return createNativeQaPreOtpCensus({
    readBootstrappedGuestOwner: readInitializedGuestOwner,
    async readAccountCoverage() {
      const database = await readInitializedDatabase();
      const queue = await readUnfinishedSyncQueueCensus(database);
      const core = await readCorePendingIntentCensus(database);
      return {
        coverage: "ACCOUNT_NAMESPACE_QUEUE_AND_CORE_METADATA",
        status: "COMPLETE",
        unfinishedOperations: queue.allNonCompletedRows,
        coreIntentRows: core.total, // All observed Core rows, including reconciled APPLIED; not dispatch eligibility.
        syncOperations: queue,
        coreIntents: core,
      };
    },
  })();
}

// UI allowlist: no principal IDs, registry scope, tokens, source text or raw errors.
export function projectNativeQaPreOtpCensus(
  value: Awaited<ReturnType<ReturnType<typeof createNativeQaPreOtpCensus>>>,
) {
  const reasons = new Set([
    "SCOPE_CHANGED",
    "CURRENT_PRINCIPAL_NOT_GUEST",
    "BOOTSTRAPPED_GUEST_OWNER_UNAVAILABLE",
    "BOOTSTRAPPED_GUEST_OWNER_SCOPE_MISMATCH",
    "OWNER_SCOPE_MISMATCH",
    "OWNER_OBSERVATION_CHANGED",
    "INVALID_OWNER_COUNTS",
    "MEASURED_NONEMPTY",
    "ALL_OWNER_COVERAGE_REPORTED_EMPTY",
    "INCOMPLETE_OWNER_COVERAGE",
    "NATIVE_QA_CENSUS_SCOPE_CHANGED",
    "GUEST_DRAFT_HANDOFF_ACTIVE",
    "GUEST_DRAFT_CENSUS_CHANGED",
    "GUEST_LOCAL_SCOPE_CHANGED",
    "GUEST_LOCAL_SCOPE_REQUIRED",
    "DATABASE_NOT_INITIALIZED",
    "OWNER_READ_FAILED",
  ]);
  return {
    status: value.status,
    reason: reasons.has(value.reason) ? value.reason : "OWNER_READ_FAILED",
    principalKind: "scope" in value ? value.scope.kind : "UNKNOWN",
    generationStable: "scope" in value ? true : null,
    observedGeneration: "scope" in value ? value.scope.generation : null,
    counts:
      "coverage" in value
        ? {
            guestRows: value.coverage.guestTables.nonBookkeepingRows,
            registeredTripEditors:
              value.coverage.tripDraftRegistrations.registeredParticipantCount,
            registeredP1OrP3Editors:
              value.coverage.p1DraftRegistrations.registeredParticipantCount,
            capturePayloads: value.coverage.capture.totalPayloads,
            recoveryAttempts: value.coverage.recovery.attempts,
            externalFiles: value.coverage.externalFilesAndDrafts.files,
            externalFileBytes: value.coverage.externalFilesAndDrafts.fileBytes,
            liveDrafts: value.coverage.externalFilesAndDrafts.liveDrafts,
            accountNonCompletedSyncOperations:
              value.coverage.account.unfinishedOperations,
            accountCoreIntentRows: value.coverage.account.coreIntentRows,
          }
        : null,
    coverage:
      "coverage" in value
        ? {
            guestTables: value.coverage.guestTables.status,
            capture: value.coverage.capture.coverage,
            externalFilesAndDrafts: value.coverage.externalFilesAndDrafts.status,
            account: value.coverage.account.status,
            accountReason: value.coverage.account.reason
              ? reasons.has(value.coverage.account.reason)
                ? value.coverage.account.reason
                : "OWNER_READ_FAILED"
              : null,
          }
        : null,
  };
}
