import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { createCaptureSubmissionRepository } from "../repositories/captureSubmissionRepository";
import type { createLocalCaptureInboxRepository } from "../repositories/localCaptureInboxRepository";
import type { CaptureCustodyTransport } from "../api/captureCustodyTransport";
import {
  captureCustodyBindingSchema,
  captureCustodyMedia,
  captureCustodyBindingJson,
  assertCaptureCustodyBytes,
} from "@/domain/capture/captureCustody";

export function createCaptureCustodyOperation(deps: {
  submissions: Pick<ReturnType<typeof createCaptureSubmissionRepository>, "reopen">;
  inbox: Pick<
    ReturnType<typeof createLocalCaptureInboxRepository>,
    "getForSourceHandoff"
  >;
  transport: CaptureCustodyTransport;
  getAccountId(): Promise<string>;
}) {
  async function original(
    context: AccountRequestContext,
    jobId: string,
    inputId: string,
  ) {
    if (context.tripId !== "") throw new Error("CAPTURE_CUSTODY_SCOPE_INVALID");
    await assertAccountRequestContext(context, deps.getAccountId);
    const job = await deps.submissions.reopen(jobId, context);
    const input = job.inputs.find((item) => item.id === inputId);
    if (!input || input.state !== "ACCEPTED" || !input.captureId)
      throw new Error("CAPTURE_CUSTODY_INPUT_UNAVAILABLE");
    const { capture, bytes } = await deps.inbox.getForSourceHandoff(input.captureId);
    await assertAccountRequestContext(context, deps.getAccountId);
    if (
      capture.accountId !== context.accountId ||
      capture.tripId !== null ||
      capture.revision !== input.captureRevision ||
      capture.payloadId !== input.payloadId ||
      capture.sha256 !== input.contentSha256 ||
      capture.byteCount !== input.contentByteCount
    )
      throw new Error("CAPTURE_CUSTODY_INPUT_STALE");
    const binding = captureCustodyBindingSchema.parse({
      version: 1,
      accountId: context.accountId,
      batchId: job.batch.batchId,
      jobId,
      inputId,
      inputRevision: input.revision,
      captureId: capture.id,
      payloadId: capture.payloadId,
      captureRevision: capture.revision,
      sha256: capture.sha256,
      byteCount: capture.byteCount,
      mediaType: captureCustodyMedia(bytes),
    });
    return { binding, bytes };
  }
  async function run(
    context: AccountRequestContext,
    jobId: string,
    inputId: string,
    upload: boolean,
  ) {
    const before = await original(context, jobId, inputId);
    const bytes = upload
      ? await deps.transport.put(context, before.binding, before.bytes)
      : await deps.transport.read(context, before.binding);
    if (bytes) assertCaptureCustodyBytes(before.binding, bytes);
    const after = await original(context, jobId, inputId);
    if (
      captureCustodyBindingJson(before.binding) !==
      captureCustodyBindingJson(after.binding)
    )
      throw new Error("CAPTURE_CUSTODY_INPUT_STALE");
    return bytes;
  }
  return {
    put: (context: AccountRequestContext, jobId: string, inputId: string) =>
      run(context, jobId, inputId, true),
    recover: (context: AccountRequestContext, jobId: string, inputId: string) =>
      run(context, jobId, inputId, false),
  };
}
