import type { CaptureJobReadModel } from "./captureSubmission";

export type CaptureActivityFact = Readonly<{
  id: string;
  kind:
    | "SUBMISSION_RECORDED"
    | "INPUT_ACCEPTANCE_RECORDED"
    | "VALIDATION_QUEUED"
    | "VALIDATION_STARTED"
    | "VALIDATION_RETRY"
    | "VALIDATION_FAILED"
    | "INPUT_VALIDATED"
    | "LOCAL_INTERPRETATION_QUEUED"
    | "LOCAL_INTERPRETATION_STARTED"
    | "LOCAL_INTERPRETATION_RETRY"
    | "LOCAL_INTERPRETATION_FAILED"
    | "LOCAL_RESULT_RECORDED";
  at: string;
  inputId: string | null;
}>;
export function captureProcessingSummary(job: CaptureJobReadModel) {
  const latest = new Map<
    string,
    NonNullable<CaptureJobReadModel["processingEvents"]>[number]
  >();
  for (const event of job.processingEvents ?? []) {
    const previous = latest.get(event.inputId);
    if (!previous || event.sequence > previous.sequence) latest.set(event.inputId, event);
  }
  const states = [...latest.values()].map((event) => event.state);
  if (states.includes("FAILED")) return "VALIDATION_FAILED" as const;
  if (states.includes("RETRYABLE")) return "VALIDATION_RETRY" as const;
  if (states.includes("PROCESSING")) return "VALIDATION_STARTED" as const;
  if (states.includes("PENDING")) return "VALIDATION_QUEUED" as const;
  if (
    job.allInputsAccepted &&
    states.length === job.inputs?.length &&
    states.every((state) => state === "INPUT_VALIDATED")
  )
    return "INPUT_VALIDATED" as const;
  return null;
}
export function captureLocalInterpretationSummary(job: CaptureJobReadModel) {
  const latest = new Map<
    string,
    NonNullable<CaptureJobReadModel["localInterpretationEvents"]>[number]
  >();
  for (const event of job.localInterpretationEvents ?? []) {
    const prior = latest.get(event.inputId);
    if (!prior || event.sequence > prior.sequence) latest.set(event.inputId, event);
  }
  const states = [...latest.values()].map((event) => event.state);
  if (states.includes("FAILED")) return "LOCAL_INTERPRETATION_FAILED" as const;
  if (states.includes("RETRYABLE")) return "LOCAL_INTERPRETATION_RETRY" as const;
  if (states.includes("PROCESSING")) return "LOCAL_INTERPRETATION_STARTED" as const;
  if (states.includes("PENDING")) return "LOCAL_INTERPRETATION_QUEUED" as const;
  if (states.length && states.every((state) => state === "LOCAL_RESULT_RECORDED"))
    return "LOCAL_RESULT_RECORDED" as const;
  return null;
}
const instant = (at: string) => {
  const value = Date.parse(at);
  if (!Number.isFinite(value)) throw new Error("CAPTURE_ACTIVITY_INVALID_TIME");
  return value;
};

// Input must come from the normal, current Account-fenced C2 list/reopen reader.
// This selector performs no custody read and cannot grant Source/Trip authority.
export function projectCaptureActivity(
  job: CaptureJobReadModel,
  expectedAccountId: string,
) {
  const batch = job.batch;
  if (
    !expectedAccountId ||
    batch.accountId !== expectedAccountId ||
    batch.context.accountId !== expectedAccountId
  )
    throw new Error("CAPTURE_ACTIVITY_ACCOUNT_MISMATCH");
  const facts: CaptureActivityFact[] = [
    {
      id: `${batch.jobId}:submission`,
      kind: "SUBMISSION_RECORDED",
      at: batch.createdAt,
      inputId: null,
    },
  ];
  for (const item of job.inputs) {
    if (item.state === "ACCEPTED" && item.acceptedAt !== null)
      facts.push({
        id: `${batch.jobId}:input:${item.id}:acceptance`,
        kind: "INPUT_ACCEPTANCE_RECORDED",
        at: item.acceptedAt,
        inputId: item.id,
      });
  }
  const states = {
    PENDING: "VALIDATION_QUEUED",
    PROCESSING: "VALIDATION_STARTED",
    RETRYABLE: "VALIDATION_RETRY",
    FAILED: "VALIDATION_FAILED",
    INPUT_VALIDATED: "INPUT_VALIDATED",
  } as const;
  for (const event of job.processingEvents ?? []) {
    if (!job.inputs.some((item) => item.id === event.inputId))
      throw new Error("CAPTURE_ACTIVITY_PROCESSING_SCOPE");
    facts.push({
      id: `${batch.jobId}:processing:${event.sequence}`,
      kind: states[event.state],
      at: event.recordedAt,
      inputId: event.inputId,
    });
  }
  const localStates = {
    PENDING: "LOCAL_INTERPRETATION_QUEUED",
    PROCESSING: "LOCAL_INTERPRETATION_STARTED",
    RETRYABLE: "LOCAL_INTERPRETATION_RETRY",
    FAILED: "LOCAL_INTERPRETATION_FAILED",
    LOCAL_RESULT_RECORDED: "LOCAL_RESULT_RECORDED",
  } as const;
  for (const event of job.localInterpretationEvents ?? []) {
    if (!job.inputs.some((item) => item.id === event.inputId))
      throw new Error("CAPTURE_ACTIVITY_LOCAL_SCOPE");
    facts.push({
      id: `${batch.jobId}:local:${event.sequence}`,
      kind: localStates[event.state],
      at: event.recordedAt,
      inputId: event.inputId,
    });
  }
  facts.forEach((fact) => instant(fact.at));
  facts.sort(
    (a, b) =>
      instant(a.at) - instant(b.at) ||
      Number(a.kind !== "SUBMISSION_RECORDED") -
        Number(b.kind !== "SUBMISSION_RECORDED") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return Object.freeze({
    jobId: batch.jobId,
    batchId: batch.batchId,
    recordedAt: batch.createdAt,
    recordedClock: batch.context.clock,
    historyCoverage: "RECORDED_INTAKE_FACTS_ONLY" as const,
    localRetention: "NOT_ASSERTED_BY_SELECTOR" as const,
    recordedFacts: Object.freeze(facts.map((fact) => Object.freeze(fact))),
    counts: Object.freeze({ ...job.counts }),
    intakeSettled: job.intakeSettled,
    allInputsAccepted: job.allInputsAccepted,
    currentInputs: Object.freeze(
      job.inputs.map((item) =>
        Object.freeze({
          inputId: item.id,
          revision: item.revision,
          originalFilename: item.originalFilename,
          state: item.state,
          pendingReason: item.pendingReason,
          failureCode: item.failureCode,
          acceptanceRecordedAt: item.acceptedAt,
          continuesFromJobId: item.continuesFromJobId,
          continuedIn: Object.freeze(
            item.continuedIn.map((link) => Object.freeze({ ...link })),
          ),
        }),
      ),
    ),
    processingCapability: job.processing.capability,
    processingFinished: null,
    canonicalOutcomes: null,
    needsAttention: null,
    currentTripAttribution: null,
    canReopen: job.availableActions.canReopen,
    recoveryInputIds: Object.freeze([...job.availableActions.reacquireInputIds]),
    ordinaryResultsAddMore: false,
  });
}
