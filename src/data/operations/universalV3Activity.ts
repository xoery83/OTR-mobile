import { coreCanRead } from "@/domain/trip/tripCoreV2Mutation";
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
    else if (unavailable || states.includes("OUTCOME_UNKNOWN")) state = "uncertain";
    else if (saved === candidates.length) state = "complete";
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

export type V3ResultOperation = {
  candidateId: string;
  documentIds: string[];
  command: import("@/domain/trip/tripCoreV2Commands").CoreCommand;
  receipt: import("@/domain/trip/tripCoreV2Receipt").CoreReceipt | null;
};
export type V3SavedResult = {
  itemId: string;
  title: string;
  family: string;
  action?: "created" | "linked" | "updated";
  state: "complete" | "association" | "unknown" | "saving" | "failed" | "review";
  documentIds: string[];
  recordedAt?: string;
  businessDate?: string;
  businessTime?: string;
  place?: string;
};
// A batch's original commands/receipts identify outcomes; a replanned candidate is not a saved object.
export function projectUniversalV3Results(
  snapshot: import("../repositories/tripCoreV2Repository").CoreAcceptedSnapshot,
  operations: readonly V3ResultOperation[],
  observations: Readonly<Record<string, V3SaveObservation>>,
): V3SavedResult[] {
  const groups = new Map<string, V3ResultOperation[]>();
  for (const operation of operations) {
    if (
      operation.command.tripId !== snapshot.actor.tripId ||
      operation.command.target.kind !== "ITEM"
    )
      continue;
    if (
      operation.receipt &&
      (operation.receipt.tripId !== snapshot.actor.tripId ||
        operation.receipt.actorAccountId !== snapshot.actor.accountId ||
        operation.receipt.operationId !== operation.command.operationId)
    )
      continue;
    const id = operation.command.target.id;
    groups.set(id, [...(groups.get(id) ?? []), operation]);
  }
  const results: V3SavedResult[] = [];
  for (const [itemId, group] of groups) {
    const item = snapshot.graph.itinerary_events.find((item) => item.id === itemId);
    if (!item || !coreCanRead(snapshot.graph, snapshot.actor, "ITEM", item)) continue;
    const origin = snapshot.graph.itinerary_transport_endpoints.find(
      (endpoint) =>
        endpoint.event_id === itemId &&
        endpoint.trip_id === snapshot.actor.tripId &&
        endpoint.role === "ORIGIN",
    );
    const destination = snapshot.graph.itinerary_transport_endpoints.find(
      (endpoint) =>
        endpoint.event_id === itemId &&
        endpoint.trip_id === snapshot.actor.tripId &&
        endpoint.role === "DESTINATION",
    );
    const text = (...values: unknown[]) =>
      values.find((value): value is string => typeof value === "string" && !!value);
    const route = [
      text(origin?.authored_label, origin?.accepted_address, origin?.authored_text),
      text(
        destination?.authored_label,
        destination?.accepted_address,
        destination?.authored_text,
      ),
    ]
      .filter(Boolean)
      .join(" → ");
    const receipts = group.flatMap((row) => (row.receipt ? [row.receipt] : []));
    const successful = group.filter(
      (row) => row.receipt && ["APPLIED", "NO_CHANGE"].includes(row.receipt.outcome),
    );
    const created = successful.some((row) =>
      row.receipt!.result.created.some((ref) => ref.kind === "ITEM" && ref.id === itemId),
    );
    const updated = successful.some(
      (row) =>
        row.command.command === "SET_ITEM_TEXT" &&
        row.receipt!.result.changed.some(
          (ref) => ref.kind === "ITEM" && ref.id === itemId,
        ),
    );
    const documentIds = [...new Set(group.flatMap((row) => row.documentIds))].sort();
    const associated = documentIds.every((documentId) =>
      snapshot.graph.trip_item_document_links.some(
        (edge) =>
          edge.active && edge.item_id === itemId && edge.document_id === documentId,
      ),
    );
    const linked =
      associated &&
      successful.some((row) => row.command.command === "RECONCILE_ITEM_DOCUMENTS");
    const states = group.map((row) => observations[row.candidateId]);
    const state: V3SavedResult["state"] = receipts.some((r) => r.outcome === "REJECTED")
      ? "failed"
      : receipts.some((r) => r.outcome === "CONFLICT")
        ? "review"
        : states.includes("OUTCOME_UNKNOWN")
          ? "unknown"
          : !associated || !linked
            ? created || updated
              ? "association"
              : "saving"
            : group.some((row) => !row.receipt)
              ? "saving"
              : "complete";
    const recordedAt = successful
      .map((row) => row.receipt!.committedAt)
      .sort()
      .at(-1);
    results.push({
      itemId,
      title: String(item.title),
      family: String(item.experience_family),
      action: created ? "created" : updated ? "updated" : linked ? "linked" : undefined,
      state,
      documentIds: associated
        ? documentIds
        : documentIds.filter((id) =>
            snapshot.graph.trip_item_document_links.some(
              (edge) => edge.active && edge.item_id === itemId && edge.document_id === id,
            ),
          ),
      recordedAt,
      businessDate: text(item.start_local_date, origin?.local_date),
      businessTime: text(item.start_local_time, origin?.local_time),
      place: text(item.authored_label, item.accepted_address, item.authored_text, route),
    });
  }
  return results.sort(
    (a, b) =>
      (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") ||
      a.itemId.localeCompare(b.itemId),
  );
}

// Presentation of existing Batch facts; no persisted execution state or retry authority.
export function projectImportActivityRow(
  job: import("@/domain/capture/captureSubmission").CaptureJobReadModel,
  progress?: ReturnType<typeof projectUniversalV3Activity> & {
    resultCount?: number;
    failedCount?: number;
    updatedAt?: string;
  },
  task?: import("@/data/api/universalImportContracts").UniversalTaskActivity,
) {
  const sources = [
    ...new Set(
      job.batch.inputs.map((input) =>
        input.acquisitionSource === "files"
          ? ("FILES" as const)
          : input.acquisitionSource === "magic_input" ||
              input.acquisitionSource === "clipboard"
            ? ("TEXT" as const)
            : ("PHOTOS" as const),
      ),
    ),
  ];
  let status: "PROCESSING" | "WAITING" | "REVIEW" | "COMPLETED" | "FAILED" = "WAITING";
  let phase: ReturnType<typeof projectUniversalV3Activity>["state"] | "failed" =
    job.allInputsAccepted ? "uncertain" : "waiting";
  if (progress) {
    phase = progress.state;
    if (progress.failedCount) {
      status = "FAILED";
      phase = "failed";
    } else if (phase === "complete" || phase === "empty") status = "COMPLETED";
    else if (phase === "attention") status = "REVIEW";
    else if (["analyzing", "applying", "association", "checking"].includes(phase))
      status = "PROCESSING";
  } else if (task) {
    if (task.state === "FAILED") {
      status = "FAILED";
      phase = "failed";
    } else if (task.state === "PROCESSING") {
      status = "PROCESSING";
      phase = "analyzing";
    } else if (task.state === "RESULTS_READY") {
      status = "PROCESSING";
      phase = "checking";
    } else if (task.state === "UNKNOWN" || task.state === "STALE") phase = "uncertain";
  } else if (job.inputs.some((input) => input.state === "FAILED")) {
    status = "FAILED";
    phase = "failed";
  }
  return {
    batchId: job.batch.batchId,
    jobId: job.batch.jobId,
    sources,
    status,
    phase,
    resultCount: progress?.resultCount,
    at: progress?.updatedAt ?? task?.updatedAt ?? job.batch.createdAt,
  };
}

// Existing owning plan separates semantic decisions and ABSTAIN from development confirmation.
export function projectPlannedV3Activity(
  execution: Extract<UniversalV3ExecutionStatus, { state: "REVIEW_READY" }>,
  saves: Readonly<Record<string, V3SaveObservation>>,
  plan: readonly import("./universalV3Review").V3AdmissionRow[],
) {
  const active = plan.filter((row) => row.disposition !== "ABSTAIN");
  const observations: Record<string, V3SaveObservation> = {};
  for (const row of active) {
    const state = saves[row.candidate.candidateId];
    observations[row.candidate.candidateId] = row.members.some(
      (id) => saves[id] === "OUTCOME_UNKNOWN",
    )
      ? "OUTCOME_UNKNOWN"
      : row.disposition === "REVIEW" && state === "UNCONFIRMED"
        ? "REVIEW_REQUIRED"
        : state;
  }
  return projectUniversalV3Activity(
    { ...execution, candidates: active.map((row) => row.candidate) },
    observations,
  );
}

export function projectV3ActivityFacts(
  snapshot: import("../repositories/tripCoreV2Repository").CoreAcceptedSnapshot,
  operations: readonly V3ResultOperation[],
  observations: Readonly<Record<string, V3SaveObservation>>,
) {
  const scoped = operations.filter(
    (row) =>
      row.command.tripId === snapshot.actor.tripId &&
      row.command.target.kind === "ITEM" &&
      row.receipt?.tripId === snapshot.actor.tripId &&
      row.receipt.actorAccountId === snapshot.actor.accountId &&
      row.receipt.operationId === row.command.operationId,
  );
  const outcomes = projectUniversalV3Results(snapshot, scoped, observations);
  const rejected = scoped.filter((row) => row.receipt?.outcome === "REJECTED");
  const times = scoped.flatMap((row) => (row.receipt ? [row.receipt.committedAt] : []));
  return {
    resultCount: outcomes.filter((row) => row.state === "complete").length,
    failedCount: new Set(rejected.map((row) => row.command.target.id)).size,
    ...(times.length ? { updatedAt: times.sort().at(-1) } : {}),
  };
}
