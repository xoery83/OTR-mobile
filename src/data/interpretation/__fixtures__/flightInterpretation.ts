import { createHash } from "node:crypto";
import catalogs from "../../repositories/__fixtures__/tripImportCatalogs.json";
import { tripImportCatalogSchemas } from "../../api/tripImportCatalogContracts";
import { importDigest } from "@/domain/trip/flightImportReview";
import { REFERENCE_FLIGHT_DESCRIPTOR } from "@/domain/trip/referenceFlightExtractor";
import type { Json } from "@/domain/trip/eventIntentJson";
import {
  flightRunInputDigest,
  flightInterpretationConfiguration,
  FLIGHT_INTERPRETATION_SCHEMA,
  type FlightInterpretationBatch,
} from "../flightInterpretation";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const account = catalogs.actor_account_id,
  trip = catalogs.trip_id;
const id = (n: number) => `ca13b000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = () => "2026-10-06T00:00:00Z";
export async function admittedFlightBatch(
  texts: string[],
  form: FlightInterpretationBatch["request"]["materials"][number]["form"] = "TEXT",
) {
  const catalog = {
    ...structuredClone(catalogs),
    ...Object.fromEntries(Object.keys(tripImportCatalogSchemas).map((k) => [k, []])),
  } as unknown as FlightInterpretationBatch["catalog"];
  const materials: FlightInterpretationBatch["request"]["materials"] = [];
  const sources = [],
    revisions = [],
    representations = [];
  for (let i = 0; i < texts.length; i++) {
    const sourceId = id(i * 10 + 1),
      repId = id(i * 10 + 2),
      inputId = id(i * 10 + 3);
    const digest = await hash(new TextEncoder().encode(texts[i])),
      count = new TextEncoder().encode(texts[i]).length;
    sources.push({
      ...catalogs.trip_sources[0],
      id: sourceId,
      acquisition_key: `source-${i}`,
    });
    revisions.push({
      ...catalogs.trip_source_revisions[0],
      source_id: sourceId,
      original_representation_ids: [repId],
      previous_revision: null,
      origin_source_id: null,
      origin_material_revision: null,
    });
    representations.push({
      ...catalogs.trip_source_representations.find((r) => r.material_kind === "TEXT")!,
      id: repId,
      source_id: sourceId,
      text_content: texts[i],
      payload_sha256: digest,
      byte_count: count,
      role: "ORIGINAL" as const,
      parent_ids: [],
      introduced_revision: 1,
    });
    materials.push({
      pin: {
        id: inputId,
        source_id: sourceId,
        representation_id: repId,
        material_revision: 1,
        payload_sha256: digest,
        byte_count: count,
        observed_source_row_revision: 1,
        historical_selection: false,
      },
      media_type: "text/plain",
      form,
      text: texts[i],
    });
  }
  Object.assign(catalog, {
    trip_sources: sources,
    trip_source_revisions: revisions,
    trip_source_representations: representations,
  });
  const batch: FlightInterpretationBatch = {
    batch_id: id(9001),
    manifest_version: 1,
    catalog,
    matching: {
      complete: true,
      current: true,
      proposalsComplete: true,
      lineageComplete: true,
      servicesAtEventBaselines: true,
      baseline_id: "fixture-complete-relevant-scope",
      occurrences: [],
    },
    resolved_airports: materials.flatMap((m) =>
      ["AKL", "CHC"].map((code) => ({
        input_id: m.pin.id,
        code,
        airport_id: `fixture-airport:${code}`,
        namespace: "IATA_AIRPORT" as const,
        unique: true as const,
        resolution_observation_id: "fixture-reference-airports-v1",
      })),
    ),
    predecessor_run_ids: [],
    predecessor_candidate_ids: [],
    supplier_scopes: [
      {
        issuer: "NZ",
        scope_id: "2026-12-18",
        documented_uniqueness: "ONE_LEG_WITHIN_SCOPE",
      },
    ],
    request: {
      binding: {
        request_id: id(9002),
        idempotency_key: id(9002),
        schema_dialect: "OTR_TYPED_V1",
        consumer_id: "otr-import-v1",
        contract_version: "otr-intelligence-v1",
        account_id: account,
        trip_id: trip,
        run_id: id(9003),
        generation: 1,
        input_sha256: "0".repeat(64),
        schema_id: "otr.import.flight",
        schema_version: 1,
        schema_sha256: "0".repeat(64),
        descriptor: {
          ...REFERENCE_FLIGHT_DESCRIPTOR,
          capabilities: [...REFERENCE_FLIGHT_DESCRIPTOR.capabilities],
          modalities: ["TEXT"],
          configuration_sha256: "0".repeat(64),
        },
        observed_at: now(),
        observation_clock: "CALLER_OBSERVED",
        deadline: "2026-10-07T00:00:00Z",
        privacy: "LOCAL_ONLY",
        limits: { inputs: 64, items: 64, fields: 64, payload_bytes: 4194304 },
      },
      materials,
    },
  };
  await bindFlightBatch(batch);
  return batch;
}
export async function bindFlightBatch(batch: FlightInterpretationBatch) {
  batch.request.binding.input_sha256 = await flightRunInputDigest(
    batch.request.materials,
    tripImportCatalogSchemas.trip_source_representations
      .array()
      .parse(batch.catalog.trip_source_representations),
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
