import { PNG_CAPTURE_ORIGINAL_PROFILE } from "@/domain/trip/sourcePngPreparation";
import { readPendingPngOriginalIntake } from "@/native/pendingPngOriginal";
import { assertDefaultUniversalPhotoConsent } from "./defaultUniversalPhotoConsent";
import {
  assertCaptureCustodyBytes,
  type CaptureMaterialBinding,
} from "@/domain/capture/captureCustody";
import { PDF_CAPTURE_ORIGINAL_PROFILE } from "@/domain/trip/sourcePdfPreparation";
import { prepareAdmittedPdfOriginal } from "./universalPdfOriginalPreparation";
import { isUnsupportedUniversalInputMetadata } from "@/domain/capture/universalInputSupport";
import { openDatabase } from "../db/database";
import {
  captureStorageDependencies,
  getDefaultLocalCaptureInboxRepository,
} from "../repositories/defaultLocalCaptureInboxRepository";
import { getDefaultCaptureSubmissionRepository } from "./defaultCaptureSubmission";
import { createCaptureSourceAdmissionRepository } from "../repositories/captureSourceAdmissionRepository";
import { createTripImportAdmissionRepository } from "../repositories/tripImportAdmissionRepository";
import { createUniversalOriginalSourceTransport } from "../api/universalOriginalSourceTransport";
import { createTripPublicationCatalogTransport } from "../api/tripPublicationCatalogTransport";
import { createPublicationCatalogNativeFetch } from "@/native/publicationCatalogReceive";
import { UTF8_TEXT_FILE_PROFILE } from "@/domain/capture/utf8TextFile";
import {
  isEnabledPng,
  isEnabledPdf,
  recoverUniversalOriginalPlans,
  runUniversalOriginalBatch,
  prepareUniversalOriginalBatch,
} from "./universalOriginalBatch";
import type { AccountRequestContext } from "../auth/accountRequestContext";
import type {
  UniversalBatchPrepare,
  UniversalBatchPrepared,
} from "../api/universalImportContracts";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

type LocalProposalOptions = {
  getAccountId(): Promise<string>;
  assertCurrent(): void;
  pendingPdfProfile?: typeof PDF_CAPTURE_ORIGINAL_PROFILE;
  pendingPngProfile?: typeof PNG_CAPTURE_ORIGINAL_PROFILE;
};
async function createLocalSourceDependencies(
  model: CaptureJobReadModel,
  options: LocalProposalOptions,
) {
  const database = await openDatabase();
  const captures = await getDefaultLocalCaptureInboxRepository();
  const submissions = await getDefaultCaptureSubmissionRepository();
  const { sha256, now, newId } = captureStorageDependencies;
  const hasPng = model.inputs.some((input) =>
    isEnabledPng(input, options.pendingPngProfile),
  );
  const pdfVerifier =
    options.pendingPdfProfile === PDF_CAPTURE_ORIGINAL_PROFILE
      ? (
          await import("@/native/pendingPdfOriginal")
        ).createPendingPdfOriginalFormatVerifier()
      : undefined;
  const sources = createCaptureSourceAdmissionRepository(database, options.getAccountId, {
    sha256,
    now,
    newId,
    handoff: captures.getForSourceHandoff,
    readSelectedMaterial: async () => null,
    utf8FileProfile: UTF8_TEXT_FILE_PROFILE,
    pendingPdfProfile: options.pendingPdfProfile,
    ...(hasPng ? { pendingPngProfile: options.pendingPngProfile } : {}),
    verifyBinary: async (bytes, mimeType, capture) => {
      if (mimeType === "image/png" && hasPng)
        return { ...readPendingPngOriginalIntake(bytes), payloadSha256: capture.sha256 };
      if (mimeType === "application/pdf" && pdfVerifier) {
        // Reuse the repository-projected PDFKit result only for the exact retained original.
        const input = model.inputs.find(
          (i) =>
            i.state === "ACCEPTED" &&
            isEnabledPdf(i, options.pendingPdfProfile) &&
            i.captureId === capture.id &&
            i.payloadId === capture.payloadId &&
            i.contentSha256 === capture.sha256 &&
            i.contentByteCount === capture.byteCount,
        );
        const parsed = model.localInterpretationResults?.some(
          (result) =>
            input &&
            model.batch.accountId === capture.accountId &&
            result.inputId === input.id &&
            result.version === 1 &&
            result.engine === "apple-pdfkit" &&
            Array.isArray(result.pages) &&
            result.pages.length > 0 &&
            result.originalSha256 === capture.sha256 &&
            result.originalByteCount === capture.byteCount,
        );
        if (parsed)
          return {
            mimeType: "application/pdf",
            profileId: PDF_CAPTURE_ORIGINAL_PROFILE,
            payloadSha256: capture.sha256,
            byteCount: capture.byteCount,
          };
        return pdfVerifier(bytes);
      }
      throw Error("CAPTURE_SOURCE_FORMAT_UNAVAILABLE");
    },
  });
  return {
    database,
    captures,
    submissions,
    sources,
    hasPng,
    getAccountId: options.getAccountId,
    hash: sha256,
    pendingPdfProfile: options.pendingPdfProfile,
    pendingPngProfile: options.pendingPngProfile,
    newId,
  };
}

// Explicit QA preparation only: existing local repositories, no transport or Actor bootstrap.
export async function prepareDefaultUniversalLocalSourceProposals(
  context: AccountRequestContext,
  model: CaptureJobReadModel,
  options: LocalProposalOptions,
) {
  options.assertCurrent();
  const getAccountId = async () => {
    options.assertCurrent();
    const id = await options.getAccountId();
    options.assertCurrent();
    return id;
  };
  const deps = await createLocalSourceDependencies(model, { ...options, getAccountId });
  const { assertAccountRequestContext } = await import("../auth/accountRequestContext");
  await assertAccountRequestContext(context, getAccountId);
  options.assertCurrent();
  if (
    !(await deps.database.getFirstAsync(
      "SELECT 1 FROM ledger_actor_context WHERE user_id=? AND journey_id=?",
      context.accountId,
      context.tripId,
    ))
  )
    throw Error("CAPTURE_SOURCE_TRIP_ACCESS");
  const plans = await recoverUniversalOriginalPlans(context, model.batch.jobId, deps);
  options.assertCurrent();
  const result = await prepareUniversalOriginalBatch(
    context,
    model.batch.jobId,
    plans,
    deps,
  );
  options.assertCurrent();
  return result;
}

// Invoked only by explicit Start after an exact missing Backend context; never by recovery.
// All remote Source mutations remain behind the existing finite owning SQL/HTTP capability.
export async function prepareDefaultUniversalCaptureSources(
  context: AccountRequestContext,
  model: CaptureJobReadModel,
  options: {
    baseUrl: string;
    getAccountId(): Promise<string>;
    assertCurrent(): void;
    pendingPdfProfile?: typeof PDF_CAPTURE_ORIGINAL_PROFILE;
    pendingPngProfile?: typeof PNG_CAPTURE_ORIGINAL_PROFILE;
    // Existing owning upload/verify/seal continuation must be supplied; void is not a receipt.
    preparePngOriginal?(
      context: AccountRequestContext,
      input: {
        acquisition: unknown;
        acquisitionReceipt: unknown;
        binding: CaptureMaterialBinding;
        bytes: Uint8Array;
      },
    ): Promise<void>;
    prepareTask?(
      input: UniversalBatchPrepare,
    ): Promise<UniversalBatchPrepared | null | void>;
  },
) {
  options.assertCurrent();
  const fetchImplementation = await createPublicationCatalogNativeFetch().catch(
    (error) => {
      if (typeof __DEV__ !== "undefined" && __DEV__)
        console.info(
          JSON.stringify({
            event: "universal_source_native_receiver",
            state: "UNAVAILABLE",
          }),
        );
      throw error;
    },
  );
  if (typeof __DEV__ !== "undefined" && __DEV__)
    console.info(
      JSON.stringify({ event: "universal_source_native_receiver", state: "READY" }),
    );
  options.assertCurrent();
  const local = await createLocalSourceDependencies(model, options);
  const { database, captures, submissions, sources, hasPng, hash: sha256, newId } = local;
  const { now } = captureStorageDependencies;
  const deps = {
    database,
    captures,
    submissions,
    sources,
    getAccountId: options.getAccountId,
    hash: sha256,
    pendingPdfProfile: options.pendingPdfProfile,
    pendingPngProfile: options.pendingPngProfile,
    newId,
    transport: createUniversalOriginalSourceTransport(options.getAccountId, {
      baseUrl: options.baseUrl,
    }),
    catalog: createTripPublicationCatalogTransport(options.getAccountId, {
      baseUrl: options.baseUrl,
      fetchImplementation,
    }),
    imports: createTripImportAdmissionRepository(
      database,
      options.getAccountId,
      sha256,
      now,
      newId,
    ),
  };
  const hasActor = () =>
    database.getFirstAsync(
      "SELECT 1 FROM ledger_actor_context WHERE user_id=? AND journey_id=?",
      context.accountId,
      context.tripId,
    );
  if (!(await hasActor())) {
    // A discovery summary is not an Actor grant; only the existing authenticated
    // owning bootstrap may restore that local projection.
    const { revalidateJourneyLedger } =
      await import("../sync/ledgerReportingCoordinator");
    await revalidateJourneyLedger(context.tripId);
    options.assertCurrent();
    await import("../auth/accountRequestContext").then(
      ({ assertAccountRequestContext }) =>
        assertAccountRequestContext(context, options.getAccountId),
    );
    if (!(await hasActor())) throw Error("CAPTURE_SOURCE_TRIP_ACCESS");
  }
  const plans = await recoverUniversalOriginalPlans(context, model.batch.jobId, deps);
  options.assertCurrent();
  const result = await runUniversalOriginalBatch(context, model.batch.jobId, plans, deps);
  options.assertCurrent();
  const unhandled = model.inputs
    .filter(
      (input) =>
        !isEnabledPdf(input, options.pendingPdfProfile) &&
        !isEnabledPng(input, options.pendingPngProfile) &&
        isUnsupportedUniversalInputMetadata(input),
    )
    .map((i) => i.id);
  if (
    result.batchId !== model.batch.batchId ||
    result.unhandledInputIds.length !== unhandled.length ||
    result.unhandledInputIds.some((id) => !unhandled.includes(id)) ||
    new Set(result.unhandledInputIds).size !== result.unhandledInputIds.length ||
    result.results.length !== model.inputs.length - unhandled.length ||
    result.results.some((r) => r.state !== "ADMITTED")
  )
    throw new Error("UNIVERSAL_SOURCE_PREPARATION_BLOCKED");
  const pdfs = model.inputs.filter((input) =>
    isEnabledPdf(input, options.pendingPdfProfile),
  );
  async function preparePdf(
    input: (typeof pdfs)[number],
    beforeVerification: () => Promise<unknown>,
  ) {
    const prepared = result.inputs.find((prepared) => prepared.inputId === input.id);
    if (!input.captureId || !prepared || prepared.inputId !== input.id)
      throw Error("UNIVERSAL_CAPTURE_INPUT_CHANGED");
    const retained = await captures.getForSourceHandoff(input.captureId);
    options.assertCurrent();
    if (
      retained.capture.accountId !== context.accountId ||
      retained.capture.tripId !== context.tripId ||
      retained.capture.payloadId !== input.payloadId ||
      retained.capture.sha256 !== input.contentSha256 ||
      retained.capture.byteCount !== input.contentByteCount
    )
      throw Error("UNIVERSAL_CAPTURE_INPUT_CHANGED");
    const acquisitionReceipt = result.results.find(
      (r) => r.inputId === input.id,
    )?.receipt;
    options.assertCurrent();
    if (acquisitionReceipt === undefined)
      throw Error("PDF_SOURCE_PREPARATION_UNCONFIRMED");
    const { createSourcePdfV4PreparationTransport } =
      await import("../api/sourcePdfV4PreparationTransport");
    options.assertCurrent();
    await prepareAdmittedPdfOriginal(
      context,
      {
        acquisition: prepared.sourceCommand,
        acquisitionReceipt: JSON.parse(acquisitionReceipt),
        binding: {
          version: 1,
          accountId: context.accountId,
          batchId: result.batchId,
          jobId: model.batch.jobId,
          inputId: input.id,
          inputRevision: input.revision,
          captureId: retained.capture.id,
          payloadId: retained.capture.payloadId,
          captureRevision: retained.capture.revision,
          sha256: retained.capture.sha256,
          byteCount: retained.capture.byteCount,
          mediaType: "application/pdf",
        },
        bytes: retained.bytes,
      },
      {
        getAccountId: options.getAccountId,
        hash: sha256,
        assertCurrent: options.assertCurrent,
        beforeVerification,
        transport: createSourcePdfV4PreparationTransport(options.getAccountId, {
          baseUrl: options.baseUrl,
          assertRequestCurrent: options.assertCurrent,
        }),
      },
    );
  }
  async function preparePng() {
    // Source Start may have assigned rev1→rev2. User must re-screen/re-choose that revision.
    const consent = await assertDefaultUniversalPhotoConsent(context, model, options);
    if (!options.preparePngOriginal) throw Error("UNIVERSAL_PNG_PREPARATION_UNAVAILABLE");
    const input = model.inputs.find((input) =>
      isEnabledPng(input, options.pendingPngProfile),
    )!;
    const prepared = result.inputs.find((prepared) => prepared.inputId === input.id);
    if (!input.captureId || !prepared || prepared.inputId !== input.id)
      throw Error("UNIVERSAL_CAPTURE_INPUT_CHANGED");
    const retained = await captures.getForSourceHandoff(input.captureId);
    options.assertCurrent();
    if (
      !consent ||
      consent.captureRevision !== retained.capture.revision ||
      retained.capture.accountId !== context.accountId ||
      retained.capture.tripId !== context.tripId ||
      retained.capture.id !== input.captureId ||
      retained.capture.payloadId !== input.payloadId ||
      retained.capture.sha256 !== input.contentSha256 ||
      retained.capture.byteCount !== input.contentByteCount
    )
      throw Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED");
    const acquisitionReceipt = result.results.find(
      (r) => r.inputId === input.id,
    )?.receipt;
    options.assertCurrent();
    if (acquisitionReceipt === undefined)
      throw Error("PNG_SOURCE_PREPARATION_UNCONFIRMED");
    const binding: CaptureMaterialBinding = {
      version: 2,
      accountId: context.accountId,
      batchId: model.batch.batchId,
      jobId: model.batch.jobId,
      inputId: input.id,
      inputRevision: input.revision,
      captureId: retained.capture.id,
      payloadId: retained.capture.payloadId,
      captureRevision: retained.capture.revision,
      sha256: retained.capture.sha256,
      byteCount: retained.capture.byteCount,
      mediaType: "image/png",
      originalFilename: input.originalFilename,
      acquisitionSource: input.acquisitionSource,
      kind: input.kind === "FILE" ? "FILE" : "IMAGE",
    };
    assertCaptureCustodyBytes(binding, retained.bytes);
    await options.preparePngOriginal(context, {
      acquisition: prepared.sourceCommand,
      acquisitionReceipt: JSON.parse(acquisitionReceipt),
      binding,
      bytes: retained.bytes,
    });
  }
  if (pdfs.length || hasPng) {
    const pngPreparation = Promise.allSettled(hasPng ? [preparePng()] : []);
    // PDF Verify/Seal can hold the shared Source lease across decoder I/O.
    // Overlap upload preparation, then let PNG finish before that long lease.
    const preparation = await Promise.allSettled([
      (async () => {
        for (const pdf of pdfs) await preparePdf(pdf, () => pngPreparation);
      })(),
    ]);
    for (const result of [...preparation, ...(await pngPreparation)])
      if (result.status === "rejected") throw result.reason;
    options.assertCurrent();
    const raw = await deps.catalog.readUniversal(context);
    options.assertCurrent();
    await deps.imports.applyUniversalCatalogs(context, raw);
    options.assertCurrent();
  }
  if (options.prepareTask) {
    const inputs = [];
    for (const input of result.inputs) {
      options.assertCurrent();
      inputs.push(
        await sources.readAdmittedInputPin(context, input.bindingId, input.inputId),
      );
    }
    options.assertCurrent();
    if (hasPng) await assertDefaultUniversalPhotoConsent(context, model, options);
    const prepared = await options.prepareTask({
      tripId: context.tripId,
      batchId: result.batchId,
      submissionSha256: result.submissionSha256,
      inputs,
    });
    options.assertCurrent();
    return prepared;
  }
}
