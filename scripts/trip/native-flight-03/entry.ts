// Test-only embedded entry for a fresh DEV Simulator. No product startup or Lab UI.
import { registerRootComponent, requireNativeModule } from "expo";
import * as SQLite from "expo-sqlite";
import { File, Paths } from "expo-file-system";
import { digest, CryptoDigestAlgorithm, randomUUID } from "expo-crypto";
import { runMigrations } from "@/data/db/migrationRunner";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import { createCaptureSubmissionRepository } from "@/data/repositories/captureSubmissionRepository";
import { createCaptureSubmissionSession } from "@/data/operations/captureSubmission";
import { createLocalCaptureInboxRepository } from "@/data/repositories/localCaptureInboxRepository";
import { createCaptureFlightNativeRepository } from "@/data/repositories/captureFlightNativeRepository";
import { createTripCoreV2Repository } from "@/data/repositories/tripCoreV2Repository";
import { createCoreFlightDayFeedReader } from "@/data/repositories/tripCoreV2DayFeedRepository";
import { createFlightPdfExtractor } from "@/native/flightPdf";
import { openCaptureUriReader } from "@/native/captureUriReader";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { flightPdfEvidencePages } from "@/data/interpretation/flightPdfExtraction";
import {
  flightRunInputDigest,
  flightInterpretationConfiguration,
  FLIGHT_INTERPRETATION_SCHEMA,
  type FlightInterpretationBatch,
} from "@/data/interpretation/flightInterpretation";
import { importDigest } from "@/domain/trip/flightImportReview";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import pdf from "@/data/interpretation/__fixtures__/nativeFlightPdf.json";
import template from "./batch.template.json";

const output = new File(Paths.document, "native-flight-03-result.json");
const marker = new File(Paths.document, "native-flight-03-state.json");
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const hash = async (bytes: Uint8Array) => {
  const value = await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
  return Array.from(new Uint8Array(value), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
};
async function rejected(work: () => Promise<unknown>) {
  try {
    await work();
  } catch {
    return true;
  }
  return false;
}
async function run() {
  // A network failure cannot erase custody. This entry has no provider/auth/HTTP consumer.
  let networkAttempts = 0;
  globalThis.fetch = async () => {
    networkAttempts++;
    throw new Error("CLOSED_SYNTHETIC_OFFLINE");
  };
  const bridge = requireNativeModule<{
    extractFlightPdf(bytes: Uint8Array): Promise<unknown>;
  }>("ReceiptOcr");
  check(typeof bridge.extractFlightPdf === "function", "PDF_BRIDGE_MISSING");
  const sql = serializeDatabaseTransactions(
    await SQLite.openDatabaseAsync("otr-flight-native03.db"),
  );
  await sql.execAsync("PRAGMA foreign_keys=ON");
  await runMigrations(sql);
  const account = template.request.binding.account_id,
    trip = template.request.binding.trip_id;
  let active = account;
  const getAccountId = async () => active;
  const deps = { newId: randomUUID, now: () => new Date().toISOString(), sha256: hash };
  const inbox = createLocalCaptureInboxRepository(sql, getAccountId, deps);
  const submissions = createCaptureSubmissionRepository(sql, getAccountId, deps);
  let nativeCalls = 0;
  const extractor = createFlightPdfExtractor();
  const native = createCaptureFlightNativeRepository(sql, getAccountId, {
    ...deps,
    handoff: (id) => inbox.getForSourceHandoff(id),
    extract: async (bytes) => {
      nativeCalls++;
      return extractor(bytes);
    },
  });
  const old = marker.exists
    ? (JSON.parse(await marker.text()) as {
        jobId: string;
        inputId: string;
        captureId: string;
        revision: number;
        ids: unknown;
        adapterIds: unknown;
        batch: FlightInterpretationBatch;
        launches: number;
      })
    : null;
  let captureId: string, revision: number, jobId: string, inputId: string;
  if (old) {
    ({ captureId, revision, jobId, inputId } = old);
    const job = await submissions.reopen(
      jobId,
      await captureAccountRequestContext(trip, getAccountId),
    );
    check(
      job.inputs.some(
        (i) => i.id === inputId && i.captureId === captureId && i.state === "ACCEPTED",
      ),
      "C2_REOPEN_FAILED",
    );
  } else {
    await sql.runAsync(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
      account,
      trip,
      deps.now(),
    );
    const file = new File(Paths.document, "synthetic-round-trip.pdf");
    const decoded = atob(pdf.originalBase64);
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    file.write(bytes);
    const session = createCaptureSubmissionSession({
      repository: submissions,
      getActiveUserId: getAccountId,
      newId: randomUUID,
      now: deps.now,
      open: async (selection) => ({
        reader: await openCaptureUriReader(selection.temporaryUri),
      }),
    });
    const job = await session.submit(
      [
        {
          source: "files",
          temporaryUri: file.uri,
          name: "synthetic-round-trip.pdf",
          typeHint: "application/pdf",
        },
      ],
      () => {},
      trip,
    );
    check(job.inputs[0].state === "ACCEPTED", "NATIVE_FILE_INTAKE_FAILED");
    const input = job.inputs[0];
    const capture = await inbox.assign(input.captureId!, trip, input.captureRevision!);
    captureId = capture.id;
    revision = capture.revision;
    jobId = job.batch.jobId;
    inputId = input.id;
  }
  const context = await captureAccountRequestContext(trip, getAccountId);
  const local = await native.extract(context, captureId, revision);
  check(
    local.extraction.originalSha256 === pdf.extraction.originalSha256,
    "NATIVE_ORIGINAL_HASH_CHANGED",
  );
  const original = await inbox.getForSourceHandoff(captureId);
  check(
    (await hash(original.bytes)) === local.extraction.originalSha256,
    "DURABLE_BYTES_CHANGED",
  );
  const repeated = await native.extract(context, captureId, revision);
  check(JSON.stringify(repeated) === JSON.stringify(local), "EXTRACTION_REPLAY_CHANGED");
  check(nativeCalls === (old ? 0 : 1), "EXTRACTION_REEXECUTED");
  // Synthetic admitted-catalog seam only; no Source row/derivative seal is written.
  const batch =
    old?.batch ?? (structuredClone(template) as unknown as FlightInterpretationBatch);
  if (!old) {
    const ids = local.identities,
      text = batch.catalog.trip_source_representations[0];
    Object.assign(batch.catalog.trip_sources[0], {
      id: ids.sourceId,
      source_kind: "FILE",
      acquisition_channel: "FILES",
    });
    Object.assign(batch.catalog.trip_source_revisions[0], {
      source_id: ids.sourceId,
      original_representation_ids: [ids.originalRepresentationId],
    });
    const root = {
      ...text,
      id: ids.originalRepresentationId,
      source_id: ids.sourceId,
      material_kind: "BINARY" as const,
      text_content: null,
      encoding: null,
      mime_type: "application/pdf",
      payload_sha256: local.extraction.originalSha256,
      byte_count: original.bytes.length,
    };
    const derived = {
      ...text,
      id: ids.derivedRepresentationId,
      source_id: ids.sourceId,
      role: "DERIVED" as const,
      parent_ids: [root.id],
      text_content: local.extraction.text,
      payload_sha256: local.extraction.textSha256,
      byte_count: local.extraction.textByteCount,
      transform_key: "apple-pdfkit",
      transform_version: "1",
      transform_options_sha256: "0".repeat(64),
      regenerability: "POSSIBLE" as const,
    };
    batch.catalog.trip_source_representations = [root, derived];
    Object.assign(batch.request.materials[0].pin, {
      id: ids.inputId,
      source_id: ids.sourceId,
      representation_id: ids.derivedRepresentationId,
      payload_sha256: derived.payload_sha256,
      byte_count: derived.byte_count,
    });
    batch.request.materials[0].text = local.extraction.text;
    batch.resolved_airports.forEach((a) => (a.input_id = ids.inputId));
    batch.batch_id = ids.batchId;
    Object.assign(batch.request.binding, {
      run_id: ids.runId,
      request_id: ids.requestId,
      idempotency_key: ids.requestId,
      observed_at: deps.now(),
      deadline: new Date(Date.now() + 60000).toISOString(),
    });
    batch.request.binding.input_sha256 = await flightRunInputDigest(
      batch.request.materials,
      batch.catalog.trip_source_representations,
      hash,
    );
    batch.request.binding.schema_sha256 = await importDigest(
      "otr-flight-interpretation-schema-v1",
      FLIGHT_INTERPRETATION_SCHEMA as Json,
      hash,
    );
    batch.request.binding.descriptor.configuration_sha256 = await importDigest(
      "otr-flight-interpretation-config-v1",
      flightInterpretationConfiguration(batch) as unknown as Json,
      hash,
    );
  }
  const built = await native.build(context, captureId, revision, batch);
  check(built.set.candidates.length === 2, "ROUND_TRIP_CANDIDATE_COUNT");
  check(new Set(built.set.candidates.map((c) => c.id)).size === 2, "DUPLICATE_CANDIDATE");
  for (const evidence of built.built.publication.evidence) {
    check(evidence.locator.kind === "TEXT_SPAN", "WRONG_EVIDENCE_KIND");
    check(
      flightPdfEvidencePages(
        local.extraction,
        evidence.locator.start!,
        evidence.locator.end!,
      ).length > 0,
      "PAGE_EVIDENCE_MISSING",
    );
  }
  active = randomUUID();
  advanceAccountGeneration();
  check(
    await rejected(() => native.extract(context, captureId, revision)),
    "ACCOUNT_FENCE_FAILED",
  );
  active = account;
  advanceAccountGeneration();
  check(
    await rejected(() => native.extract(context, captureId, revision)),
    "ABA_FENCE_FAILED",
  );
  const fresh = await captureAccountRequestContext(trip, getAccountId);
  check(
    JSON.stringify((await native.extract(fresh, captureId, revision)).identities) ===
      JSON.stringify(local.identities),
    "FRESH_A_CHANGED_IDS",
  );
  check(
    await rejected(() =>
      native.extract({ ...fresh, tripId: randomUUID() }, captureId, revision),
    ),
    "TRIP_FENCE_FAILED",
  );
  const core = createTripCoreV2Repository(sql, getAccountId, hash);
  check(
    (await createCoreFlightDayFeedReader(core)(trip)) === null,
    "CANDIDATE_RENDERED_AS_ACCEPTED",
  );
  const counts = {
    sources: (await sql.getFirstAsync<{ n: number }>(
      "SELECT count(*) n FROM trip_sources",
    ))!.n,
    items: (await sql.getFirstAsync<{ n: number }>(
      "SELECT count(*) n FROM trip_core_itinerary_events",
    ))!.n,
    queued: (await sql.getFirstAsync<{ n: number }>(
      "SELECT count(*) n FROM sync_operations",
    ))!.n,
  };
  check(
    counts.sources === 0 && counts.items === 0 && counts.queued === 0,
    "UNAUTHORIZED_WRITER",
  );
  if (old) {
    check(
      JSON.stringify(old.ids) === JSON.stringify(local.identities),
      "COLD_IDS_CHANGED",
    );
    check(
      canonicalEventJson(old.adapterIds as Json) ===
        canonicalEventJson(built.identities as Json),
      "COLD_ADAPTER_IDS_CHANGED",
    );
  }
  check(networkAttempts === 0, "UNEXPECTED_NETWORK_CONSUMER");
  const state = {
    jobId,
    inputId,
    captureId,
    revision,
    ids: local.identities,
    adapterIds: built.identities,
    batch,
    launches: (old?.launches ?? 0) + 1,
  };
  marker.write(JSON.stringify(state));
  output.write(
    JSON.stringify({
      checkpoint: "CP-FLIGHT-NATIVE-03",
      result: old ? "COLD_RESTART_PASS" : "FIRST_PASS",
      launches: state.launches,
      bridgeRegistered: true,
      actualPdfKitCalls: nativeCalls,
      originalSha256: local.extraction.originalSha256,
      originalByteCount: original.bytes.length,
      candidateIds: built.set.candidates.map((c) => c.id),
      identities: local.identities,
      adapterIdentities: built.identities,
      sourceAuthority: "REVIEW_REQUIRED_NOT_REGISTERED",
      acceptedItems: [],
      counts,
      offline: true,
      networkAttempts,
      accountTripFences: true,
      derivedPages: local.extraction.pages,
      inputId,
      jobId,
      schemaVersion: 55,
    }),
  );
  await sql.closeAsync();
}
registerRootComponent(() => null);
void run().catch((error: unknown) =>
  output.write(
    JSON.stringify({
      result: "FAIL",
      error: String(error),
      stack: error instanceof Error ? error.stack : null,
    }),
  ),
);
