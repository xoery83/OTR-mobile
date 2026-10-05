import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import catalogs from "../repositories/__fixtures__/tripImportCatalogs.json";
import { validateImportSnapshot } from "../repositories/tripImportCatalogRecovery";
import {
  tripImportCatalogSchemas,
  tripImportSnapshotSchema,
  type TripImportCatalogName,
} from "../api/tripImportCatalogContracts";
import { importDigest } from "@/domain/trip/flightImportReview";
import {
  referenceFlightExtract,
  REFERENCE_FLIGHT_DESCRIPTOR,
} from "@/domain/trip/referenceFlightExtractor";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import {
  interpretFlightBatch,
  flightRunInputDigest,
  flightInterpretationConfiguration,
  FLIGHT_INTERPRETATION_SCHEMA,
  type FlightInterpretationBatch,
} from "./flightInterpretation";

const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const account = catalogs.actor_account_id,
  trip = catalogs.trip_id;
const id = (n: number) => `ca13b000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = () => "2026-10-06T00:00:00Z";
const deps = { sha256: hash, getAccountId: async () => account, now };
const leg = "NZ289 AKL→CHC 2026-12-18 dep=10:30";
async function fixture(
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
  await bind(batch);
  return batch;
}
async function bind(batch: FlightInterpretationBatch) {
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
const run = async (texts: string[], form?: Parameters<typeof fixture>[1]) =>
  interpretFlightBatch(await fixture(texts, form), deps);
const field = (r: Awaited<ReturnType<typeof interpretFlightBatch>>, path: string) =>
  r.candidates[0].occurrence[path];
async function poisoned(
  batch: FlightInterpretationBatch,
  mutate: (response: Awaited<ReturnType<typeof referenceFlightExtract>>) => void,
) {
  return interpretFlightBatch(batch, {
    ...deps,
    plugin: async (request) => {
      const response = await referenceFlightExtract(request, hash);
      mutate(response);
      const { response_sha256: _, ...body } = response;
      response.response_sha256 = await importDigest(
        "otr-intelligence-response-v1",
        body as unknown as Json,
        hash,
      );
      return response;
    },
  });
}

describe("CP13B Builder A deterministic Flight matrix", () => {
  it("1: one text produces one typed Flight without closure or Event commands", async () => {
    const r = await run([leg]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].proposal.fields.services?.proposed_value[0]).toMatchObject({
      operator_value: "NZ",
      service_number: "289",
      attribution: "UNSPECIFIED",
    });
    expect(r.candidates[0].proposal.fields.origin?.proposed_value.location).toEqual({
      authored_label: "AKL",
      authored_text: null,
      accepted_place_id: null,
    });
    expect(r.publication_request).not.toHaveProperty("state");
    expect(r).not.toHaveProperty("command");
  });
  it("2: outbound + return are distinct observations/Candidates", async () => {
    const r = await run([`${leg}\nNZ281 CHC→AKL 2026-12-20 dep=18:00`]);
    expect(r.candidates).toHaveLength(2);
    expect(r.resolutions[0].outcome).toBe("DISTINCT_ITEM");
  });
  it("3: table/OCR reference text yields twelve Flights among unrelated rows", async () => {
    const text = [
      "Hotel: Christchurch",
      ...Array.from(
        { length: 12 },
        (_, i) =>
          `NZ${289 + i} AKL→CHC 2026-12-${String(18 + (i % 10)).padStart(2, "0")} dep=10:30`,
      ),
      "Train: service 45",
    ].join("\n");
    for (const form of ["TABLE_TEXT", "OCR_TEXT"] as const) {
      const r = await run([text], form);
      expect(r.candidates).toHaveLength(12);
      expect(r.coverage[0].ignored).toHaveLength(2);
    }
  });
  it("4: email + boarding-pass-like text consolidate with exact separate provenance", async () => {
    const r = await run(
      [
        "Subject: confirmation\nFlight: NZ289\nRoute: AKL→CHC\nDate: 2026-12-18\nDeparture: 10:30",
        `${leg} seat=12A`,
      ],
      "EMAIL_TEXT",
    );
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].source_ids).toHaveLength(2);
    expect(r.candidates[0].deferred_dimensions[0].dimension).toBe("seats");
  });
  it("5: complementary arrival is retained without overwriting departure", async () => {
    const r = await run([leg, "NZ289 AKL→CHC 2026-12-18 arr=12:00 arrDate=2026-12-18"]);
    expect(r.candidates).toHaveLength(1);
    expect(field(r, "destination.local_time").value).toMatchObject({ value: "12:00" });
  });
  it("6: independently anchored same occurrence keeps contradictory departure", async () => {
    const r = await run([
      `${leg} occurrence=NZ:2026-12-18:leg42`,
      "NZ289 AKL→CHC 2026-12-18 dep=10:45 occurrence=NZ:2026-12-18:leg42",
    ]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].contradictions[0]).toMatchObject({
      path: "origin.local_time",
    });
    expect(field(r, "origin.local_time").value).toBeNull();
    expect(r.candidates[0].proposal.fields.origin).toBeUndefined();
  });
  it("7: same flight number on different dates stays distinct", async () => {
    const r = await run([leg, leg.replace("12-18", "12-19")]);
    expect(r.candidates).toHaveLength(2);
    expect(r.resolutions[0].outcome).toBe("DISTINCT_ITEM");
  });
  it("8: reverse route never consolidates", async () => {
    const r = await run([leg, leg.replace("AKL→CHC", "CHC→AKL")]);
    expect(r.candidates).toHaveLength(2);
  });
  it("9: unknown codeshare remains possible duplicate", async () => {
    const r = await run([leg, leg.replace("NZ289", "QF123")]);
    expect(r.candidates).toHaveLength(2);
    expect(r.resolutions[0].outcome).toBe("POSSIBLE_DUPLICATE");
  });
  it("10: evidenced common operating occurrence consolidates compatible marketing services", async () => {
    const r = await run([
      `${leg} operating=NZ289`,
      `${leg.replace("NZ289", "QF123")} operating=NZ289`,
    ]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].contradictions.some((c) => c.path === "service")).toBe(false);
    expect(r.candidates[0].proposal.fields.services?.proposed_value).toHaveLength(3);
  });
  it("11: retiming without human continuity review remains separate/reviewable", async () => {
    const r = await run([
      leg,
      `${leg.replace("10:30", "10:45")} change=NZ schedule-change notice`,
    ]);
    expect(r.candidates).toHaveLength(2);
    expect(r.resolutions[0].reason).toBe("CONTINUITY_REVIEW_REQUIRED");
    const plain = await run([leg, leg.replace("10:30", "10:45")]);
    expect(plain.candidates).toHaveLength(2);
    expect(plain.resolutions[0].reason).toBe("COMPETING_PROPOSAL_CLOCKS");
  });
  it("12: changed service with supplier supersession evidence still requires review", async () => {
    const r = await run([
      `${leg} occurrence=NZ:2026-12-18:leg42`,
      `${leg.replace("NZ289", "NZ291")} occurrence=NZ:2026-12-18:leg42 change=NZ supersedes NZ289`,
    ]);
    expect(r.candidates).toHaveLength(2);
    expect(r.resolutions[0].reason).toBe("CONTINUITY_REVIEW_REQUIRED");
  });
  it("13: incomplete anchors and a yearless date stay unresolved", async () => {
    const r = await run(["NZ289 date=18 Dec", "NZ289 date=18 Dec"]);
    expect(r.candidates).toHaveLength(2);
    expect(r.resolutions[0].outcome).toBe("UNRESOLVED_MATCH");
    expect(field(r, "origin.local_date").observations[0].raw).toBe("date=18 Dec");
  });
  it("14: missing departure never becomes midnight", async () => {
    const r = await run(["NZ289 AKL→CHC 2026-12-18"]);
    expect(r.candidates[0].proposal.fields.origin?.proposed_value.time).toMatchObject({
      local_time: null,
      quality: "UNKNOWN",
      source_instant: null,
    });
  });
  it("15: unknown arrival remains explicit unknown", async () => {
    const r = await run([leg]);
    expect(
      r.candidates[0].proposal.fields.destination?.proposed_value.time,
    ).toMatchObject({ local_date: null, local_time: null, source_instant: null });
  });
  it("16: offset-only civil evidence preserves offset without a zone/source instant", async () => {
    const r = await run([`${leg} depOffset=+13:00`]);
    expect(r.candidates[0].proposal.fields.origin?.proposed_value.time).toMatchObject({
      basis: "DERIVED_CIVIL",
      supplied_offset_seconds: 46800,
      zone_id: null,
      source_instant: null,
    });
  });
  it("17: explicit exact midnight and subsecond independent timestamp keep precision", async () => {
    const r = await run([
      `${leg.replace("10:30", "00:00")} depInstant=2026-12-18T00:00:00.123456+13:00`,
    ]);
    expect(r.candidates[0].proposal.fields.origin?.proposed_value.time).toMatchObject({
      local_time: "00:00",
      clock_precision: -1,
      quality: "EXACT",
      basis: "SOURCE_INSTANT",
      source_instant: "2026-12-17T11:00:00.123456Z",
      source_instant_precision: 6,
    });
  });
  it("18: different passengers/PNRs consolidate into one occurrence with locator-only markers", async () => {
    const r = await run([`${leg} passenger=Leon pnr=ABC`, `${leg} passenger=TX pnr=XYZ`]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].deferred_dimensions).toHaveLength(4);
    const text = JSON.stringify(r);
    for (const secret of ["Leon", "TX", "ABC", "XYZ"]) expect(text).not.toContain(secret);
    expect(
      r.candidates[0].deferred_dimensions.every(
        (d) => !Object.hasOwn(d.locator, "excerpt"),
      ),
    ).toBe(true);
  });
  it("19: ambiguous passenger identity remains original scoped evidence, never Person-mapped", async () => {
    const r = await run([`${leg} passenger=Leon or TX`]);
    expect(r.candidates[0].deferred_dimensions).toHaveLength(1);
    expect(JSON.stringify(r)).not.toMatch(/person_id|PersonId|Leon or TX/);
  });
  it("20: duplicate evidence adds support but not another Candidate; replay is exact", async () => {
    const batch = await fixture([leg, leg]);
    const r = await interpretFlightBatch(batch, deps);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].occurrence.service.observations).toHaveLength(2);
    expect(await interpretFlightBatch(batch, deps)).toEqual(r);
  });
  it("21: one invalid Input fails while another survives with exact partial coverage", async () => {
    const r = await run(["NZ289 occurrence=malformed", leg]);
    expect(r.status).toBe("PARTIAL");
    expect(r.candidates).toHaveLength(1);
    expect(r.coverage.map((c) => c.status)).toEqual(["FAILED", "PROCESSED"]);
    expect(r.unprocessed_input_ids).toEqual([id(3)]);
  });
  it("22a: candidate overflow defers the whole Input without silent truncation", async () => {
    const r = await run([
      Array.from({ length: 65 }, (_, i) => `NZ${i + 1} AKL→CHC 2026-12-18`).join("\n"),
    ]);
    expect(r.candidates).toHaveLength(0);
    expect(r.coverage[0]).toMatchObject({ status: "DEFERRED", code: "LIMIT_EXCEEDED" });
  });
  it("22b: field overflow defers the whole Input", async () => {
    const r = await run([
      `${leg} ${Array.from({ length: 65 }, () => "dep=10:30").join(" ")}`,
    ]);
    expect(r.candidates).toHaveLength(0);
    expect(r.coverage[0].code).toBe("LIMIT_EXCEEDED");
  });
  it("22c: input overflow rejects, rather than selecting first 64", async () => {
    const batch = await fixture([leg]);
    batch.request.materials = Array.from(
      { length: 65 },
      () => batch.request.materials[0],
    );
    await expect(interpretFlightBatch(batch, deps)).rejects.toThrow();
  });
  it("23: reprocessing keeps predecessor Run/Candidate lineage and changes proposal identities", async () => {
    const batch = await fixture([leg]);
    const first = await interpretFlightBatch(batch, deps);
    const runRow = {
      ...catalogs.trip_source_runs[0],
      id: first.run_id,
      scope_source_ids: first.publication_request.scope_source_ids,
      scope_sha256: await importDigest(
        "otr-source-run-scope-v1",
        [1, trip, account, first.publication_request.scope_source_ids] as Json,
        hash,
      ),
    };
    Object.assign(batch.catalog, {
      trip_source_runs: [runRow],
      trip_source_candidates: first.candidates.map((c) => ({
        id: c.id,
        run_id: first.run_id,
        candidate_key: c.candidate_key,
        candidate_kind: c.candidate_kind,
        proposal_version: 1,
        proposal_sha256: c.proposal_sha256,
        proposal: c.proposal,
        created_at: runRow.created_at,
        retention_state: "RETAINED",
      })),
    });
    batch.request.binding.run_id = id(9010);
    batch.request.binding.request_id = id(9011);
    batch.request.binding.idempotency_key = id(9011);
    batch.request.binding.generation = 2;
    batch.predecessor_run_ids = [first.run_id];
    batch.predecessor_candidate_ids = first.candidates.map((c) => c.id);
    await bind(batch);
    const next = await interpretFlightBatch(batch, deps);
    expect(next.candidates[0].id).not.toBe(first.candidates[0].id);
    expect(next.lineage[0].parent_candidate_id).toBe(first.candidates[0].id);
    expect(next.predecessors[0].parent_run_id).toBe(first.run_id);
    batch.predecessor_candidate_ids = [];
    await bind(batch);
    await expect(interpretFlightBatch(batch, deps)).rejects.toThrow("LINEAGE_INCOMPLETE");
  });
  it("24: foreign Account/Trip material is rejected; A→B→A fences a late plugin", async () => {
    const batch = await fixture([leg]);
    batch.catalog.actor_account_id = id(9990);
    await expect(interpretFlightBatch(batch, deps)).rejects.toThrow(
      "INTERPRETATION_SCOPE",
    );
    const b = await fixture([leg]);
    (b.catalog.trip_sources as { trip_id: string }[])[0].trip_id = id(9991);
    await expect(interpretFlightBatch(b, deps)).rejects.toThrow(
      "IMPORT_CATALOG_INTEGRITY",
    );
    const late = await fixture([leg]);
    await expect(
      interpretFlightBatch(late, {
        ...deps,
        plugin: async (r) => {
          advanceAccountGeneration();
          advanceAccountGeneration();
          return referenceFlightExtract(r, hash);
        },
      }),
    ).rejects.toThrow("Account changed");
  });
});

describe("interpretation admission and evidence validation", () => {
  it("Run input digest matches the existing real CP13A SQL publication fixture", async () => {
    const run = catalogs.trip_source_runs[0];
    const reps = tripImportCatalogSchemas.trip_source_representations
      .array()
      .parse(catalogs.trip_source_representations);
    const materials = catalogs.trip_source_inputs
      .filter((i) => i.run_id === run.id)
      .map((i) => {
        const { run_id: _, confirmation_id: __, ...pin } = i;
        return {
          pin: pin as FlightInterpretationBatch["request"]["materials"][number]["pin"],
          media_type: "text/plain" as const,
          form: "TEXT" as const,
          text: reps.find((r) => r.id === i.representation_id)!.text_content!,
        };
      });
    expect(await flightRunInputDigest(materials, reps, hash)).toBe(run.input_sha256);
  });
  it("publication plan crosses existing catalog schema/digest/lineage validation without a new publisher", async () => {
    const batch = await fixture([`${leg} passenger=Leon pnr=ABC`]);
    const result = await interpretFlightBatch(batch, deps),
      publication = result.publication_request;
    const row = {
      ...catalogs.trip_source_runs[0],
      id: publication.id,
      scope_source_ids: publication.scope_source_ids,
      scope_sha256: await importDigest(
        "otr-source-run-scope-v1",
        [1, trip, account, publication.scope_source_ids] as Json,
        hash,
      ),
      input_sha256: result.input_sha256,
    };
    Object.assign(batch.catalog, {
      trip_source_runs: [row],
      trip_source_inputs: publication.inputs.map((pin) => ({
        ...pin,
        run_id: row.id,
        confirmation_id: null,
      })),
      trip_source_candidates: result.candidates.map((c) => ({
        id: c.id,
        run_id: row.id,
        candidate_key: c.candidate_key,
        candidate_kind: c.candidate_kind,
        proposal_version: 1,
        proposal_sha256: c.proposal_sha256,
        proposal: c.proposal,
        created_at: row.created_at,
        retention_state: "RETAINED",
      })),
    });
    const snapshot = tripImportSnapshotSchema.parse(batch.catalog);
    const rows = Object.fromEntries(
      Object.entries(tripImportCatalogSchemas).map(([name, schema]) => [
        name,
        schema.array().parse((snapshot as Record<string, unknown>)[name]),
      ]),
    ) as unknown as Record<TripImportCatalogName, Record<string, unknown>[]>;
    await expect(
      validateImportSnapshot(account, trip, rows, hash),
    ).resolves.toBeUndefined();
  });

  it("many Sources each yielding several legs consolidate N to M", async () => {
    const itinerary = `${leg}\nNZ281 CHC→AKL 2026-12-20 dep=18:00`;
    const r = await run([itinerary, itinerary]);
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates.every((c) => c.source_ids.length === 2)).toBe(true);
  });
  it("bare airport code equality cannot certify uniquely resolved airport identity", async () => {
    const b = await fixture([leg, leg]);
    b.resolved_airports = [];
    await bind(b);
    const r = await interpretFlightBatch(b, deps);
    expect(r.candidates).toHaveLength(2);
    expect(r.resolutions[0].outcome).toBe("UNRESOLVED_MATCH");
  });
  it("a marketing designator is never guessed to be an operating identity", async () => {
    const r = await run([leg, `${leg.replace("NZ289", "QF123")} operating=NZ289`]);
    expect(r.candidates).toHaveLength(2);
    expect(r.resolutions[0].outcome).toBe("POSSIBLE_DUPLICATE");
  });
  it("a plugin cannot relabel arrival-date evidence as origin-date evidence", async () => {
    await expect(
      poisoned(await fixture([`${leg} arrDate=2026-12-19`]), (r) => {
        const f = r.items[0].fields.find((f) => f.path === "destination.local_date")!;
        f.path = "origin.local_date";
      }),
    ).rejects.toThrow("EVIDENCE_INVALID");
  });
  it("the input binding and returned Candidate Set are frozen", async () => {
    const b = await fixture([leg]);
    await expect(
      interpretFlightBatch(b, {
        ...deps,
        plugin: async (request) => {
          request.binding.input_sha256 = "f".repeat(64);
          return referenceFlightExtract(request, hash);
        },
      }),
    ).rejects.toThrow();
    const r = await interpretFlightBatch(b, deps);
    expect(Object.isFrozen(r.candidates[0].occurrence.service.observations)).toBe(true);
  });
  it("more than 64 ignored text rows are explicitly deferred, not truncated", async () => {
    const r = await run([
      Array.from({ length: 65 }, (_, i) => `Hotel row ${i}`).join("\n"),
      leg,
    ]);
    expect(r.status).toBe("PARTIAL");
    expect(r.coverage[0]).toMatchObject({ status: "DEFERRED", code: "LIMIT_EXCEEDED" });
    expect(r.failures[0]).toMatchObject({
      category: "LIMIT_EXCEEDED",
      execution_certainty: "TERMINAL",
      input_ids: [id(3)],
    });
  });
  it("too many supporting locators fail explicitly before Candidate publication", async () => {
    const b = await fixture(
      Array.from(
        { length: 17 },
        () => `${leg} depZone=Pacific/Auckland depOffset=+13:00`,
      ),
    );
    await expect(interpretFlightBatch(b, deps)).rejects.toThrow("LIMIT_EXCEEDED");
  });
  it("a conflicting clock inside one observation cannot hide behind a missing clock", async () => {
    const r = await run([`${leg} dep=10:45`, "NZ289 AKL→CHC 2026-12-18"]);
    expect(r.candidates).toHaveLength(2);
    expect(r.resolutions[0].reason).toBe("COMPETING_PROPOSAL_CLOCKS");
  });
  it("uncertain operating facts are retained without publishing an arbitrary operating service", async () => {
    const r = await run([`${leg} operating=NZ289 operating=QF123`]);
    expect(
      r.candidates[0].contradictions.some((c) => c.path === "operating_service"),
    ).toBe(true);
    expect(r.candidates[0].proposal.fields.services).toBeUndefined();
  });

  it("does not fabricate complete match scope from successful extraction", async () => {
    const b = await fixture([leg, leg]);
    b.matching.complete = false;
    await bind(b);
    const r = await interpretFlightBatch(b, deps);
    expect(r.candidates).toHaveLength(2);
    expect(r.resolutions[0].reason).toBe("INCOMPLETE_SCOPE");
  });
  it("Unicode locator offsets address exact UTF-8 bytes", async () => {
    const r = await run([`Subject: 中文✈\n${leg}`]);
    const f = r.fragments[0];
    expect(f.locator.start).toBe(new TextEncoder().encode("Subject: 中文✈\n").length);
  });
  it("retains estimated quality and an actually supplied IANA zone without resolving civil time", async () => {
    const r = await run([`${leg.replace("10:30", "~10:30")} depZone=Pacific/Auckland`]);
    expect(r.candidates[0].proposal.fields.origin?.proposed_value.time).toMatchObject({
      quality: "ESTIMATED",
      zone_id: "Pacific/Auckland",
      source_instant: null,
      basis: "DERIVED_CIVIL",
    });
  });
  it("rejects altered normalized values even with a correct response digest", async () => {
    await expect(
      poisoned(await fixture([leg]), (r) => {
        r.items[0].fields.find((f) => f.path === "origin.local_date")!.normalized =
          "2027-12-18";
      }),
    ).rejects.toThrow("NORMALIZATION_INVALID");
  });
  it("rejects fabricated/wrong-source/range evidence", async () => {
    for (const mutate of [
      (r: Awaited<ReturnType<typeof referenceFlightExtract>>) => {
        r.fragments[0].source_id = id(9999);
      },
      (r: Awaited<ReturnType<typeof referenceFlightExtract>>) => {
        r.fragments[0].locator.end = 999999;
      },
    ])
      await expect(poisoned(await fixture([leg]), mutate)).rejects.toThrow(
        "EVIDENCE_INVALID",
      );
  });
  it("rejects invented coverage and descriptor escalation", async () => {
    await expect(
      poisoned(await fixture([leg]), (r) => {
        r.coverage = [];
      }),
    ).rejects.toThrow();
    const b = await fixture([leg]);
    b.request.binding.descriptor.network_required = true;
    await expect(interpretFlightBatch(b, deps)).rejects.toThrow("PRIVACY_POLICY_BLOCKED");
  });
  it("rejects stale pin/hash and late deadlines", async () => {
    const b = await fixture([leg]);
    b.request.materials[0].pin.observed_source_row_revision = 2;
    await expect(interpretFlightBatch(b, deps)).rejects.toThrow("INPUT_STALE");
    const late = await fixture([leg]);
    late.request.binding.deadline = now();
    await expect(interpretFlightBatch(late, deps)).rejects.toThrow(
      "INTERPRETATION_DEADLINE",
    );
  });
  it("does not merge a missing-clock bridge between conflicting known clocks", async () => {
    const r = await run([leg, "NZ289 AKL→CHC 2026-12-18", leg.replace("10:30", "10:45")]);
    expect(r.candidates).toHaveLength(3);
  });
  it("never admits supplier identity from a PNR or an unapproved issuer scope", async () => {
    const r = await run([
      `${leg} occurrence=OTHER:2026-12-18:leg42`,
      `${leg.replace("10:30", "10:45")} occurrence=OTHER:2026-12-18:leg42`,
    ]);
    expect(r.candidates).toHaveLength(2);
  });
  it("returned publication uses exact bounded existing proposal schema and original pins", async () => {
    const b = await fixture([leg]);
    const r = await interpretFlightBatch(b, deps);
    expect(r.publication_request.inputs).toEqual(b.request.materials.map((m) => m.pin));
    expect(canonicalEventJson(r.publication_request as unknown as Json)).not.toContain(
      "deferred_dimensions",
    );
  });
});
