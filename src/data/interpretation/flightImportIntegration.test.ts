import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "@/data/db/migrations";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  beginAccountTransition,
  endAccountTransition,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import catalogs from "../repositories/__fixtures__/tripImportCatalogs.json";
import intents from "../repositories/__fixtures__/tripImportIntents.json";
import {
  tripImportCatalogSchemas,
  tripImportSnapshotSchema,
} from "../api/tripImportCatalogContracts";
import {
  importDigest,
  flightReviewSchema,
  validateReviewedFlightCommand,
} from "@/domain/trip/flightImportReview";
import { REFERENCE_FLIGHT_DESCRIPTOR } from "@/domain/trip/referenceFlightExtractor";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import {
  interpretFlightBatch,
  flightRunInputDigest,
  flightInterpretationConfiguration,
  FLIGHT_INTERPRETATION_SCHEMA,
  type FlightInterpretationBatch,
  type FlightCandidateSet,
} from "./flightInterpretation";
import {
  projectFlightClosure,
  type FlightClosureChoices,
} from "./flightClosureProjection";
import {
  assessFlightCandidateSet,
  flightDeferredReview,
  type FlightClosureInputSet,
  type ClosureContext,
  type FlightClosurePlan,
  type FlightBaseline,
} from "@/domain/trip/flightImportClosure";
import { flightCommandLeaves, type FlightValues } from "@/domain/trip/flightAdmission";
import {
  createTripImportAdmissionRepository,
  type ImportAdmissionDatabase,
} from "../repositories/tripImportAdmissionRepository";
import { createLocalCaptureInboxRepository } from "../repositories/localCaptureInboxRepository";
import { createTripCanonicalEventRepository } from "../repositories/tripCanonicalEventRepository";
import {
  createFlightImportClosureOrchestrator,
  buildFlightReviewIntent,
} from "../repositories/flightImportClosureOrchestrator";
import {
  canonicalEventFactsSchema,
  canonicalEndpointSchema,
  canonicalEventReadSchema,
} from "../api/tripCanonicalReadContracts";
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
const dbs: DatabaseSync[] = [],
  dirs: string[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) {
    try {
      db.close();
    } catch {}
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function native(path = ":memory:", initialize = true) {
  const sql = new DatabaseSync(path);
  dbs.push(sql);
  if (initialize) {
    for (const m of migrations) sql.exec(m.sql);
    sql
      .prepare(
        "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}','2026-10-06T00:00:00Z')",
      )
      .run(catalogs.actor_account_id, catalogs.trip_id);
  }
  const database: ImportAdmissionDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(q: string, ...p: unknown[]) {
      return (sql.prepare(q).get(...(p as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...p: unknown[]) {
      return sql.prepare(q).all(...(p as never[])) as T[];
    },
    async runAsync(q: string, ...p: unknown[]) {
      return sql.prepare(q).run(...(p as never[])) as never;
    },
    async withTransactionAsync(f: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await f();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  });
  const account = async () => catalogs.actor_account_id;
  const admission = createTripImportAdmissionRepository(
    database,
    account,
    hash,
    () => "2026-10-06T00:00:00Z",
    randomUUID,
  );
  const events = createTripCanonicalEventRepository(database, account);
  return {
    sql,
    database,
    admission,
    events,
    engine: createFlightImportClosureOrchestrator(admission, events, account, hash),
  };
}
const exact = `${leg} depInstant=2026-12-17T21:30:00Z`;
const arrived = `${exact} arrDate=2026-12-18 arr=11:30 arrInstant=2026-12-17T22:30:00Z`;
const choices = (s: FlightCandidateSet): Record<string, FlightClosureChoices> =>
  Object.fromEntries(
    s.candidates.map((c, i) => [
      c.id,
      {
        output_purpose: `occurrence-${i}`,
        continuity: null,
        lineage: [],
        resolution_plans: [],
      },
    ]),
  );
const attention: ClosureContext["attention"] = {
  version: "import-attention-v1",
  horizonHours: 24,
  now: now(),
  clockOrigin: "SUPPLIED",
};
function contexts(
  s: FlightCandidateSet,
  baselines: FlightBaseline[] = [],
  claims: ClosureContext["claims"] = [],
) {
  return Object.fromEntries(
    s.candidates.map((c) => [
      c.id,
      {
        scope: s.matching_scope,
        baselines,
        claims,
        lineageComplete: s.matching_scope.lineageComplete,
        attention,
      },
    ]),
  );
}
async function interpreted(texts = [exact], form?: Parameters<typeof fixture>[1]) {
  const batch = await fixture(texts, form);
  const source = await interpretFlightBatch(batch, deps);
  const view = projectFlightClosure(source, choices(source));
  const assessed = assessFlightCandidateSet(view, contexts(source));
  return { batch, source, view, assessed };
}
// Existing local/test publication seam only: this constructs an admitted snapshot
// and calls normal catalog validation. It is not a new runtime acquisition/publisher.
async function publication(batch: FlightInterpretationBatch, source: FlightCandidateSet) {
  const row = {
    ...catalogs.trip_source_runs[0],
    id: source.run_id,
    operation_key: source.publication_request.operation_key,
    scope_source_ids: source.publication_request.scope_source_ids,
    scope_sha256: await importDigest(
      "otr-source-run-scope-v1",
      [1, trip, account, source.publication_request.scope_source_ids],
      hash,
    ),
    input_sha256: source.input_sha256,
    generation: source.run_generation,
    extractor_key: source.publication_request.extractor_key,
    extractor_version: source.publication_request.extractor_version,
    extractor_options_sha256: source.publication_request.extractor_options_sha256,
  };
  return tripImportSnapshotSchema.parse({
    ...batch.catalog,
    trip_source_runs: [...batch.catalog.trip_source_runs, row],
    trip_source_inputs: [
      ...batch.catalog.trip_source_inputs,
      ...source.publication_request.inputs.map((pin) => ({
        ...pin,
        run_id: row.id,
        confirmation_id: null,
      })),
    ],
    trip_source_candidates: [
      ...batch.catalog.trip_source_candidates,
      ...source.candidates.map((c) => ({
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
    ],
    trip_source_run_predecessors: [
      ...batch.catalog.trip_source_run_predecessors,
      ...source.predecessors.map((p) => ({ ...p, child_run_id: row.id })),
    ],
    trip_source_candidate_lineage: [
      ...batch.catalog.trip_source_candidate_lineage,
      ...source.lineage.map((l) => ({ ...l })),
    ],
  });
}
function selection(view: FlightClosureInputSet, plan: FlightClosurePlan) {
  return {
    candidateId: plan.candidate.id,
    disposition: "ACCEPT" as "ACCEPT" | "DEFER" | "REJECT",
    confirmationId: randomUUID(),
    confirmationKey: randomUUID(),
    slotId: randomUUID(),
    operationKey: randomUUID(),
    intendedEventId: randomUUID(),
    inputIds: Object.fromEntries(view.inputs.map((p) => [p.id, randomUUID()])),
    reviewedCandidateHash: plan.candidate.proposal_sha256,
    reviewedBaseRevision: plan.target?.semanticRevision ?? null,
    review: flightReviewSchema.parse({
      schema_key: "flight-v1",
      schema_version: 1,
      normalization_version: 1,
      match_policy: "import-flight-match-v1",
      selected_fields: [...plan.selected_components].sort(),
      edits: {},
      association_intents: view.inputs.map((p) => ({
        input_id: p.id,
        purpose: "CONFIRMED_SUPPORT",
      })),
      deferred_dimensions: flightDeferredReview(plan.candidate),
    }),
  };
}
async function retained(texts = [exact], path?: string) {
  const x = await interpreted(texts),
    f = native(path),
    ctx = await f.admission.captureContext(trip);
  await f.admission.applyCatalogs(
    ctx,
    JSON.stringify(await publication(x.batch, x.source)),
  );
  const assessed = await f.engine.assess(ctx, x.view, contexts(x.source));
  return { ...x, f, ctx, assessed };
}
function eventBaseline(
  source: FlightCandidateSet,
  eventId = id(999),
  semanticRevision = 7,
): FlightBaseline {
  const c = source.candidates[0];
  const values = Object.fromEntries(
    Object.entries(c.proposal.fields)
      .filter(([k]) => k !== "transport_subtype")
      .map(([k, f]) => [k, f.proposed_value]),
  ) as FlightValues;
  return {
    eventId,
    semanticRevision,
    values,
    retainedProofs: Object.fromEntries(
      Object.keys(flightCommandLeaves(values)).map((k) => [k, `retained/${k}`]),
    ),
  };
}
async function seedEvent(
  f: ReturnType<typeof native>,
  ctx: AccountRequestContext,
  b: FlightBaseline,
) {
  const empty = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, null]));
  const template = intents["create-receipt"].result_fields;
  const endpoints = (["origin", "destination"] as const).map((role) => {
    const end = b.values[role]!;
    const raw = role === "origin" ? template.origin : template.destination;
    const refs = Object.fromEntries(
      Object.keys(flightCommandLeaves({ [role]: end })).map((k) => [
        k.split(".").at(-1),
        `retained/${k}`,
      ]),
    );
    return {
      ...empty(Object.keys(canonicalEndpointSchema.shape)),
      ...Object.fromEntries(
        Object.keys(canonicalEndpointSchema.shape)
          .filter((k) => Object.hasOwn(raw, k))
          .map((k) => [k, (raw as Record<string, unknown>)[k]]),
      ),
      ...Object.fromEntries(
        Object.entries(end.time).filter(([k]) => k !== "fold_choice"),
      ),
      ...end.location,
      event_id: b.eventId,
      role: role.toUpperCase(),
      location_input_revision: 1,
      local_time:
        end.time.clock_precision === -1
          ? `${end.time.local_time}:00`
          : end.time.local_time,
      provenance_refs: refs,
      spatial_provenance_refs: {},
    };
  });
  await f.events.applyRead(
    ctx,
    b.eventId,
    canonicalEventReadSchema.parse({
      readVersion: 1,
      disposition: "READ_ONLY",
      legacyCompatible: false,
      event: {
        ...empty(Object.keys(canonicalEventFactsSchema.shape)),
        id: b.eventId,
        trip_id: trip,
        temporal_contract_version: 1,
        temporal_shape: "TRANSPORT",
        semantic_revision: b.semanticRevision,
        title: b.values.title,
        event_type: "transport",
        status: "planned",
        participant_scope: "UNASSIGNED",
        is_estimated_time: false,
        itinerary_transport_endpoints: endpoints,
      },
    }),
  );
  await f.admission.applyServices(
    ctx,
    b.eventId,
    b.semanticRevision,
    JSON.stringify({
      version: 1,
      event_id: b.eventId,
      semantic_revision: b.semanticRevision,
      services: b.values.services!.map((s) => ({
        ...s,
        event_id: b.eventId,
        provenance_refs: Object.fromEntries(
          Object.keys(flightCommandLeaves({ services: [s] })).map((k) => [
            k.split(".").at(-1),
            `retained/${k}`,
          ]),
        ),
      })),
    }),
  );
}

describe("CP13B integrated evidence → closure → CP13A preparation", () => {
  it("1: retained TEXT produces one NEW READY immutable preparation", async () => {
    const x = await retained(),
      plan = x.assessed.plans[0];
    expect(plan).toMatchObject({
      closure: "READY",
      outcome: "NEW_ITEM",
      occurrence: "CREATE",
    });
    const selected = selection(x.view, plan);
    const prepared = await x.f.engine.prepare(
      x.ctx,
      x.view,
      contexts(x.source),
      selected,
    );
    expect(prepared.intent.slots[0].disposition).toBe("CREATE");
    expect(prepared.intent.slots[0].candidate_id).toBe(x.source.candidates[0].id);
    const support = prepared.intent.slots[0].support_payload.origin;
    expect(
      support.locators?.map((l) => ({ ...l, input_id: x.view.inputs[0].id })),
    ).toEqual(x.source.candidates[0].proposal.fields.origin!.locators);
    expect(x.view.interpretation).toEqual(x.source);
    expect(prepared.intent.inputs[0]).toEqual({
      ...x.view.inputs[0],
      id: selected.inputIds[x.view.inputs[0].id],
    });
  });
  it("2: outbound + return produce two independent plans", async () => {
    const x = await interpreted([
      `${exact}\nNZ281 CHC→AKL 2026-12-20 dep=18:00 depInstant=2026-12-20T05:00:00Z`,
    ]);
    expect(x.assessed.plans).toHaveLength(2);
    expect(x.assessed.progress.ready_count).toBe(2);
  });
  it("3: twelve table rows survive the full N→M closure", async () => {
    const x = await interpreted(
      [
        Array.from(
          { length: 12 },
          (_, i) =>
            `NZ${289 + i} AKL→CHC 2026-12-${String(10 + i).padStart(2, "0")} dep=10:30 depInstant=2026-12-${String(10 + i).padStart(2, "0")}T00:30:00Z`,
        ).join("\n"),
      ],
      "TABLE_TEXT",
    );
    expect(x.source.candidates).toHaveLength(12);
    expect(x.assessed.progress.ready_count).toBe(12);
  });
  it("4: email-like + ticket-like evidence consolidate losslessly", async () => {
    const x = await interpreted([`Flight: ${exact}`, exact], "EMAIL_TEXT");
    expect(x.assessed.plans).toHaveLength(1);
    expect(x.source.candidates[0].input_ids).toHaveLength(2);
    expect(x.view.interpretation).toEqual(x.source);
  });
  it("5: same accepted facts give duplicate evidence, no command", async () => {
    const batch = await fixture([exact]),
      first = await interpretFlightBatch(batch, deps),
      b = eventBaseline(first);
    batch.matching.occurrences = [
      { ...first.candidates[0].anchors[0], eventId: b.eventId, semanticRevision: 7 },
    ];
    await bind(batch);
    const source = await interpretFlightBatch(batch, deps),
      view = projectFlightClosure(source, choices(source));
    const plan = assessFlightCandidateSet(view, contexts(source, [b])).plans[0];
    expect(plan).toMatchObject({ outcome: "DUPLICATE_EVIDENCE", occurrence: "NONE" });
    const prepared = await buildFlightReviewIntent(
      { accountId: account, tripId: trip, generation: 0 },
      view,
      plan,
      {
        ...selection(view, plan),
        review: { ...selection(view, plan).review, selected_fields: [] },
      },
      hash,
    );
    expect(prepared.command).toBeNull();
  });
  it("6: complementary arrival evidence retains both Input supports", async () => {
    const x = await interpreted([exact, arrived]);
    expect(x.source.candidates).toHaveLength(1);
    expect(x.assessed.plans[0].closure).toBe("READY");
    expect(x.view.candidates[0].fields.destination!.input_ids).toHaveLength(2);
  });
  it("7: contradictory departures survive A→B with both evidence alternatives", async () => {
    const x = await interpreted([
      `${exact} occurrence=NZ:2026-12-18:leg42`,
      `${exact.replace(/10:30|21:30/g, (s) => s.replace("30", "45"))} occurrence=NZ:2026-12-18:leg42`,
    ]);
    expect(x.source.candidates).toHaveLength(1);
    const contradiction = x.view.candidates[0].contradictions.find(
      (c) => c.field === "origin.local_time",
    )!;
    expect(contradiction.values).toEqual(
      x.source.candidates[0].contradictions.find((c) => c.path === "origin.local_time")!
        .alternatives,
    );
    expect(contradiction.evidence).toHaveLength(2);
    expect(x.assessed.plans[0]).toMatchObject({
      outcome: "CONFLICT",
      occurrence: "NONE",
    });
    expect(x.view.interpretation).toEqual(x.source);
  });
  it.each([
    [
      "8: same number another date",
      `${exact}\n${exact.replace("2026-12-18", "2026-12-19")}`,
    ],
    ["9: reverse route", `${exact}\n${exact.replace("AKL→CHC", "CHC→AKL")}`],
  ])("%s retains distinct occurrences", async (_, text) => {
    const x = await interpreted([text]);
    expect(x.assessed.plans).toHaveLength(2);
    expect(x.source.resolutions[0].outcome).toBe("DISTINCT_ITEM");
  });
  it("10: codeshare without mapping remains unresolved through B", async () => {
    const x = await interpreted([exact, exact.replace("NZ289", "SQ4289")]);
    expect(x.source.resolutions[0].outcome).toBe("POSSIBLE_DUPLICATE");
    for (const p of x.assessed.plans)
      expect(p).toMatchObject({ outcome: "UNRESOLVED_MATCH", occurrence: "NONE" });
  });
  it("11: evidenced shared operating occurrence supports consolidation", async () => {
    const x = await interpreted([
      `${exact} operating=NZ289`,
      `${exact.replace("NZ289", "SQ4289")} operating=NZ289`,
    ]);
    expect(x.assessed.plans).toHaveLength(1);
    expect(x.assessed.plans[0].closure).toBe("READY");
    expect(x.view.candidates[0].fields.services!.proposed_value).toHaveLength(3);
  });
  it.each([
    ["14: missing departure", "NZ289 AKL→CHC 2026-12-18"],
    ["16: offset-only", `${leg} depOffset=+13:00`],
    ["estimated departure", exact.replace("dep=10:30", "dep=~10:30")],
  ])("%s stays non-executable", async (_, text) => {
    const x = await interpreted([text]);
    expect(x.assessed.plans[0].occurrence).toBe("NONE");
    expect(x.view.interpretation).toEqual(x.source);
  });
  it("15: unknown arrival remains explicitly unknown and allowed", async () => {
    const x = await interpreted();
    expect(x.view.candidates[0].fields.destination!.proposed_value).toMatchObject({
      time: { local_time: null, source_instant: null, quality: "UNKNOWN" },
    });
    expect(x.assessed.plans[0].closure).toBe("READY");
  });
  it("17: explicit independently evidenced midnight is valid", async () => {
    const x = await interpreted([
      exact.replace("10:30", "00:00").replace("21:30", "11:00"),
    ]);
    expect(x.assessed.plans[0].closure).toBe("READY");
    expect(x.view.candidates[0].fields.origin!.proposed_value).toMatchObject({
      time: { local_time: "00:00" },
    });
  });
  it("18: two passengers/different PNR retain one occurrence and deferred augmentation", async () => {
    const batch = await fixture([
      `${exact} passenger=Leon pnr=ABC`,
      `${exact} passenger=TX pnr=XYZ`,
    ]);
    const first = await interpretFlightBatch(batch, deps),
      b = eventBaseline(first);
    batch.matching.occurrences = [
      { ...first.candidates[0].anchors[0], eventId: b.eventId, semanticRevision: 7 },
    ];
    await bind(batch);
    const source = await interpretFlightBatch(batch, deps),
      view = projectFlightClosure(source, choices(source));
    const plan = assessFlightCandidateSet(view, contexts(source, [b])).plans[0];
    expect(plan).toMatchObject({
      outcome: "AUGMENT_EXISTING",
      occurrence: "NONE",
      closure: "UNSUPPORTED",
    });
    expect(plan.deferred_actions).toHaveLength(4);
    expect(view.interpretation).toEqual(source);
    expect(canonicalEventJson(source.publication_request as unknown as Json)).not.toMatch(
      /Leon|TX|ABC|XYZ/,
    );
  });
  it("19: ambiguous passenger is deferred without Person mapping", async () => {
    const x = await interpreted([`${exact} passenger=L LI`]),
      ch = choices(x.source);
    const marker = x.source.candidates[0].deferred_dimensions[0];
    ch[x.source.candidates[0].id].deferred_identity = {
      [`${marker.input_id}:${marker.locator.start}`]: "AMBIGUOUS",
    };
    const view = projectFlightClosure(x.source, ch),
      plan = assessFlightCandidateSet(view, contexts(x.source)).plans[0];
    expect(plan.closure).toBe("NEEDS_REVIEW");
    expect(plan.candidate.deferred_dimensions[0].raw_value).toBeNull();
    expect(view.interpretation).toEqual(x.source);
  });
});
async function existingIntegrated(
  text: string,
  reviewed: "RETIME" | "NUMBER_SUPERSESSION" | null = null,
) {
  const initial = await interpreted(),
    b = eventBaseline(initial.source),
    batch = await fixture([text]);
  batch.matching.occurrences = [
    {
      ...initial.source.candidates[0].anchors[0],
      eventId: b.eventId,
      semanticRevision: b.semanticRevision,
    },
  ];
  await bind(batch);
  const source = await interpretFlightBatch(batch, deps),
    ch = choices(source);
  if (reviewed)
    ch[source.candidates[0].id].continuity = {
      targetId: b.eventId,
      semanticRevision: b.semanticRevision,
      reason: reviewed,
      reviewed: true,
      evidence: source.candidates[0].occurrence.change_notice.observations
        .flatMap((o) => o.fragment_ids)
        .map((id) => source.fragments.find((f) => f.id === id)!.locator),
    };
  const view = projectFlightClosure(source, ch),
    f = native(),
    ctx = await f.admission.captureContext(trip);
  await f.admission.applyCatalogs(ctx, JSON.stringify(await publication(batch, source)));
  await seedEvent(f, ctx, b);
  const assessed = await f.engine.assess(ctx, view, contexts(source));
  return { source, view, f, ctx, assessed, b, batch };
}
const retimed = arrived.replace(/10:30|21:30/g, (s) => s.replace("30", "45"));
describe("CP13B integrated canonical comparison and reviewed support", () => {
  it("20: arrival completion uses the real read-only Event baseline", async () => {
    const x = await existingIntegrated(arrived),
      plan = x.assessed.plans[0];
    expect(plan).toMatchObject({
      closure: "READY",
      outcome: "COMPLETE_EXISTING",
      occurrence: "UPDATE",
      target: { semanticRevision: 7 },
    });
    const prepared = await x.f.engine.prepare(
      x.ctx,
      x.view,
      contexts(x.source),
      selection(x.view, plan),
    );
    expect(prepared.intent.slots[0].disposition).toBe("UPDATE");
    expect((prepared.command as { command: string }).command).toBe("UPDATE_TRANSPORT");
    expect(prepared.intent.slots[0].reviewed_payload!.selected_fields).toEqual([
      "destination",
    ]);
  });
  it("12/21: reviewed retime produces one supported update", async () => {
    const x = await existingIntegrated(`${retimed} change=retimed`, "RETIME"),
      plan = x.assessed.plans[0];
    expect(plan).toMatchObject({
      closure: "READY",
      outcome: "UPDATE_EXISTING",
      occurrence: "UPDATE",
    });
    const prepared = await x.f.engine.prepare(
      x.ctx,
      x.view,
      contexts(x.source),
      selection(x.view, plan),
    );
    expect(prepared.intent.slots[0].reviewed_payload!.selected_fields).toEqual([
      "destination",
      "origin",
    ]);
    const payload = (prepared.command as { payload: unknown }).payload;
    expect(() =>
      validateReviewedFlightCommand(
        prepared.intent.slots[0],
        plan.candidate.fields,
        "UPDATE_TRANSPORT",
        payload,
      ),
    ).not.toThrow();
  });
  it("13: reviewed number supersession keeps one existing target", async () => {
    const x = await existingIntegrated(
        `${exact.replace("NZ289", "NZ281")} change=reissue`,
        "NUMBER_SUPERSESSION",
      ),
      plan = x.assessed.plans[0];
    expect(plan).toMatchObject({
      outcome: "UPDATE_EXISTING",
      target: { eventId: x.b.eventId },
    });
    const prepared = await x.f.engine.prepare(
      x.ctx,
      x.view,
      contexts(x.source),
      selection(x.view, plan),
    );
    expect((prepared.command as { eventId: string }).eventId).toBe(x.b.eventId);
    expect(prepared.intent.slots).toHaveLength(1);
  });
  it("22: changed departure without reviewed continuity remains conflict", async () => {
    const x = await existingIntegrated(retimed),
      plan = x.assessed.plans[0];
    expect(plan).toMatchObject({
      outcome: "CONFLICT",
      occurrence: "NONE",
      closure: "CONFLICT",
    });
    await expect(
      x.f.engine.prepare(x.ctx, x.view, contexts(x.source), selection(x.view, plan)),
    ).rejects.toThrow("CLOSURE_REVIEW_REQUIRED");
  });
  it("23: missing qualified airport observations cannot become NEW", async () => {
    const batch = await fixture([exact]);
    batch.resolved_airports = [];
    await bind(batch);
    const source = await interpretFlightBatch(batch, deps),
      view = projectFlightClosure(source, choices(source));
    const plan = assessFlightCandidateSet(view, contexts(source)).plans[0];
    expect(plan).toMatchObject({ outcome: "UNRESOLVED_MATCH", occurrence: "NONE" });
    const f = native(),
      ctx = await f.admission.captureContext(trip);
    await f.admission.applyCatalogs(
      ctx,
      JSON.stringify(await publication(batch, source)),
    );
    await expect(
      f.engine.prepare(ctx, view, contexts(source), selection(view, plan)),
    ).rejects.toThrow("CLOSURE_REVIEW_REQUIRED");
  });
  it("27: arrival + retime + passenger produces one atomic UPDATE and passenger DEFER", async () => {
    const x = await existingIntegrated(
        `${retimed} change=retimed passenger=TX`,
        "RETIME",
      ),
      plan = x.assessed.plans[0];
    const prepared = await x.f.engine.prepare(
      x.ctx,
      x.view,
      contexts(x.source),
      selection(x.view, plan),
    );
    expect(prepared.intent.slots).toHaveLength(1);
    expect(prepared.intent.slots[0].reviewed_payload!.selected_fields).toEqual([
      "destination",
      "origin",
    ]);
    expect(prepared.intent.slots[0].reviewed_payload!.deferred_dimensions).toMatchObject([
      { dimension: "passengers", reason: "UNSUPPORTED_DIMENSION" },
    ]);
    const command = prepared.command as {
      payload: { changes: Record<string, unknown> };
      eventId: string;
      baseSemanticRevision: number;
    };
    expect(Object.keys(command.payload.changes).sort()).toEqual([
      "destination",
      "origin",
    ]);
    expect(command.eventId).toBe(x.b.eventId);
    expect(command.baseSemanticRevision).toBe(7);
    expect(JSON.stringify(command)).not.toContain("TX");
    expect(x.f.sql.prepare("SELECT COUNT(*) n FROM trip_canonical_events").get()?.n).toBe(
      1,
    );
  });
  it("28: missing selected arrival support is rejected before durable preparation", async () => {
    const x = await existingIntegrated(`${retimed} change=retimed`, "RETIME"),
      plan = x.assessed.plans[0],
      selected = selection(x.view, plan);
    selected.review.selected_fields = ["origin"];
    await expect(
      x.f.engine.prepare(x.ctx, x.view, contexts(x.source), selected),
    ).rejects.toThrow("INCOMPLETE_SELECTED_SUPPORT");
    expect(x.f.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(0);
    const complete = await buildFlightReviewIntent(
        x.ctx,
        x.view,
        plan,
        selection(x.view, plan),
        hash,
      ),
      slot = structuredClone(complete.intent.slots[0]);
    delete slot.support_payload.destination;
    expect(() =>
      validateReviewedFlightCommand(
        slot,
        plan.candidate.fields,
        "UPDATE_TRANSPORT",
        (complete.command as { payload: unknown }).payload,
      ),
    ).toThrow();
  });
  it("29: post-review Event revision change never silently rebases", async () => {
    const x = await existingIntegrated(arrived),
      plan = x.assessed.plans[0],
      selected = selection(x.view, plan);
    await seedEvent(x.f, x.ctx, { ...x.b, semanticRevision: 8 });
    await expect(
      x.f.engine.prepare(x.ctx, x.view, contexts(x.source), selected),
    ).rejects.toThrow("STALE_BASE_REVISION");
    expect(x.f.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(0);
  });
});
async function reprocessed(x: Awaited<ReturnType<typeof retained>>, complete = true) {
  // Retain the admitted prior snapshot while assigning new Run-owned Input IDs.
  const batch = structuredClone(x.batch);
  batch.catalog = (await publication(
    x.batch,
    x.source,
  )) as FlightInterpretationBatch["catalog"];
  batch.request.binding.run_id = id(9800);
  batch.request.binding.request_id = id(9801);
  batch.request.binding.idempotency_key = id(9801);
  batch.request.binding.generation = 2;
  batch.predecessor_run_ids = [x.source.run_id];
  batch.predecessor_candidate_ids = x.source.candidates.map((c) => c.id).sort();
  for (let i = 0; i < batch.request.materials.length; i++) {
    const m = batch.request.materials[i];
    m.pin.id = id(9810 + i);
    for (const a of batch.resolved_airports)
      if (a.input_id === x.batch.request.materials[i].pin.id) a.input_id = m.pin.id;
  }
  batch.matching.complete = complete;
  await bind(batch);
  const source = await interpretFlightBatch(batch, deps),
    view = projectFlightClosure(source, choices(source));
  await x.f.admission.applyCatalogs(
    x.ctx,
    JSON.stringify(await publication(batch, source)),
  );
  return { batch, source, view };
}
async function replacementSplit(x: Awaited<ReturnType<typeof retained>>) {
  const batch = structuredClone(x.batch);
  batch.catalog = (await publication(
    x.batch,
    x.source,
  )) as FlightInterpretationBatch["catalog"];
  const text = `${exact}\nNZ281 CHC→AKL 2026-12-20 dep=18:00 depInstant=2026-12-20T05:00:00Z`;
  const old = batch.request.materials[0],
    representationId = id(9900);
  const digest = await hash(new TextEncoder().encode(text));
  const count = new TextEncoder().encode(text).length;
  const sourceRow = batch.catalog.trip_sources[0];
  sourceRow.row_revision = 2;
  sourceRow.current_material_revision = 2;
  batch.catalog.trip_source_revisions.push({
    ...batch.catalog.trip_source_revisions[0],
    material_revision: 2,
    operation_key: "fixture-replacement-split",
    previous_revision: 1,
    original_representation_ids: [representationId],
  });
  batch.catalog.trip_source_representations.push({
    ...batch.catalog.trip_source_representations[0],
    id: representationId,
    introduced_revision: 2,
    text_content: text,
    payload_sha256: digest,
    byte_count: count,
  });
  old.text = text;
  old.pin = {
    ...old.pin,
    id: id(9901),
    material_revision: 2,
    observed_source_row_revision: 2,
    representation_id: representationId,
    payload_sha256: digest,
    byte_count: count,
  };
  batch.resolved_airports = batch.resolved_airports.map((a) => ({
    ...a,
    input_id: old.pin.id,
  }));
  batch.request.binding.run_id = id(9902);
  batch.request.binding.request_id = id(9903);
  batch.request.binding.idempotency_key = id(9903);
  batch.request.binding.generation = 2;
  batch.predecessor_run_ids = [x.source.run_id];
  batch.predecessor_candidate_ids = x.source.candidates.map((c) => c.id);
  await bind(batch);
  const source = await interpretFlightBatch(batch, deps);
  expect(source.candidates).toHaveLength(2);
  expect(source.lineage).toHaveLength(2);
  await x.f.admission.applyCatalogs(
    x.ctx,
    JSON.stringify(await publication(batch, source)),
  );
  return { source, batch };
}

describe("CP13B integrated lineage, offline retention and bounds", () => {
  it("24: predecessor UNKNOWN blocks a competing CREATE with a new Candidate ID", async () => {
    const x = await retained(),
      first = x.assessed.plans[0];
    await x.f.engine.prepare(x.ctx, x.view, contexts(x.source), selection(x.view, first));
    const next = await reprocessed(x),
      result = await x.f.engine.assess(x.ctx, next.view, contexts(next.source)),
      plan = result.plans[0];
    expect(next.source.candidates[0].id).not.toBe(first.candidate.id);
    expect(next.source.lineage[0].parent_candidate_id).toBe(first.candidate.id);
    expect(next.view.interpretation).toEqual(next.source);
    expect(plan).toMatchObject({
      occurrence: "NONE",
      closure: "NEEDS_REVIEW",
      reasons: expect.arrayContaining(["PREDECESSOR_OUTCOME_UNKNOWN"]),
    });
    await expect(
      x.f.engine.prepare(
        x.ctx,
        next.view,
        contexts(next.source),
        selection(next.view, plan),
      ),
    ).rejects.toThrow("CLOSURE_REVIEW_REQUIRED");
    expect(x.f.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(1);
  });
  it("25: known predecessor success redirects to its exact target even with incomplete search", async () => {
    const x = await retained(),
      selected = selection(x.view, x.assessed.plans[0]);
    await x.f.engine.prepare(x.ctx, x.view, contexts(x.source), selected);
    const next = await reprocessed(x, false),
      b = eventBaseline(x.source, selected.intendedEventId!, 7);
    await seedEvent(x.f, x.ctx, b);
    // An isolated local claim observation stands for existing exact recovery;
    // no server execution/success is manufactured by the product runtime.
    x.f.sql
      .prepare(
        "UPDATE trip_source_output_slots SET state='DOMAIN_SUCCEEDED',finalization_state='PENDING',receipt_ref='fixture-exact-recovered-receipt',result_target_kind='ITINERARY_EVENT',receipt_sha256=?,result_target_id=?,result_revision=? WHERE slot_id=?",
      )
      .run("a".repeat(64), b.eventId, 1, selected.slotId);
    const ch = choices(next.source);
    ch[next.source.candidates[0].id].lineage = [
      {
        ancestor_candidate_id: x.source.candidates[0].id,
        ancestor_slot_key: x.view.candidates[0].output_purpose,
        relation: "CONTINUE",
        review_reason: "Same reviewed occurrence",
      },
    ];
    const view = projectFlightClosure(next.source, ch);
    const result = await x.f.engine.assess(x.ctx, view, contexts(next.source));
    expect(result.plans[0]).toMatchObject({
      outcome: "DUPLICATE_EVIDENCE",
      target: { eventId: b.eventId, semanticRevision: 7 },
      occurrence: "NONE",
    });
    const deferred = selection(view, result.plans[0]);
    deferred.review.selected_fields = [];
    const prepared = await x.f.engine.prepare(
      x.ctx,
      view,
      contexts(next.source),
      deferred,
    );
    expect(prepared.command).toBeNull();
    expect(prepared.intent.lineage_dispositions[0].ancestor_candidate_id).toBe(
      x.source.candidates[0].id,
    );
  });
  it("26: DISTINCT_OUTPUT requires reviewed disposition and retains the predecessor claim", async () => {
    const x = await retained();
    const predecessor = x.assessed.plans.find(
      (p) => p.candidate.fields.title?.proposed_value === "NZ289",
    )!;
    const selected = selection(x.view, predecessor);
    await x.f.engine.prepare(x.ctx, x.view, contexts(x.source), selected);
    const next = await replacementSplit(x),
      returnCandidate = next.source.candidates.find(
        (c) => c.proposal.fields.title?.proposed_value === "NZ281",
      )!,
      ch = choices(next.source);
    ch[returnCandidate.id].output_purpose = "reviewed-return-leg";
    ch[returnCandidate.id].lineage = [
      {
        ancestor_candidate_id: predecessor.candidate.id,
        ancestor_slot_key: predecessor.candidate.output_purpose,
        relation: "DISTINCT_OUTPUT",
        review_reason: "Reviewed independently evidenced return leg",
      },
    ];
    const view = projectFlightClosure(next.source, ch),
      assessed = await x.f.engine.assess(x.ctx, view, contexts(next.source)),
      plan = assessed.plans.find((p) => p.candidate.id === returnCandidate.id)!;
    expect(plan).toMatchObject({ outcome: "NEW_ITEM", occurrence: "CREATE" });
    const prepared = await x.f.engine.prepare(
      x.ctx,
      view,
      contexts(next.source),
      selection(view, plan),
    );
    expect(prepared.intent.lineage_dispositions[0].relation).toBe("DISTINCT_OUTPUT");
    expect(
      x.f.sql
        .prepare(
          "SELECT create_claim_active FROM trip_source_output_slots WHERE slot_id=?",
        )
        .get(selected.slotId)?.create_claim_active,
    ).toBe(1);
    const without = projectFlightClosure(next.source, choices(next.source));
    const blocked = await x.f.engine.assess(x.ctx, without, contexts(next.source));
    expect(blocked.plans.every((p) => p.occurrence === "NONE")).toBe(true);
  });
  it("30: partial Input failure retains valid Candidate outcomes and coverage", async () => {
    const x = await interpreted([
      exact,
      Array.from({ length: 65 }, () => exact).join("\n"),
    ]);
    expect(x.source.status).toBe("PARTIAL");
    expect(x.view.coverage).toBe("PARTIAL");
    expect(x.source.unprocessed_input_ids).toHaveLength(1);
    expect(x.assessed.progress.ready_count).toBe(1);
    expect(x.assessed.set.interpretation).toEqual(x.source);
  });
  it.each(["NETWORK", "ENRICHMENT"] as const)(
    "31/32: %s waits retain durable evidence references",
    async (wait) => {
      const x = await retained([leg]),
        ch = choices(x.source);
      ch[x.source.candidates[0].id].resolution_plans = [
        { field: "origin", wait, eligible: true, exhausted: false },
      ];
      const view = projectFlightClosure(x.source, ch),
        assessed = await x.f.engine.assess(x.ctx, view, contexts(x.source)),
        plan = assessed.plans[0];
      expect(plan.closure).toBe(`WAITING_FOR_${wait}`);
      expect(plan.occurrence).toBe("NONE");
      const selected = selection(view, plan);
      selected.review.selected_fields = [];
      selected.disposition = "DEFER";
      await x.f.engine.saveDraft(
        x.ctx,
        plan.candidate.id,
        x.source.run_id,
        null,
        selected.review,
        x.source.input_sha256,
      );
      expect(await x.f.engine.readDraft(x.ctx, plan.candidate.id)).toMatchObject({
        review: {
          deferred_dimensions: [{ dimension: "origin", reason: "UNRESOLVED_TEMPORAL" }],
        },
      });
      expect(x.f.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(0);
    },
  );
  it("33: preparation/draft and retained evidence survive a file cold restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cp13b-integrated-"));
    dirs.push(dir);
    const path = join(dir, "cold.sqlite"),
      x = await retained([exact], path),
      plan = x.assessed.plans[0],
      selected = selection(x.view, plan);
    await x.f.engine.saveDraft(
      x.ctx,
      plan.candidate.id,
      x.source.run_id,
      null,
      selected.review,
      x.source.input_sha256,
    );
    const prepared = await x.f.engine.prepare(
      x.ctx,
      x.view,
      contexts(x.source),
      selected,
    );
    x.f.sql.close();
    const f = native(path, false),
      ctx = await f.admission.captureContext(trip);
    expect(await f.engine.readDraft(ctx, plan.candidate.id)).toMatchObject({
      review: selected.review,
    });
    const fresh = await f.engine.assess(ctx, x.view, contexts(x.source));
    expect(fresh.plans[0].occurrence).toBe("NONE");
    expect(await f.engine.prepare(ctx, x.view, contexts(x.source), selected)).toEqual(
      prepared,
    );
    expect(f.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(1);
  });
  it("34: real Account A→B→A fences old context and preserves retained A", async () => {
    const x = await retained(),
      other = randomUUID();
    let active = account;
    const engine = createFlightImportClosureOrchestrator(
      x.f.admission,
      x.f.events,
      async () => active,
      hash,
    );
    const b = await beginAccountTransition();
    active = other;
    endAccountTransition(b);
    await expect(engine.assess(x.ctx, x.view, contexts(x.source))).rejects.toThrow(
      "Account changed",
    );
    const a = await beginAccountTransition();
    active = account;
    endAccountTransition(a);
    await expect(engine.assess(x.ctx, x.view, contexts(x.source))).rejects.toThrow(
      "Account changed",
    );
    const fresh = await x.f.admission.captureContext(trip);
    expect(
      (await engine.assess(fresh, x.view, contexts(x.source))).plans[0].closure,
    ).toBe("READY");
  });
  it("35: Candidate Set bounds reject instead of truncating", async () => {
    const x = await interpreted(),
      view = structuredClone(x.view);
    view.candidates = Array.from({ length: 65 }, () => view.candidates[0]);
    expect(() => assessFlightCandidateSet(view, contexts(x.source))).toThrow();
    const tooMany = await interpreted([
      Array.from({ length: 65 }, () => exact).join("\n"),
    ]);
    expect(tooMany.source.status).toBe("FAILED");
    expect(tooMany.assessed.plans).toHaveLength(0);
    expect(tooMany.source.failures[0].category).toBe("LIMIT_EXCEEDED");
  });
  it("36: actual per-Candidate progress composes with PARTIAL input coverage", async () => {
    const rows = [
      exact,
      exact.replace(/NZ289|2026-12-18/g, (s) => (s === "NZ289" ? "NZ281" : "2026-12-19")),
      `${leg.replace("2026-12-18", "2026-12-20")} dep=10:45`,
      leg.replace("2026-12-18", "2026-12-21"),
      leg.replace("2026-12-18", "2026-12-22"),
    ];
    const x = await interpreted([
        rows.join("\n"),
        Array.from({ length: 65 }, () => exact).join("\n"),
      ]),
      ch = choices(x.source);
    const waiting = x.source.candidates.find(
      (c) => c.proposal.fields.origin?.proposed_value.time.local_date === "2026-12-22",
    )!;
    ch[waiting.id].resolution_plans = [
      { field: "origin", wait: "NETWORK", eligible: true, exhausted: false },
    ];
    const view = projectFlightClosure(x.source, ch),
      result = assessFlightCandidateSet(view, contexts(x.source));
    expect(result.progress).toMatchObject({
      candidate_count: 5,
      ready_count: 2,
      conflict_count: 1,
      incomplete_count: 1,
      waiting_network_count: 1,
    });
    expect(result.set.coverage).toBe("PARTIAL");
    expect(result.set.interpretation).toEqual(x.source);
  });
});
describe("CP13B preservation gates and Capture vertical fixture", () => {
  it("37/38/39/40: READY and preparation cannot write Ledger, Day, certificate or canonical Event", async () => {
    const x = await retained(),
      protectedTables = (
        x.f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
          name: string;
        }[]
      ).filter(({ name }) =>
        /^(ledger_|trip_day_|trip_canonical_|trip_transport_service_mirrors)/.test(name),
      );
    expect(protectedTables.some(({ name }) => name === "trip_day_projections")).toBe(
      true,
    );
    for (const { name } of protectedTables)
      for (const operation of ["INSERT", "UPDATE", "DELETE"])
        x.f.sql.exec(
          `CREATE TRIGGER protect_${name}_${operation} BEFORE ${operation} ON "${name}" BEGIN SELECT RAISE(ABORT,'CP13B_UNEXPECTED_DOMAIN_WRITE'); END`,
        );
    const before = protectedTables.map(({ name }) =>
      x.f.sql.prepare(`SELECT * FROM "${name}"`).all(),
    );
    const assessed = await x.f.engine.assess(x.ctx, x.view, contexts(x.source));
    expect(x.f.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(0);
    await x.f.engine.prepare(
      x.ctx,
      x.view,
      contexts(x.source),
      selection(x.view, assessed.plans[0]),
    );
    expect(
      protectedTables.map(({ name }) => x.f.sql.prepare(`SELECT * FROM "${name}"`).all()),
    ).toEqual(before);
    expect(x.f.sql.prepare("SELECT operation_type FROM sync_operations").all()).toEqual([
      { operation_type: "C_PREPARE_CONFIRMATION" },
    ]);
    expect(
      x.f.sql.prepare("SELECT state,dispatched_at FROM trip_source_output_slots").get(),
    ).toEqual({ state: "PREPARED", dispatched_at: null });
    expect(x.f.sql.prepare("SELECT COUNT(*) n FROM trip_canonical_events").get()?.n).toBe(
      0,
    );
  });
  it("CP11 retained TEXT handoff → explicit admitted test Source → A → B → prepare", async () => {
    const f = native(),
      capture = createLocalCaptureInboxRepository(f.database, async () => account, {
        sha256: hash,
        newId: randomUUID,
        now,
      });
    const intake = await capture.intake(
      {
        kind: "TEXT",
        tripId: trip,
        originalFilename: null,
        declaredContentType: "text/plain",
      },
      { bytes: new TextEncoder().encode(exact) },
    );
    const handoff = await capture.getForSourceHandoff(intake.id);
    expect(new TextDecoder().decode(handoff.bytes)).toBe(exact);
    const batch = await fixture([new TextDecoder().decode(handoff.bytes)]),
      source = await interpretFlightBatch(batch, deps);
    expect(batch.request.materials[0].pin.payload_sha256).toBe(handoff.capture.sha256);
    const view = projectFlightClosure(source, choices(source)),
      ctx = await f.admission.captureContext(trip);
    await f.admission.applyCatalogs(
      ctx,
      JSON.stringify(await publication(batch, source)),
    );
    const assessed = await f.engine.assess(ctx, view, contexts(source));
    const prepared = await f.engine.prepare(
      ctx,
      view,
      contexts(source),
      selection(view, assessed.plans[0]),
    );
    expect(prepared.intent.slots[0].disposition).toBe("CREATE");
    expect((await capture.getForSourceHandoff(handoff.capture.id)).bytes).toEqual(
      handoff.bytes,
    );
  });
  it.each(["candidate", "run", "material", "locator", "pin"])(
    "stale %s rejects preparation without queue mutation",
    async (kind) => {
      const x = await retained(),
        view = structuredClone(x.view),
        selected = selection(view, x.assessed.plans[0]);
      if (kind === "candidate") view.candidates[0].proposal_sha256 = "f".repeat(64);
      if (kind === "run") view.candidates[0].run_id = randomUUID();
      if (kind === "material")
        x.f.sql
          .prepare("UPDATE trip_sources SET row_revision=2 WHERE id=?")
          .run(view.inputs[0].source_id);
      if (kind === "locator") view.candidates[0].fields.origin!.locators[0].end!++;
      if (kind === "pin") view.inputs[0].material_revision = 2;
      await expect(
        x.f.engine.prepare(x.ctx, view, contexts(x.source), selected),
      ).rejects.toThrow("INPUT_STALE");
      expect(x.f.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(0);
    },
  );
  it("closure cannot upgrade A's incomplete match scope or unresolved pair", async () => {
    const batch = await fixture([exact]);
    batch.matching.complete = false;
    await bind(batch);
    const source = await interpretFlightBatch(batch, deps),
      view = projectFlightClosure(source, choices(source)),
      supplied = contexts(source);
    supplied[source.candidates[0].id].scope = {
      ...source.matching_scope,
      complete: true,
    };
    expect(() => assessFlightCandidateSet(view, supplied)).toThrow("MATCH_SCOPE_CHANGED");
    const unresolved = await interpreted([exact, exact.replace("NZ289", "SQ4289")]);
    const changed = structuredClone(unresolved.view);
    changed.candidates[0].entity_resolution = "RESOLVED";
    expect(() => assessFlightCandidateSet(changed, contexts(unresolved.source))).toThrow(
      "MATCH_RESOLUTION_CHANGED",
    );
  });
  it("several Inputs/several Flights retain N→M through closure", async () => {
    const text = `${exact}\nNZ281 CHC→AKL 2026-12-20 dep=18:00 depInstant=2026-12-20T05:00:00Z`;
    const x = await interpreted([text, text]);
    expect(x.assessed.plans).toHaveLength(2);
    expect(x.assessed.progress.ready_count).toBe(2);
    for (const p of x.assessed.plans)
      expect(p.candidate.fields.origin!.input_ids).toHaveLength(2);
    expect(x.assessed.set.interpretation).toEqual(x.source);
  });
});
describe("CP13B attention retains evidenced deadlines independently", () => {
  it("exact departure deadline and configurable horizon do not alter closure/identity", async () => {
    const x = await interpreted([`${exact} passenger=L LI`]),
      ch = choices(x.source),
      c = x.source.candidates[0],
      marker = c.deferred_dimensions[0];
    ch[c.id].deferred_identity = {
      [`${marker.input_id}:${marker.locator.start}`]: "AMBIGUOUS",
    };
    const view = projectFlightClosure(x.source, ch),
      supplied = contexts(x.source);
    supplied[c.id].attention = {
      ...attention,
      now: "2026-12-17T20:30:00Z",
      horizonHours: 2,
    };
    const urgent = assessFlightCandidateSet(view, supplied).plans[0];
    expect(urgent.attention.severity).toBe("URGENT");
    expect(urgent.attention.deadlines[0].instant).toBe("2026-12-17T21:30:00Z");
    supplied[c.id].attention = { ...supplied[c.id].attention, horizonHours: 0 };
    const later = assessFlightCandidateSet(view, supplied).plans[0];
    expect(later.attention.severity).not.toBe("URGENT");
    expect(later.closure).toBe(urgent.closure);
    expect(later.candidate).toEqual(urgent.candidate);
  });
  it("offset-only timeline gives calendar attention without an invented instant", async () => {
    const x = await interpreted([`${leg} depOffset=+13:00`]);
    expect(x.assessed.plans[0].attention.deadlines[0]).toMatchObject({
      instant: null,
      calendar_date: "2026-12-18",
    });
    expect(x.view.interpretation).toEqual(x.source);
  });
});
