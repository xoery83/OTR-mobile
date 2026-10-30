import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { createCaptureSubmissionRepository } from "../repositories/captureSubmissionRepository";
import type { createLocalCaptureInboxRepository } from "../repositories/localCaptureInboxRepository";
import type { createCapturePhotoImportDecisionRepository } from "../repositories/capturePhotoImportDecisionRepository";
import {
  resolvePhotoImportDecision,
  photoImportPinSchema,
} from "@/domain/capture/photoImportRelevance";

// Read-only pre-paid fence. Source Start owns Trip assignment; this never rebinds consent.
export async function assertSinglePngPhotoConsent(
  context: AccountRequestContext,
  jobId: string,
  dependencies: {
    getAccountId(): Promise<string>;
    submissions: Pick<ReturnType<typeof createCaptureSubmissionRepository>, "reopen">;
    captures: Pick<
      ReturnType<typeof createLocalCaptureInboxRepository>,
      "getForSourceHandoff"
    >;
    decisions: Pick<
      ReturnType<typeof createCapturePhotoImportDecisionRepository>,
      "read"
    >;
  },
  signal?: AbortSignal,
) {
  const current = async () => {
    await assertAccountRequestContext(context, dependencies.getAccountId);
    if (signal?.aborted) throw Error("PHOTO_IMPORT_CANCELLED");
  };
  await current();
  const job = await dependencies.submissions.reopen(jobId, context);
  await current();
  const input = job.inputs[0];
  if (
    job.batch.accountId !== context.accountId ||
    job.batch.context.tripPrior?.id !== context.tripId ||
    job.inputs.length !== 1 ||
    !input ||
    input.state !== "ACCEPTED" ||
    input.kind !== "IMAGE" ||
    input.declaredContentType !== "image/png" ||
    !input.captureId ||
    !input.payloadId
  )
    throw Error("UNIVERSAL_PHOTO_SCOPE_CHANGED");
  const saved = await dependencies.decisions.read(context, jobId, input.id);
  await current();
  if (!saved || saved.status !== "CURRENT")
    throw Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
  const { capture } = await dependencies.captures.getForSourceHandoff(input.captureId);
  await current();
  if (
    capture.accountId !== context.accountId ||
    capture.id !== input.captureId ||
    capture.tripId !== context.tripId ||
    capture.payloadId !== input.payloadId ||
    capture.sha256 !== input.contentSha256 ||
    capture.byteCount !== input.contentByteCount ||
    capture.kind !== "IMAGE" ||
    capture.declaredContentType !== "image/png"
  )
    throw Error("UNIVERSAL_PHOTO_SCOPE_CHANGED");
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
    mediaType: "image/png",
  });
  let eligibility;
  try {
    eligibility = resolvePhotoImportDecision(saved.decision, pin);
  } catch {
    throw Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
  }
  if (eligibility === "KEEP_ORIGINAL") throw Error("UNIVERSAL_PHOTO_SKIPPED");
  if (eligibility !== "QUALIFY_ORIGINAL_IMAGE")
    throw Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
  const latest = await dependencies.decisions.read(context, jobId, input.id);
  await current();
  if (!latest || latest.status !== "CURRENT" || latest.revision !== saved.revision)
    throw Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
  return pin;
}
