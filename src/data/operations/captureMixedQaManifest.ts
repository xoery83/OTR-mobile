import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

// Temporary QA metadata only: no original contents, credentials or new intake.
export function projectMixedQaManifest(model: CaptureJobReadModel) {
  const tripId = model.assignedTripId ?? model.batch.context.tripPrior?.id;
  const expected = new Map([
    ["078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515", 42630],
    ["f58061aa535c7a5585c4c953890c5d387cf20656cca7129e36861beb82ee1758", 1676],
    ["d261e11d15303616d8ead07eb8d9b8ff2332d5242514ab10ca5f41abfaf62cb9", 92],
  ]);
  if (
    model.batch.accountId !== "1f3d7935-1bdc-4952-8d7f-0f72077368c1" ||
    tripId !== "8b5ceb55-b3c2-462a-9a15-59de91fdabe5" ||
    !model.batch.createdAt.startsWith("2026-11-03T21:18:03") ||
    !model.allInputsAccepted ||
    model.inputs.length !== 3 ||
    new Set(model.inputs.map((i) => i.contentSha256)).size !== 3 ||
    model.inputs.some(
      (i) => !i.contentSha256 || expected.get(i.contentSha256) !== i.contentByteCount,
    )
  )
    return null;
  return {
    accountId: model.batch.accountId,
    tripId,
    batchId: model.batch.batchId,
    jobId: model.batch.jobId,
    createdAt: model.batch.createdAt,
    inputs: model.inputs.map((i) => ({
      id: i.id,
      kind: i.kind,
      contentSha256: i.contentSha256,
      contentByteCount: i.contentByteCount,
      revision: i.revision,
      captureId: i.captureId,
      payloadId: i.payloadId,
      captureRevision: i.captureRevision,
    })),
  };
}
export async function exportMixedQaManifest(
  model: CaptureJobReadModel,
  isCurrent: () => boolean,
) {
  if (
    process.env.EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE !==
      "com.xoery.otrmobile.ipadqa" ||
    !isCurrent()
  )
    return;
  const manifest = projectMixedQaManifest(model);
  if (!manifest) return;
  const { File, Paths } = await import("expo-file-system");
  if (!isCurrent()) return;
  const file = new File(Paths.cache, "otr-mixed-qa-manifest.json");
  file.create({ overwrite: true });
  file.write(JSON.stringify(manifest));
}
