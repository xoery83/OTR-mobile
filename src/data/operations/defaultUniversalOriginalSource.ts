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
  recoverUniversalOriginalPlans,
  runUniversalOriginalBatch,
} from "./universalOriginalBatch";
import type { AccountRequestContext } from "../auth/accountRequestContext";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

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
    prepareTask?(
      input: import("../api/universalImportContracts").UniversalBatchPrepare,
    ): Promise<void>;
  },
) {
  options.assertCurrent();
  const database = await openDatabase();
  const captures = await getDefaultLocalCaptureInboxRepository();
  const submissions = await getDefaultCaptureSubmissionRepository();
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
  const { sha256, now, newId } = captureStorageDependencies;
  const sources = createCaptureSourceAdmissionRepository(database, options.getAccountId, {
    sha256,
    now,
    newId,
    handoff: captures.getForSourceHandoff,
    readSelectedMaterial: async () => null,
    utf8FileProfile: UTF8_TEXT_FILE_PROFILE,
    ...(options.pendingPdfProfile === PDF_CAPTURE_ORIGINAL_PROFILE
      ? {
          pendingPdfProfile: options.pendingPdfProfile,
          verifyBinary: (
            await import("@/native/pendingPdfOriginal")
          ).createPendingPdfOriginalFormatVerifier(),
        }
      : {}),
  });
  const deps = {
    database,
    captures,
    submissions,
    sources,
    getAccountId: options.getAccountId,
    hash: sha256,
    pendingPdfProfile: options.pendingPdfProfile,
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
  const singlePdf =
    options.pendingPdfProfile === PDF_CAPTURE_ORIGINAL_PROFILE &&
    model.inputs.length === 1 &&
    model.inputs[0].kind === "FILE" &&
    model.inputs[0].declaredContentType === "application/pdf";
  const unhandled = model.inputs
    .filter((input) => !singlePdf && isUnsupportedUniversalInputMetadata(input))
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
  if (singlePdf) {
    const input = model.inputs[0],
      prepared = result.inputs[0];
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
    const acquisitionReceipt = await deps.transport.lookup(
      context,
      prepared.sourceCommand,
    );
    options.assertCurrent();
    if (acquisitionReceipt === null) throw Error("PDF_SOURCE_PREPARATION_UNCONFIRMED");
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
        transport: createSourcePdfV4PreparationTransport(options.getAccountId, {
          baseUrl: options.baseUrl,
          assertRequestCurrent: options.assertCurrent,
        }),
      },
    );
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
    await options.prepareTask({
      tripId: context.tripId,
      batchId: result.batchId,
      submissionSha256: result.submissionSha256,
      inputs,
    });
    options.assertCurrent();
  }
}
