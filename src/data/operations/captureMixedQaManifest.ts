import { z } from "zod";
import { PDF_CAPTURE_ORIGINAL_PROFILE } from "@/domain/trip/sourcePdfPreparation";
import { PNG_CAPTURE_ORIGINAL_PROFILE } from "@/domain/trip/sourcePngPreparation";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

// shortcut: fixed IMP-C01 synthetic batch only; remove after its receipt capture.
// Retained command proposals are not remote Source proof.
export function projectMixedQaManifest(model: CaptureJobReadModel) {
  const tripId = model.assignedTripId ?? model.batch.context.tripPrior?.id;
  const expected = new Map([
    [
      "1b4ade7a-f8bb-430b-8638-68adbc79e8fd",
      {
        kind: "FILE",
        contentSha256: "f58061aa535c7a5585c4c953890c5d387cf20656cca7129e36861beb82ee1758",
        contentByteCount: 1676,
        captureId: "ffe32198-f6e8-4019-9f67-f2dec542769e",
        payloadId: "eb3ab581-f10f-4a90-901b-cb82d29df2f4",
        captureRevision: 1,
        revision: 3,
      },
    ],
    [
      "19c4ddbe-e058-495c-a0d1-2b24bbae168b",
      {
        kind: "FILE",
        contentSha256: "078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515",
        contentByteCount: 42630,
        captureId: "dfe796f6-8559-4db1-a0a9-ca4e473e2155",
        payloadId: "ccda88fb-8fa5-4d92-b1db-e937d91ec64e",
        captureRevision: 1,
        revision: 3,
      },
    ],
    [
      "bcc754df-1493-4cb4-813e-379ca589402c",
      {
        kind: "TEXT",
        contentSha256: "d261e11d15303616d8ead07eb8d9b8ff2332d5242514ab10ca5f41abfaf62cb9",
        contentByteCount: 92,
        captureId: "2b114728-f8ea-4534-aa9c-3c8cbd928fbd",
        payloadId: "1c2114d2-1066-4067-8fcb-2fdbd9c6c3f0",
        captureRevision: 1,
        revision: 3,
      },
    ],
  ]);
  if (
    model.batch.accountId !== "1f3d7935-1bdc-4952-8d7f-0f72077368c1" ||
    tripId !== "8b5ceb55-b3c2-462a-9a15-59de91fdabe5" ||
    model.batch.batchId !== "39fe2a07-f946-47ff-b152-ebdfdaacda42" ||
    model.batch.jobId !== "8930950b-1722-4553-b937-fe3a6fd8709c" ||
    model.batch.createdAt !== "2026-11-03T21:18:03.028Z" ||
    !model.allInputsAccepted ||
    model.inputs.length !== 3 ||
    new Set(model.inputs.map((i) => i.contentSha256)).size !== 3 ||
    model.inputs.some((i) => {
      const pinned = expected.get(i.id);
      return (
        !pinned ||
        Object.entries(pinned).some(([key, value]) => i[key as keyof typeof i] !== value)
      );
    })
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
// Same local QA action, separate independent TXT fixture; never widens the mixed pins.
function projectTxtQaManifest(model: CaptureJobReadModel) {
  const tripId = model.assignedTripId ?? model.batch.context.tripPrior?.id;
  const input = model.inputs[0];
  if (
    process.env.EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE !==
      "com.xoery.otrmobile.ipadqa" ||
    model.batch.accountId !== "1f3d7935-1bdc-4952-8d7f-0f72077368c1" ||
    tripId !== "8b5ceb55-b3c2-462a-9a15-59de91fdabe5" ||
    model.batch.context.tripPrior?.id !== tripId ||
    model.batch.batchId === "39fe2a07-f946-47ff-b152-ebdfdaacda42" ||
    model.batch.jobId === "8930950b-1722-4553-b937-fe3a6fd8709c" ||
    !model.allInputsAccepted ||
    model.inputs.length !== 1 ||
    input.kind !== "FILE" ||
    input.acquisitionSource !== "files" ||
    input.state !== "ACCEPTED" ||
    input.originalFilename !== "lantern-qa-garden-walk.txt" ||
    input.declaredContentType !== "text/plain" ||
    input.contentByteCount !== 77 ||
    input.contentSha256 !==
      "54ad166d421325cb12dad3fee8ebfe2d64a81e2980eef2e9115abde87254d647" ||
    !z
      .array(z.uuid())
      .length(5)
      .safeParse([
        model.batch.batchId,
        model.batch.jobId,
        input.id,
        input.captureId,
        input.payloadId,
      ]).success ||
    !z.iso.datetime().safeParse(model.batch.createdAt).success ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1 ||
    !Number.isSafeInteger(input.captureRevision) ||
    !input.captureRevision ||
    input.captureRevision < 1
  )
    return null;
  return {
    accountId: model.batch.accountId,
    tripId,
    batchId: model.batch.batchId,
    jobId: model.batch.jobId,
    createdAt: model.batch.createdAt,
    inputs: [
      {
        id: input.id,
        kind: input.kind,
        contentSha256: input.contentSha256,
        contentByteCount: input.contentByteCount,
        revision: input.revision,
        captureId: input.captureId,
        payloadId: input.payloadId,
        captureRevision: input.captureRevision,
      },
    ],
  };
}
function projectLocalQaManifest(model: CaptureJobReadModel) {
  return projectMixedQaManifest(model) ?? projectTxtQaManifest(model);
}
export async function exportMixedQaManifest(
  model: CaptureJobReadModel,
  isCurrent: () => boolean,
  readPins = readDefaultMixedQaSourcePins,
) {
  if (
    process.env.EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE !==
      "com.xoery.otrmobile.ipadqa" ||
    !isCurrent()
  )
    return;
  const manifest = projectLocalQaManifest(model);
  if (!manifest) return;
  const sourcePins = await readPins(model);
  if (!isCurrent() || !matchesMixedQaPins(manifest, sourcePins)) return;
  const { File, Paths } = await import("expo-file-system");
  if (!isCurrent()) return;
  const file = new File(
    Paths.cache,
    manifest.inputs.length === 1
      ? "otr-txt-qa-manifest.json"
      : "otr-mixed-qa-manifest.json",
  );
  file.create({ overwrite: true });
  file.write(JSON.stringify({ ...manifest, sourcePins }));
}

function matchesMixedQaPins(
  manifest: NonNullable<ReturnType<typeof projectMixedQaManifest>>,
  sourcePins: Awaited<ReturnType<typeof readDefaultMixedQaSourcePins>>,
) {
  return !(
    sourcePins.accountId !== manifest.accountId ||
    sourcePins.tripId !== manifest.tripId ||
    sourcePins.batchId !== manifest.batchId ||
    sourcePins.jobId !== manifest.jobId ||
    sourcePins.createdAt !== manifest.createdAt ||
    sourcePins.inputs.length !== manifest.inputs.length ||
    new Set(sourcePins.inputs.map((input) => input.inputId)).size !==
      manifest.inputs.length ||
    sourcePins.inputs.some(
      (input) =>
        !manifest.inputs.some(
          (original) =>
            original.id === input.inputId &&
            original.contentSha256 === input.sha256 &&
            original.contentByteCount === input.byteCount &&
            original.kind === input.kind &&
            original.revision === input.inputRevision &&
            original.captureId === input.captureId &&
            original.payloadId === input.payloadId &&
            original.captureRevision === input.intakeCaptureRevision &&
            input.currentCaptureRevision === input.captureRevision &&
            (input.captureTripId === null || input.captureTripId === manifest.tripId) &&
            (original.captureRevision === input.captureRevision ||
              (original.captureRevision === 1 &&
                input.captureRevision === 2 &&
                input.captureTripId === manifest.tripId &&
                (input.sourceState === "PREPARED" || input.sourceState === "ADMITTED") &&
                !!input.bindingId &&
                !!input.queueOperationId &&
                !!input.sourceCommandPin &&
                !!input.sourceCommand &&
                input.bindingCas?.captureRevision === 2)),
        ),
    )
  );
}

async function readDefaultMixedQaSourcePins(model: CaptureJobReadModel) {
  const [auth, scope, db, inbox, submissions, admission, original] = await Promise.all([
    import("../auth/authRepository"),
    import("../auth/accountRequestContext"),
    import("../db/database"),
    import("../repositories/defaultLocalCaptureInboxRepository"),
    import("./defaultCaptureSubmission"),
    import("../repositories/captureSourceAdmissionRepository"),
    import("./universalOriginalBatch"),
  ]);
  const tripId = model.assignedTripId ?? model.batch.context.tripPrior?.id;
  if (!tripId) throw Error("UNIVERSAL_CAPTURE_BATCH_NOT_READY");
  const context = await scope.captureAccountRequestContext(
    tripId,
    auth.requireActiveUserId,
  );
  if (context.accountId !== model.batch.accountId)
    throw Error("UNIVERSAL_CAPTURE_INPUT_CHANGED");
  const database = await db.openDatabase();
  const captures = await inbox.getDefaultLocalCaptureInboxRepository();
  const repository = admission.createCaptureSourceAdmissionRepository(
    database,
    auth.requireActiveUserId,
    {
      ...inbox.captureStorageDependencies,
      newId: () => {
        throw Error("QA_SOURCE_PINS_READ_ONLY");
      },
      handoff: captures.getForSourceHandoff,
      readSelectedMaterial: async () => null,
    },
  );
  const pins = await original.readUniversalOriginalPins(context, model.batch.jobId, {
    includeSourceCommands: true,
    sources: repository,
    captures,
    submissions: await submissions.getDefaultCaptureSubmissionRepository(),
    getAccountId: auth.requireActiveUserId,
    hash: inbox.captureStorageDependencies.sha256,
    pendingPdfProfile: PDF_CAPTURE_ORIGINAL_PROFILE,
    pendingPngProfile: PNG_CAPTURE_ORIGINAL_PROFILE,
  });
  await scope.assertAccountRequestContext(context, auth.requireActiveUserId);
  return pins;
}

export function canPrepareMixedQaSourceProposals(model: CaptureJobReadModel) {
  return (
    process.env.EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE ===
      "com.xoery.otrmobile.ipadqa" && projectLocalQaManifest(model) !== null
  );
}

export async function prepareMixedQaSourceProposals(
  model: CaptureJobReadModel,
  isCurrent: () => boolean,
  prepare = async (job: CaptureJobReadModel, current: () => boolean) => {
    const [auth, scope, api] = await Promise.all([
      import("../auth/authRepository"),
      import("../auth/accountRequestContext"),
      import("./defaultUniversalOriginalSource"),
    ]);
    const tripId = job.assignedTripId ?? job.batch.context.tripPrior?.id;
    if (!tripId) throw Error("QA_SOURCE_PREPARE_SCOPE");
    const context = await scope.captureAccountRequestContext(
      tripId,
      auth.requireActiveUserId,
    );
    if (context.accountId !== job.batch.accountId || !current())
      throw Error("QA_SOURCE_PREPARE_SCOPE");
    await api.prepareDefaultUniversalLocalSourceProposals(context, job, {
      getAccountId: auth.requireActiveUserId,
      assertCurrent: () => {
        if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
      },
      pendingPdfProfile: PDF_CAPTURE_ORIGINAL_PROFILE,
      pendingPngProfile: PNG_CAPTURE_ORIGINAL_PROFILE,
    });
  },
  readPins = readDefaultMixedQaSourcePins,
) {
  if (!isCurrent() || !canPrepareMixedQaSourceProposals(model))
    throw Error("QA_SOURCE_PREPARE_SCOPE");
  const manifest = projectLocalQaManifest(model)!;
  const pins = await readPins(model);
  if (!isCurrent() || !matchesMixedQaPins(manifest, pins))
    throw Error("QA_SOURCE_PREPARE_SCOPE");
  if (
    pins.inputs.some(
      (input) =>
        !["SOURCE_OPERATION_NOT_PREPARED", "PREPARED", "ADMITTED"].some(
          (state) => input.sourceState === state,
        ),
    )
  )
    throw Error("QA_SOURCE_PREPARE_UNCERTAIN");
  if (
    pins.inputs.every(
      (input) => input.sourceState === "PREPARED" || input.sourceState === "ADMITTED",
    )
  )
    return;
  await prepare(model, isCurrent);
  if (!isCurrent()) throw Error("UNIVERSAL_CAPTURE_STALE");
}
