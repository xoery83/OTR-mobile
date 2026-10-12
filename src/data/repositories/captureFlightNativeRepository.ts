import { z } from "zod";
import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import type {
  LocalCaptureDatabase,
  LocalCaptureDependencies,
} from "./localCaptureInboxRepository";
import type { LocalCapture } from "@/domain/capture/localCapture";
import {
  flightPdfExtractionSchema,
  validateFlightPdfExtraction,
  type FlightPdfExtract,
} from "../interpretation/flightPdfExtraction";
import {
  interpretFlightBatch,
  type FlightInterpretationBatch,
} from "../interpretation/flightInterpretation";
import {
  buildCaptureFlightPublicationV2,
  buildCaptureFlightSourcePlanV2,
  type CaptureFlightCoreIds,
} from "../interpretation/captureFlightCoreV2";
import type {
  CoreCandidatePublicationTransport,
  CoreSourcePlanTransport,
} from "../api/tripCoreV2Transport";
import type { createTripCoreV2Repository } from "./tripCoreV2Repository";

const uuid = z.uuid();
const identitiesSchema = z.strictObject({
  sourceId: uuid,
  originalRepresentationId: uuid,
  derivedRepresentationId: uuid,
  runId: uuid,
  inputId: uuid,
  requestId: uuid,
  batchId: uuid,
  publicationId: uuid,
  planId: uuid,
});
export type NativeFlightIdentities = z.infer<typeof identitiesSchema>;
type Adapter = {
  set: Awaited<ReturnType<typeof interpretFlightBatch>>;
  batchSha256: string;
  built: Awaited<ReturnType<typeof buildCaptureFlightPublicationV2>>;
  identities: CaptureFlightCoreIds[];
  plan: ReturnType<typeof buildCaptureFlightSourcePlanV2>;
};
type Row = {
  capture_revision: number;
  payload_id: string;
  original_sha256: string;
  identities_json: string;
  extraction_json: string | null;
  adapter_json: string | null;
};
const json = (value: unknown) => canonicalEventJson(value as Json);

// No Source registration, accepted mirror write or autonomous retry lives here.
export function createCaptureFlightNativeRepository(
  database: LocalCaptureDatabase,
  getAccountId: () => Promise<string>,
  dependencies: LocalCaptureDependencies & {
    handoff(captureId: string): Promise<{ capture: LocalCapture; bytes: Uint8Array }>;
    extract: FlightPdfExtract;
  },
) {
  const { sha256, newId } = dependencies;
  async function scoped<T>(context: AccountRequestContext, work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      let value!: T;
      await database.withTransactionAsync(async () => {
        await assertAccountRequestContext(context, getAccountId);
        if (
          !(await database.getFirstAsync(
            "SELECT 1 FROM ledger_actor_context WHERE user_id=? AND journey_id=?",
            context.accountId,
            context.tripId,
          ))
        )
          throw new Error("NATIVE_FLIGHT_TRIP_ACCESS");
        value = await work();
        await assertAccountRequestContext(context, getAccountId);
      });
      return value;
    });
  }
  async function read(
    context: AccountRequestContext,
    captureId: string,
    revision: number,
  ) {
    const capture = await database.getFirstAsync<{ payload_id: string }>(
      "SELECT payload_id FROM local_capture_inbox WHERE account_id=? AND trip_id=? AND id=? AND revision=? AND state='ASSIGNED'",
      context.accountId,
      context.tripId,
      captureId,
      revision,
    );
    if (!capture) throw new Error("NATIVE_FLIGHT_CAPTURE_STALE");
    const row = await database.getFirstAsync<Row>(
      "SELECT * FROM capture_flight_native_preparations WHERE account_id=? AND trip_id=? AND capture_id=?",
      context.accountId,
      context.tripId,
      captureId,
    );
    if (
      row &&
      (row.payload_id !== capture.payload_id || row.capture_revision !== revision)
    )
      throw new Error("NATIVE_FLIGHT_CAPTURE_STALE");
    return row;
  }
  async function extract(
    context: AccountRequestContext,
    captureId: string,
    revision: number,
  ) {
    await assertAccountRequestContext(context, getAccountId);
    const original = await dependencies.handoff(captureId);
    const { capture, bytes } = original;
    if (
      capture.accountId !== context.accountId ||
      capture.tripId !== context.tripId ||
      capture.revision !== revision ||
      capture.kind !== "FILE" ||
      bytes.length !== capture.byteCount ||
      (await sha256(bytes)) !== capture.sha256
    )
      throw new Error("NATIVE_FLIGHT_CAPTURE_STALE");
    const retained = await scoped(context, async () => {
      let row = await read(context, captureId, revision);
      if (!row) {
        const identities = identitiesSchema.parse(
          Object.fromEntries(
            Object.keys(identitiesSchema.shape).map((key) => [key, newId()]),
          ),
        );
        await database.runAsync(
          "INSERT INTO capture_flight_native_preparations(account_id,trip_id,capture_id,capture_revision,payload_id,original_sha256,identities_json) VALUES(?,?,?,?,?,?,?)",
          context.accountId,
          context.tripId,
          captureId,
          revision,
          capture.payloadId,
          capture.sha256,
          json(identities),
        );
        row = await read(context, captureId, revision);
      }
      if (!row || row.original_sha256 !== capture.sha256)
        throw new Error("PDF_ORIGINAL_MISMATCH");
      return row;
    });
    const identities = identitiesSchema.parse(JSON.parse(retained.identities_json));
    const result = await validateFlightPdfExtraction(
      retained.extraction_json
        ? JSON.parse(retained.extraction_json)
        : await dependencies.extract(bytes),
      capture,
      sha256,
    );
    const { textSha256: _hash, textByteCount: _count, ...packet } = result;
    const extractionJson = json(flightPdfExtractionSchema.parse(packet));
    await scoped(context, async () => {
      const current = await read(context, captureId, revision);
      if (!current) throw new Error("NATIVE_FLIGHT_CAPTURE_STALE");
      if (current.extraction_json && current.extraction_json !== extractionJson)
        throw new Error("NATIVE_FLIGHT_EXTRACTION_CHANGED");
      await database.runAsync(
        "UPDATE capture_flight_native_preparations SET extraction_json=? WHERE account_id=? AND trip_id=? AND capture_id=? AND capture_revision=? AND extraction_json IS NULL",
        extractionJson,
        context.accountId,
        context.tripId,
        captureId,
        revision,
      );
    });
    return { identities, extraction: result, sourceAuthority: "REQUIRED" as const };
  }
  async function build(
    context: AccountRequestContext,
    captureId: string,
    revision: number,
    supplied: FlightInterpretationBatch,
  ) {
    const batch = structuredClone(supplied);
    const local = await extract(context, captureId, revision);
    const ids = local.identities,
      material = batch.request.materials[0];
    const root = batch.catalog.trip_source_representations.find(
      (r) => r.id === ids.originalRepresentationId,
    );
    const derived = batch.catalog.trip_source_representations.find(
      (r) => r.id === ids.derivedRepresentationId,
    );
    if (
      batch.request.materials.length !== 1 ||
      batch.batch_id !== ids.batchId ||
      batch.request.binding.run_id !== ids.runId ||
      batch.request.binding.request_id !== ids.requestId ||
      batch.request.binding.idempotency_key !== ids.requestId ||
      batch.request.binding.account_id !== context.accountId ||
      batch.request.binding.trip_id !== context.tripId ||
      material.pin.id !== ids.inputId ||
      material.pin.source_id !== ids.sourceId ||
      material.pin.representation_id !== ids.derivedRepresentationId ||
      material.pin.material_revision !== 1 ||
      material.text !== local.extraction.text ||
      material.pin.payload_sha256 !== local.extraction.textSha256 ||
      material.pin.byte_count !== local.extraction.textByteCount ||
      root?.source_id !== ids.sourceId ||
      root.role !== "ORIGINAL" ||
      root.material_kind !== "BINARY" ||
      root.mime_type !== "application/pdf" ||
      root.payload_sha256 !== local.extraction.originalSha256 ||
      root.byte_count !== local.extraction.originalByteCount ||
      derived?.source_id !== ids.sourceId ||
      derived.role !== "DERIVED" ||
      derived.material_kind !== "TEXT" ||
      derived.parent_ids.length !== 1 ||
      derived.parent_ids[0] !== root.id ||
      derived.transform_key !== "apple-pdfkit" ||
      derived.transform_version !== "1"
    )
      throw new Error("NATIVE_FLIGHT_SOURCE_ADMISSION_REQUIRED");
    const batchSha256 = await sha256(new TextEncoder().encode(json(batch)));
    const prior = await scoped(context, () => read(context, captureId, revision));
    if (prior?.adapter_json) {
      const retained = JSON.parse(prior.adapter_json) as Adapter;
      if (retained.batchSha256 !== batchSha256)
        throw new Error("NATIVE_FLIGHT_PREPARATION_CHANGED");
      return retained;
    }
    // Interpreter revalidates the owning registered catalog and full derived ancestry.
    const set = await interpretFlightBatch(batch, {
      sha256,
      getAccountId,
      now: dependencies.now,
    });
    const built = await buildCaptureFlightPublicationV2(
      context,
      set,
      batch.request.materials,
      ids.publicationId,
      sha256,
      getAccountId,
    );
    const adapter = await scoped(context, async () => {
      const row = await read(context, captureId, revision);
      if (!row) throw new Error("NATIVE_FLIGHT_CAPTURE_STALE");
      if (row.adapter_json) {
        const old = JSON.parse(row.adapter_json) as Adapter;
        if (json(old.built) !== json(built))
          throw new Error("NATIVE_FLIGHT_PREPARATION_CHANGED");
        return old;
      }
      const identities = set.candidates.map((c) => ({
        candidateId: c.id,
        itemId: newId(),
        createSlotId: newId(),
        createOperationId: newId(),
        qualifySlotId: newId(),
        qualifyOperationId: newId(),
      }));
      const result: Adapter = {
        set,
        batchSha256,
        built,
        identities,
        plan: buildCaptureFlightSourcePlanV2(built.publication, ids.planId, identities),
      };
      await database.runAsync(
        "UPDATE capture_flight_native_preparations SET adapter_json=? WHERE account_id=? AND trip_id=? AND capture_id=? AND capture_revision=? AND adapter_json IS NULL",
        json(result),
        context.accountId,
        context.tripId,
        captureId,
        revision,
      );
      return result;
    });
    return adapter;
  }
  return {
    extract,
    build,
    // Explicit reviewed pass only. The Core transport independently rechecks Source authority.
    async prepareAndQueue(
      context: AccountRequestContext,
      captureId: string,
      revision: number,
      transport: CoreCandidatePublicationTransport & CoreSourcePlanTransport,
      core: ReturnType<typeof createTripCoreV2Repository>,
    ) {
      const row = await scoped(context, () => read(context, captureId, revision));
      if (!row?.adapter_json) throw new Error("NATIVE_FLIGHT_SOURCE_ADMISSION_REQUIRED");
      const adapter = JSON.parse(row.adapter_json) as Adapter;
      await assertAccountRequestContext(context, getAccountId);
      const publication = await transport.publishSourceCandidates(
        context,
        adapter.built.publication,
      );
      await scoped(context, async () => {
        const current = await read(context, captureId, revision);
        if (current?.adapter_json !== row.adapter_json)
          throw new Error("NATIVE_FLIGHT_CAPTURE_STALE");
      });
      const preparation = await transport.prepareSourcePlan(context, adapter.plan);
      await assertAccountRequestContext(context, getAccountId);
      await scoped(context, async () => {
        const current = await read(context, captureId, revision);
        if (current?.adapter_json !== row.adapter_json)
          throw new Error("NATIVE_FLIGHT_CAPTURE_STALE");
      });
      for (const command of preparation.readyCommands)
        await core.enqueue(context, command);
      return { publication, preparation };
    },
  };
}
