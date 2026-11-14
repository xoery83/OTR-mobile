import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { createCaptureSubmissionRepository } from "../repositories/captureSubmissionRepository";
import type { createLocalCaptureInboxRepository } from "../repositories/localCaptureInboxRepository";
import type { createCapturePhotoImportDecisionRepository } from "../repositories/capturePhotoImportDecisionRepository";
import {
  resolvePhotoImportDecision,
  photoImportPinSchema,
  isPhotoImportMaterial,
  isV3PhotoImportMaterial,
} from "@/domain/capture/photoImportRelevance";

type Dependencies = {
  getAccountId(): Promise<string>;
  submissions: Pick<ReturnType<typeof createCaptureSubmissionRepository>, "reopen">;
  captures: Pick<
    ReturnType<typeof createLocalCaptureInboxRepository>,
    "getForSourceHandoff"
  >;
  decisions: Pick<ReturnType<typeof createCapturePhotoImportDecisionRepository>, "read">;
};

// Read-only pre-paid fence. This never changes Capture assignment or consent.
export async function assertPngPhotoConsent(
  context: AccountRequestContext,
  jobId: string,
  dependencies: Dependencies,
  signal?: AbortSignal,
) {
  return (await assertPhotoConsent(context, jobId, dependencies, signal))[0]!;
}

export function assertV3PhotoConsent(
  context: AccountRequestContext,
  model: CaptureJobReadModel,
  dependencies: Dependencies,
  signal?: AbortSignal,
) {
  return assertPhotoConsent(context, model.batch.jobId, dependencies, signal, model);
}

async function assertPhotoConsent(
  context: AccountRequestContext,
  jobId: string,
  dependencies: Dependencies,
  signal?: AbortSignal,
  model?: CaptureJobReadModel,
) {
  const current = async () => {
    await assertAccountRequestContext(context, dependencies.getAccountId);
    if (signal?.aborted) throw Error("PHOTO_IMPORT_CANCELLED");
  };
  await current();
  const job = await dependencies.submissions.reopen(jobId, context);
  await current();
  const images = job.inputs.filter(
    (input) =>
      input.kind === "IMAGE" ||
      (input.kind === "FILE" &&
        (model
          ? input.declaredContentType?.startsWith("image/")
          : input.declaredContentType === "image/png")),
  );
  const tripPrior = job.batch.context.tripPrior?.id;
  const trip = tripPrior ?? model?.assignedTripId;
  if (
    job.batch.accountId !== context.accountId ||
    trip !== context.tripId ||
    (model
      ? job.batch.batchId !== model.batch.batchId ||
        job.inputs.length !== model.inputs.length ||
        job.inputs.length > 5 ||
        job.inputs.some((input, index) => {
          const expected = model.inputs[index];
          return (
            input.id !== expected.id ||
            input.revision !== expected.revision ||
            input.contentSha256 !== expected.contentSha256
          );
        })
      : images.length !== 1)
  )
    throw Error("UNIVERSAL_PHOTO_SCOPE_CHANGED");

  const validMaterial = model ? isV3PhotoImportMaterial : isPhotoImportMaterial;
  const approved = [];
  for (const input of images) {
    if (
      input.state !== "ACCEPTED" ||
      !validMaterial(input) ||
      (!model && input.declaredContentType !== "image/png") ||
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
      (capture.tripId !== context.tripId &&
        !(model && capture.tripId === null && tripPrior === context.tripId)) ||
      capture.payloadId !== input.payloadId ||
      capture.sha256 !== input.contentSha256 ||
      capture.byteCount !== input.contentByteCount ||
      !validMaterial(capture) ||
      capture.kind !== input.kind ||
      capture.declaredContentType !== input.declaredContentType
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
      mediaType: capture.declaredContentType,
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
    approved.push({ pin, revision: saved.revision });
  }
  for (const { pin, revision } of approved) {
    const latest = await dependencies.decisions.read(context, jobId, pin.inputId);
    await current();
    if (!latest || latest.status !== "CURRENT" || latest.revision !== revision)
      throw Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
  }
  return approved.map(({ pin }) => pin);
}
