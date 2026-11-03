import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { createLocalCaptureInboxRepository } from "../repositories/localCaptureInboxRepository";

type Dependencies = {
  captures: Pick<
    ReturnType<typeof createLocalCaptureInboxRepository>,
    "getForSourceHandoff"
  >;
  getAccountId(): Promise<string>;
  isCurrent(): boolean;
};

async function retainedCaptures(
  context: AccountRequestContext,
  job: CaptureJobReadModel,
  deps: Dependencies,
) {
  const current = async () => {
    await assertAccountRequestContext(context, deps.getAccountId);
    if (!deps.isCurrent() || context.accountId !== job.batch.accountId)
      throw Error("CAPTURE_CONTEXT_STALE");
  };
  await current();
  if (!job.allInputsAccepted || !job.inputs.length) throw Error("CAPTURE_NOT_ACCEPTED");
  const captures = [];
  for (const input of job.inputs) {
    if (!input.captureId || input.state !== "ACCEPTED")
      throw Error("CAPTURE_NOT_ACCEPTED");
    const { capture } = await deps.captures.getForSourceHandoff(input.captureId);
    await current();
    if (
      capture.accountId !== context.accountId ||
      capture.id !== input.captureId ||
      capture.payloadId !== input.payloadId ||
      capture.sha256 !== input.contentSha256 ||
      capture.byteCount !== input.contentByteCount
    )
      throw Error("CAPTURE_ORIGINAL_CHANGED");
    captures.push(capture);
  }
  return captures;
}

// A read projection of existing Capture attribution; frozen intake is never rewritten.
export async function readCaptureJobAssignment(
  context: AccountRequestContext,
  job: CaptureJobReadModel,
  deps: Dependencies,
) {
  const captures = await retainedCaptures(context, job, deps);
  const tripId = captures[0].tripId;
  return tripId && captures.every((capture) => capture.tripId === tripId) ? tripId : null;
}
