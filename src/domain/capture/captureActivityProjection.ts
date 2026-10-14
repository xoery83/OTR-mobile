import type { CaptureJobReadModel } from "./captureSubmission";

export type CaptureActivityFact = Readonly<{
  id: string;
  kind: "SUBMISSION_RECORDED" | "INPUT_ACCEPTANCE_RECORDED";
  at: string;
  inputId: string | null;
}>;
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
