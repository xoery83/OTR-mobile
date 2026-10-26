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
  });
  const deps = {
    database,
    captures,
    submissions,
    sources,
    getAccountId: options.getAccountId,
    hash: sha256,
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
  if (
    result.batchId !== model.batch.batchId ||
    result.unhandledInputIds.length ||
    result.results.length !== model.inputs.length ||
    result.results.some((r) => r.state !== "ADMITTED")
  )
    throw new Error("UNIVERSAL_SOURCE_PREPARATION_BLOCKED");
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
