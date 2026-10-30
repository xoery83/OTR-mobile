import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { createCaptureSubmissionRepository } from "../repositories/captureSubmissionRepository";
import type { createLocalCaptureInboxRepository } from "../repositories/localCaptureInboxRepository";
import {
  photoImportPinSchema,
  resolvePhotoImportDecision,
} from "@/domain/capture/photoImportRelevance";
import { screenCapturePhotoRelevance } from "@/native/capturePhotoRelevance";

// Explicit read-only adapter. No default UI caller, decision store, Source or paid dispatch.
export async function screenUniversalPhotoInput(
  context: AccountRequestContext,
  jobId: string,
  inputId: string,
  dependencies: {
    getAccountId(): Promise<string>;
    submissions: Pick<ReturnType<typeof createCaptureSubmissionRepository>, "reopen">;
    captures: Pick<
      ReturnType<typeof createLocalCaptureInboxRepository>,
      "getForSourceHandoff"
    >;
  } & Parameters<typeof screenCapturePhotoRelevance>[1],
  signal?: AbortSignal,
) {
  const current = async () => {
    await assertAccountRequestContext(context, dependencies.getAccountId);
    if (signal?.aborted) throw new Error("PHOTO_IMPORT_CANCELLED");
  };
  async function read() {
    await current();
    const job = await dependencies.submissions.reopen(jobId, context);
    await current();
    const input = job.inputs.find((i) => i.id === inputId);
    if (
      job.batch.accountId !== context.accountId ||
      job.batch.jobId !== jobId ||
      !input ||
      input.state !== "ACCEPTED" ||
      input.kind !== "IMAGE" ||
      !input.captureId ||
      !input.payloadId
    )
      throw new Error("PHOTO_IMPORT_INPUT_UNAVAILABLE");
    const original = await dependencies.captures.getForSourceHandoff(input.captureId);
    await current();
    const capture = original.capture;
    if (
      capture.accountId !== context.accountId ||
      capture.kind !== "IMAGE" ||
      capture.id !== input.captureId ||
      capture.payloadId !== input.payloadId ||
      capture.sha256 !== input.contentSha256 ||
      capture.byteCount !== input.contentByteCount ||
      capture.declaredContentType !== input.declaredContentType
    )
      throw new Error("PHOTO_IMPORT_ORIGINAL_CHANGED");
    const pin = photoImportPinSchema.parse({
      accountId: context.accountId,
      batchId: job.batch.batchId,
      inputId: input.id,
      ordinal: input.ordinal,
      captureId: capture.id,
      captureRevision: capture.revision,
      payloadId: capture.payloadId,
      sha256: capture.sha256,
      byteCount: capture.byteCount,
      mediaType: input.declaredContentType,
    });
    return { pin, bytes: original.bytes };
  }
  const original = await read();
  const decision = await screenCapturePhotoRelevance(original, dependencies, signal);
  await current();
  const latest = await read();
  resolvePhotoImportDecision(decision, latest.pin);
  await current();
  return decision;
}
