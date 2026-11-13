import type { UniversalV3ExecutionStatus } from "@/data/api/universalV3Contracts";
import type { openUniversalV3Review } from "@/data/operations/universalV3Review";

export type V3SaveObservation =
  | Awaited<ReturnType<Awaited<ReturnType<typeof openUniversalV3Review>>["check"]>>
  | "OUTCOME_UNKNOWN";
// Presentation only. Missing observations never count as confirmed saves.
export function projectUniversalV3Activity(
  execution: UniversalV3ExecutionStatus | null,
  saves: Readonly<Record<string, V3SaveObservation>> = {},
  unavailable = false,
  invalidFile = false,
) {
  const candidates = execution?.state === "REVIEW_READY" ? execution.candidates : [];
  const states = candidates.map((c) => saves[c.candidateId]);
  const saved = states.filter((s) => s === "VERIFIED").length;
  let state:
    | "waiting"
    | "analyzing"
    | "uncertain"
    | "checking"
    | "confirmation"
    | "applying"
    | "association"
    | "complete"
    | "attention"
    | "empty";
  if (invalidFile) state = "attention";
  else if (execution?.state === "OUTCOME_UNKNOWN") state = "uncertain";
  else if (execution?.state === "REVIEW_READY") {
    if (!candidates.length) state = "empty";
    else if (saved === candidates.length) state = "complete";
    else if (unavailable || states.includes("OUTCOME_UNKNOWN")) state = "uncertain";
    else if (
      states.some((s) => s === "REVIEW_REQUIRED" || s === "ITEM_VERIFIED_RELATION_REVIEW")
    )
      state = "attention";
    else if (states.some((s) => s === "ITEM_VERIFIED_RELATION_PENDING"))
      state = "association";
    else if (states.some((s) => s === "PENDING")) state = "applying";
    else if (states.some((s) => !s)) state = "checking";
    else state = "confirmation";
  } else if (unavailable) state = "waiting";
  else if (execution?.state === "PROCESSING") state = "analyzing";
  else state = "waiting";
  return { state, saved };
}

// Reuse the existing account-scoped queue diagnostic read; never claim or retry work.
export async function readV3UnknownCandidates(
  model: import("@/domain/capture/captureSubmission").CaptureJobReadModel,
  candidateIds: readonly string[],
) {
  const [
    { requireAdoptedUserId },
    { readInitializedDatabase },
    { readSyncOperationDiagnostics },
    { captureAccountRequestContext, assertAccountRequestContext },
    { universalP1Identity },
  ] = await Promise.all([
    import("../auth/authRepository"),
    import("../db/database"),
    import("../sync/syncOperationRepository"),
    import("../auth/accountRequestContext"),
    import("@/domain/trip/universalImportIdentity"),
  ]);
  const trip = model.batch.context.tripPrior?.id ?? model.assignedTripId;
  if (!trip) throw Error("UNIVERSAL_V3_REVIEW_CONTEXT");
  const context = await captureAccountRequestContext(trip, requireAdoptedUserId);
  if (context.accountId !== model.batch.accountId)
    throw Error("UNIVERSAL_V3_REVIEW_CONTEXT");
  const rows = await readSyncOperationDiagnostics(
    await readInitializedDatabase(),
    context.accountId,
    candidateIds.flatMap((id) =>
      ["item", "link", "flight-details"].map((kind) =>
        universalP1Identity(id, "local-first", kind),
      ),
    ),
  );
  await assertAccountRequestContext(context, requireAdoptedUserId);
  return new Set(
    candidateIds.filter((id) =>
      rows.some(
        (row) =>
          row.entityType === "TRIP_CORE_V2" &&
          row.operationType === "CORE_V2_COMMAND" &&
          row.status !== "COMPLETED" &&
          row.failureCategory === "UNKNOWN" &&
          ["item", "link", "flight-details"].some(
            (kind) => row.id === universalP1Identity(id, "local-first", kind),
          ),
      ),
    ),
  );
}
