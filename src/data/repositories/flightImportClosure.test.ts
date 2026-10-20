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
import {
  assessFlightCandidate,
  assessFlightCandidateSet,
  flightClosureInputSetSchema,
  flightDeferredReview,
  type FlightClosureCandidate,
  type ClosureContext,
  type FlightBaseline,
  type FlightClosureInputSet,
} from "@/domain/trip/flightImportClosure";
import {
  flightServicesSchema,
  flightCommandLeaves,
  type FlightEndpoint,
  type FlightValues,
} from "@/domain/trip/flightAdmission";
import {
  validateReviewedFlightCommand,
  flightReviewSchema,
  importDigest,
  flightInputSchema,
} from "@/domain/trip/flightImportReview";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import {
  canonicalEventFactsSchema,
  canonicalEndpointSchema,
  canonicalEventReadSchema,
} from "@/data/api/tripCanonicalReadContracts";
import intents from "./__fixtures__/tripImportIntents.json";
import {
  createTripImportAdmissionRepository,
  type ImportAdmissionDatabase,
} from "./tripImportAdmissionRepository";
import { createTripCanonicalEventRepository } from "./tripCanonicalEventRepository";
import {
  createFlightImportClosureOrchestrator,
  buildFlightReviewIntent,
} from "./flightImportClosureOrchestrator";
import catalogs from "./__fixtures__/tripImportCatalogs.json";

const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const id = (n: number) => `ca13b000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const original = catalogs.trip_source_candidates[0],
  run = catalogs.trip_source_runs[0];
const input = catalogs.trip_source_inputs.find((p) => p.run_id === run.id)!;
const pin = flightInputSchema.parse(
  Object.fromEntries(
    Object.keys(flightInputSchema.shape).map((k) => [
      k,
      (input as Record<string, unknown>)[k],
    ]),
  ),
);
const locator = {
  input_id: pin.id,
  kind: "WHOLE" as const,
  page: null,
  start: null,
  end: null,
  region: null,
};
function candidate(): FlightClosureCandidate {
  return {
    id: original.id,
    run_id: run.id,
    proposal_sha256: original.proposal_sha256,
    input_sha256: run.input_sha256,
    output_purpose: "occurrence-1",
    fields: Object.fromEntries(
      Object.entries(original.proposal.fields).map(([k, f]) => [
        k,
        { ...structuredClone(f), locators: [] },
      ]),
    ),
    anchor: {
      eventId: id(99),
      semanticRevision: 1,
      namespace: "IATA_AIRLINE",
      issuer: "IATA",
      operator: "NZ",
      serviceNumber: "0289A",
      originDate: "2026-12-17",
      originAirportId: id(80),
      destinationAirportId: id(81),
      departureClock: "09:00",
      qualified: true,
    },
    continuity: null,
    contradictions: [],
    ambiguity: [],
    entity_resolution: "RESOLVED",
    deferred_dimensions: [],
    resolution_plans: [],
    lineage: [],
    deadlines: [],
  };
}
function set(c = candidate()): FlightClosureInputSet {
  return {
    id: id(1),
    version: 1,
    account_id: catalogs.actor_account_id,
    trip_id: catalogs.trip_id,
    coverage: "COMPLETE",
    inputs: [pin],
    candidates: [c],
  };
}
function context(): ClosureContext {
  return {
    scope: {
      complete: true,
      current: true,
      proposalsComplete: true,
      lineageComplete: true,
      servicesAtEventBaselines: true,
      occurrences: [],
    },
    baselines: [],
    claims: [],
    lineageComplete: true,
    attention: {
      version: "import-attention-v1",
      horizonHours: 24,
      now: "2026-12-16T00:00:00Z",
      clockOrigin: "SUPPLIED",
    },
  };
}
function baseline(c = candidate()): FlightBaseline {
  const values = Object.fromEntries(
    Object.entries(c.fields).map(([k, v]) => [k, v.proposed_value]),
  ) as FlightValues;
  return {
    eventId: id(99),
    semanticRevision: 7,
    values,
    retainedProofs: Object.fromEntries(
      Object.keys(flightCommandLeaves(values)).map((k) => [k, `retained/${k}`]),
    ),
  };
}
function existing(c = candidate()): ClosureContext {
  const x = context();
  x.baselines = [baseline(c)];
  x.scope.occurrences = [{ ...c.anchor!, semanticRevision: 7 }];
  return x;
}
function arrival(c: FlightClosureCandidate) {
  const end = c.fields.destination!.proposed_value as unknown as FlightEndpoint;
  end.time = {
    ...end.time,
    quality: "EXACT",
    basis: "SOURCE_INSTANT",
    local_date: "2026-12-17",
    source_instant: "2026-12-17T07:00:00Z",
    source_instant_precision: 0,
  };
}
function retime(c: FlightClosureCandidate) {
  const end = c.fields.origin!.proposed_value as unknown as FlightEndpoint;
  end.time.source_instant = "2026-12-16T21:00:00.123456Z";
  c.anchor!.departureClock = "10:00";
}
function continuity(c: FlightClosureCandidate) {
  c.continuity = {
    targetId: id(99),
    semanticRevision: 7,
    reason: "RETIME",
    reviewed: true,
    evidence: [locator],
  };
}
function defer(
  c: FlightClosureCandidate,
  dimension: "passengers" | "bookings" | "financial",
  value: Json,
  identity: "UNKNOWN" | "AMBIGUOUS" | "EXPLICIT" | "NOT_APPLICABLE" = "UNKNOWN",
) {
  c.deferred_dimensions.push({
    dimension,
    raw_value: value,
    locator,
    identity,
    reason: "CP13A_NOT_ADMITTED",
  });
}
function review(plan: ReturnType<typeof assessFlightCandidate>) {
  return flightReviewSchema.parse({
    schema_key: "flight-v1",
    schema_version: 1,
    normalization_version: 1,
    match_policy: "import-flight-match-v1",
    selected_fields: [...plan.selected_components].sort(),
    edits: {},
    association_intents: [{ input_id: pin.id, purpose: "CONFIRMED_SUPPORT" }],
    deferred_dimensions: flightDeferredReview(plan.candidate),
  });
}
function selection(plan: ReturnType<typeof assessFlightCandidate>) {
  return {
    disposition: "ACCEPT" as const,
    confirmationId: id(20),
    confirmationKey: "b-review",
    slotId: id(21),
    operationKey: id(22),
    intendedEventId: id(23),
    inputIds: { [pin.id]: id(24) },
    review: review(plan),
  };
}
const fakeContext: AccountRequestContext = {
  accountId: catalogs.actor_account_id,
  tripId: catalogs.trip_id,
  generation: 0,
};

describe("CP13B deterministic Flight closure", () => {
  it("complete new Flight is NEW_ITEM READY with unknown arrival", () => {
    expect(assessFlightCandidate(candidate(), context())).toMatchObject({
      outcome: "NEW_ITEM",
      closure: "READY",
      occurrence: "CREATE",
    });
  });
  it.each(["number-only", "number-date", "missing-departure"])(
    "%s stays INCOMPLETE",
    (kind) => {
      const c = candidate();
      delete c.fields.destination;
      delete c.fields.origin;
      delete c.fields.title;
      if (kind === "number-date")
        c.fields.origin = {
          input_ids: [pin.id],
          locators: [locator],
          proposed_value: { date: "2026-12-17" },
        };
      expect(assessFlightCandidate(c, context()).closure).toBe("INCOMPLETE");
    },
  );
  it("offset-only evidence cannot create source instant or IANA", () => {
    const c = candidate(),
      e = c.fields.origin!.proposed_value as unknown as FlightEndpoint;
    e.time = {
      ...e.time,
      basis: "DERIVED_CIVIL",
      source_instant: null,
      source_instant_precision: null,
      local_time: "09:00",
      clock_precision: -1,
      supplied_offset_seconds: 46800,
    };
    const p = assessFlightCandidate(c, context());
    expect(p.closure).toBe("INCOMPLETE");
    expect(p.occurrence).toBe("NONE");
    expect(p.candidate.fields.origin).toEqual(c.fields.origin);
  });
  it("independently evidenced midnight is executable", () => {
    const c = candidate(),
      e = c.fields.origin!.proposed_value as unknown as FlightEndpoint;
    e.time.source_instant = "2026-12-16T00:00:00Z";
    e.time.source_instant_precision = 0;
    e.time.local_time = "00:00";
    e.time.clock_precision = -1;
    expect(assessFlightCandidate(c, context()).closure).toBe("READY");
  });
  it("full civil resolver tuple is not admitted under Option A", () => {
    const c = candidate(),
      e = c.fields.origin!.proposed_value as unknown as FlightEndpoint;
    e.time.local_time = "09:00";
    e.time.clock_precision = -1;
    e.time.zone_id = "Pacific/Auckland";
    expect(assessFlightCandidate(c, context()).occurrence).toBe("NONE");
  });
  it("same occurrence supports duplicate evidence with closed LINK_ONLY", () => {
    expect(assessFlightCandidate(candidate(), existing())).toMatchObject({
      outcome: "DUPLICATE_EVIDENCE",
      closure: "READY",
      occurrence: "NONE",
      deferred_actions: [{ reason: "LINK_ONLY_CLOSED" }],
    });
  });
  it("unknown existing arrival is completed", () => {
    const c = candidate();
    arrival(c);
    expect(assessFlightCandidate(c, existing())).toMatchObject({
      outcome: "COMPLETE_EXISTING",
      occurrence: "UPDATE",
      selected_components: ["destination"],
    });
  });
  it("retime with exact reviewed continuity is UPDATE", () => {
    const c = candidate();
    retime(c);
    continuity(c);
    expect(assessFlightCandidate(c, existing())).toMatchObject({
      outcome: "UPDATE_EXISTING",
      closure: "READY",
    });
  });
  it("retime without supersession remains CONFLICT", () => {
    const c = candidate();
    retime(c);
    expect(assessFlightCandidate(c, existing()).outcome).toBe("CONFLICT");
  });
  it("unresolved service continuity never creates a second Flight", () => {
    const c = candidate();
    c.anchor!.serviceNumber = "290";
    expect(assessFlightCandidate(c, existing())).toMatchObject({
      outcome: "UNRESOLVED_MATCH",
      occurrence: "NONE",
    });
  });
  it("multiple Sources produce one plan retaining all support", () => {
    const s = set(),
      second = { ...pin, id: id(55), source_id: id(56) };
    s.inputs.push(second);
    s.candidates[0].fields.origin!.input_ids.push(second.id);
    const result = assessFlightCandidateSet(s, { [original.id]: context() });
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].candidate.fields.origin!.input_ids).toHaveLength(2);
  });
  it("exact contradictions survive and block overwrite", () => {
    const c = candidate();
    c.contradictions = [
      { field: "origin", values: ["10:30", "11:15"], evidence: [locator] },
    ];
    expect(assessFlightCandidate(c, context())).toMatchObject({
      closure: "CONFLICT",
      candidate: { contradictions: c.contradictions },
    });
  });
  it.each(["TX", "Caroline"])(
    "same NZ289 with passenger %s only defers augmentation",
    (name) => {
      const c = candidate();
      defer(c, "passengers", name);
      expect(assessFlightCandidate(c, existing())).toMatchObject({
        outcome: "AUGMENT_EXISTING",
        closure: "UNSUPPORTED",
        occurrence: "NONE",
      });
      expect(flightDeferredReview(c)).toMatchObject([
        { dimension: "passengers", reason: "UNSUPPORTED_DIMENSION" },
      ]);
    },
  );
  it("multiple PNRs do not become occurrence identity", () => {
    const c = candidate();
    defer(c, "bookings", ["PNR1", "PNR2"]);
    const p = assessFlightCandidate(c, existing());
    expect(p.outcome).toBe("AUGMENT_EXISTING");
    expect(p.candidate.deferred_dimensions[0].raw_value).toEqual(["PNR1", "PNR2"]);
  });
  it("ambiguous L LI never selects a Person", () => {
    const c = candidate();
    defer(c, "passengers", { name: "L LI", alternatives: [id(60), id(61)] }, "AMBIGUOUS");
    const p = assessFlightCandidate(c, existing());
    expect(p.closure).toBe("NEEDS_REVIEW");
    expect(p.occurrence).toBe("NONE");
  });
  it("explicit Person still remains deferred", () => {
    const c = candidate();
    defer(c, "passengers", { person: id(60) }, "EXPLICIT");
    expect(assessFlightCandidate(c, existing()).occurrence).toBe("NONE");
  });
  it("arrival completion and TX can use safe occurrence action", () => {
    const c = candidate();
    arrival(c);
    defer(c, "passengers", "TX");
    expect(assessFlightCandidate(c, existing())).toMatchObject({
      outcome: "COMPLETE_EXISTING",
      closure: "READY",
      occurrence: "UPDATE",
      deferred_actions: [{ dimension: "passengers" }],
    });
  });
  it("stale exact baseline rejects without rebase", () => {
    const x = existing();
    x.baselines[0].semanticRevision = 8;
    expect(assessFlightCandidate(candidate(), x)).toMatchObject({
      closure: "CONFLICT",
      reasons: ["STALE_BASE_REVISION"],
    });
  });
  it("UNKNOWN predecessor blocks competing CREATE despite empty search", () => {
    const x = context();
    x.claims = [
      {
        candidateId: id(30),
        slotId: id(31),
        slotKey: "occurrence-1",
        outcome: "UNKNOWN",
        targetId: id(99),
        resultRevision: null,
      },
    ];
    expect(assessFlightCandidate(candidate(), x)).toMatchObject({
      occurrence: "NONE",
      reasons: ["PREDECESSOR_OUTCOME_UNKNOWN"],
    });
  });
  it("known success redirects to exact target even absent search", () => {
    const x = context();
    x.baselines = [baseline()];
    x.claims = [
      {
        candidateId: id(30),
        slotId: id(31),
        slotKey: "occurrence-1",
        outcome: "SUCCESS",
        targetId: id(99),
        resultRevision: 1,
      },
    ];
    expect(assessFlightCandidate(candidate(), x)).toMatchObject({
      outcome: "DUPLICATE_EVIDENCE",
      target: { eventId: id(99) },
    });
    x.baselines = [];
    expect(assessFlightCandidate(candidate(), x).occurrence).toBe("NONE");
  });
  it("distinct reviewed output purpose is explicit", () => {
    const c = candidate(),
      x = context();
    x.claims = [
      {
        candidateId: id(30),
        slotId: id(31),
        slotKey: "occurrence-1",
        outcome: "UNKNOWN",
        targetId: null,
        resultRevision: null,
      },
    ];
    c.output_purpose = "distinct-leg";
    c.lineage = [
      {
        ancestor_candidate_id: id(30),
        ancestor_slot_key: "occurrence-1",
        relation: "DISTINCT_OUTPUT",
        review_reason: "Independent evidenced leg",
      },
    ];
    expect(assessFlightCandidate(c, x).outcome).toBe("NEW_ITEM");
  });
  it.each(["NETWORK", "ENRICHMENT"] as const)(
    "eligible unavailable %s stays waiting",
    (wait) => {
      const c = candidate();
      delete c.fields.origin;
      c.resolution_plans = [{ field: "origin", wait, eligible: true, exhausted: false }];
      expect(assessFlightCandidate(c, context()).closure).toBe(`WAITING_FOR_${wait}`);
    },
  );
  it("exhausted resolver returns INCOMPLETE", () => {
    const c = candidate();
    delete c.fields.origin;
    c.fields.services!.locators = [locator];
    c.resolution_plans = [
      { field: "origin", wait: "NETWORK", eligible: true, exhausted: true },
    ];
    expect(assessFlightCandidate(c, context()).closure).toBe("INCOMPLETE");
  });
  it("urgent evidenced boarding deadline leaves missing time unknown", () => {
    const c = candidate();
    delete c.fields.origin;
    c.fields.services!.locators = [locator];
    c.resolution_plans = [
      { field: "origin", wait: "NETWORK", eligible: true, exhausted: false },
    ];
    c.deadlines = [
      {
        kind: "BOARDING",
        instant: "2026-12-16T01:00:00Z",
        calendar_date: null,
        evidence: locator,
      },
    ];
    const p = assessFlightCandidate(c, context());
    expect(p).toMatchObject({
      closure: "WAITING_FOR_NETWORK",
      attention: { severity: "URGENT" },
    });
    expect(p.candidate.fields.origin).toBeUndefined();
  });
  it("attention horizon is configurable and does not change closure", () => {
    const c = candidate();
    delete c.fields.origin;
    c.deadlines = [
      {
        kind: "CHECK_IN",
        instant: "2026-12-17T01:00:00Z",
        calendar_date: null,
        evidence: locator,
      },
    ];
    const a = context(),
      b = context();
    b.attention.horizonHours = 48;
    expect(assessFlightCandidate(c, a).attention.severity).not.toBe("URGENT");
    expect(assessFlightCandidate(c, b).attention.severity).toBe("URGENT");
  });
  it("partial candidate set preserves independent outcomes and counts", () => {
    const s = set(),
      bad = candidate();
    bad.id = id(9);
    delete bad.fields.origin;
    s.candidates.push(bad);
    s.coverage = "PARTIAL";
    const result = assessFlightCandidateSet(s, {
      [original.id]: context(),
      [bad.id]: context(),
    });
    expect(result.progress).toMatchObject({
      candidate_count: 2,
      ready_count: 1,
      incomplete_count: 1,
    });
    expect(result.set.coverage).toBe("PARTIAL");
  });
  it("financial evidence remains raw deferred evidence", () => {
    const c = candidate();
    defer(c, "financial", {
      amount_minor: 12000,
      currency: "NZD",
      payment_date: "2026-12-16",
    });
    const p = assessFlightCandidate(c, context());
    expect(p.occurrence).toBe("CREATE");
    expect(flightDeferredReview(c)[0].dimension).toBe("fare");
    expect(p.candidate.deferred_dimensions[0].raw_value).toEqual(
      c.deferred_dimensions[0].raw_value,
    );
  });
  it("known arrival cannot precede retained departure", () => {
    const c = candidate();
    arrival(c);
    delete c.fields.origin;
    (
      c.fields.destination!.proposed_value as unknown as FlightEndpoint
    ).time.source_instant = "2026-12-15T00:00:00Z";
    expect(assessFlightCandidate(c, existing()).closure).toBe("CONFLICT");
  });
  it("unknown arrival evidence cannot erase known canonical arrival", () => {
    const old = candidate();
    arrival(old);
    expect(assessFlightCandidate(candidate(), existing(old)).closure).toBe("CONFLICT");
  });
  it("bounds reject rather than silently truncate", () => {
    const s = set();
    s.candidates = Array.from({ length: 65 }, (_, n) => ({
      ...candidate(),
      id: id(100 + n),
    }));
    expect(() => flightClosureInputSetSchema.parse(s)).toThrow();
  });
});

describe("CP13B immutable reviewed action coverage", () => {
  it("prepares one atomic update for retime plus arrival with exact retained proof", async () => {
    const c = candidate();
    arrival(c);
    retime(c);
    continuity(c);
    defer(c, "passengers", "TX");
    const p = assessFlightCandidate(c, existing());
    const result = await buildFlightReviewIntent(
      fakeContext,
      set(c),
      p,
      selection(p),
      hash,
    );
    const payload = (
      result.command as {
        payload: {
          changes: FlightValues;
          proofs: Record<string, { kind: string; ref: string }>;
        };
      }
    ).payload;
    expect(payload.changes).toHaveProperty("origin");
    expect(payload.changes).toHaveProperty("destination");
    expect(payload.proofs["ORIGIN.authored_label"]).toEqual({
      kind: "RETAINED",
      ref: "retained/ORIGIN.authored_label",
    });
    expect(JSON.stringify(result.command)).not.toContain("TX");
    expect(result.intent.slots).toHaveLength(1);
    expect(result.intent.inputs[0].id).toBe(id(24));
    expect(result.intent.slots[0].reviewed_payload!.deferred_dimensions[0].input_id).toBe(
      id(24),
    );
    delete payload.changes.origin;
    payload.proofs = Object.fromEntries(
      Object.entries(payload.proofs).filter(([k]) => !k.startsWith("ORIGIN.")),
    );
    expect(() =>
      validateReviewedFlightCommand(
        result.intent.slots[0],
        c.fields,
        "UPDATE_TRANSPORT",
        payload,
      ),
    ).toThrow("INVALID_PROVENANCE");
  });
  it("omitted executable component rejects", async () => {
    const c = candidate();
    arrival(c);
    retime(c);
    continuity(c);
    const p = assessFlightCandidate(c, existing()),
      s = selection(p);
    s.review.selected_fields = ["destination"];
    await expect(
      buildFlightReviewIntent(fakeContext, set(c), p, s, hash),
    ).rejects.toThrow("INCOMPLETE_SELECTED_SUPPORT");
  });
  it("extra support rejects via existing R1 schema", async () => {
    const p = assessFlightCandidate(candidate(), context()),
      s = selection(p);
    s.review.selected_fields.push("ROOT.title");
    await expect(
      buildFlightReviewIntent(fakeContext, set(), p, s, hash),
    ).rejects.toThrow();
  });
  it("explicit defer is a nonexecutable slot", async () => {
    const c = candidate();
    defer(c, "passengers", "TX");
    const p = assessFlightCandidate(c, existing()),
      s = selection(p);
    s.review.selected_fields = [];
    const result = await buildFlightReviewIntent(fakeContext, set(c), p, s, hash);
    expect(result.command).toBeNull();
    expect(result.intent.slots[0]).toMatchObject({
      disposition: "DEFER",
      intended_target_id: null,
      domain_operation_key: null,
    });
  });
  it("passenger evidence cannot silently disappear from review", async () => {
    const c = candidate();
    defer(c, "passengers", "TX");
    const p = assessFlightCandidate(c, context()),
      s = selection(p);
    s.review.deferred_dimensions = [];
    await expect(
      buildFlightReviewIntent(fakeContext, set(c), p, s, hash),
    ).rejects.toThrow("MISSING_DEFERRED_DIMENSION");
  });
  it("REJECT retains references and has no Event operation", async () => {
    const p = assessFlightCandidate(candidate(), context()),
      s = { ...selection(p), disposition: "REJECT" as const };
    s.review.selected_fields = [];
    const result = await buildFlightReviewIntent(fakeContext, set(), p, s, hash);
    expect(result.command).toBeNull();
    expect(result.intent.slots[0].disposition).toBe("REJECT");
  });
  it("duplicate evidence explicitly defers while leaving canonical origins unchanged", async () => {
    const p = assessFlightCandidate(candidate(), existing()),
      s = selection(p);
    s.review.selected_fields = [];
    const result = await buildFlightReviewIntent(fakeContext, set(), p, s, hash);
    expect(result.command).toBeNull();
    expect(result.intent.slots[0].disposition).toBe("DEFER");
  });
  it("explicit title edit records EDITED_EXTRACTED provenance", async () => {
    const p = assessFlightCandidate(candidate(), context()),
      s = selection(p);
    s.review.edits.title = "Reviewed NZ289";
    const result = await buildFlightReviewIntent(fakeContext, set(), p, s, hash);
    expect(result.intent.slots[0].support_payload.title.origin).toBe("EDITED_EXTRACTED");
    expect(
      (result.command as { payload: { core: { title: string } } }).payload.core.title,
    ).toBe("Reviewed NZ289");
  });
});

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
    admission,
    events,
    engine: createFlightImportClosureOrchestrator(admission, events, account, hash),
  };
}
describe("CP13B existing SQLite49 repository orchestration", () => {
  it("READY assessment alone writes no canonical Event or queue operation", async () => {
    const f = native(),
      c = await f.admission.captureContext(catalogs.trip_id);
    await f.admission.applyCatalogs(c, JSON.stringify(catalogs));
    const result = await f.engine.assess(c, set(), { [original.id]: context() });
    expect(result.plans[0].occurrence).toBe("NONE");
    expect(f.sql.prepare("SELECT COUNT(*) n FROM trip_canonical_events").get()?.n).toBe(
      0,
    );
    expect(f.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(0);
  });
  it("review draft survives file cold restart and rejects stale A→B→A context", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cp13b-"));
    dirs.push(dir);
    const path = join(dir, "review.sqlite"),
      f = native(path),
      c = await f.admission.captureContext(catalogs.trip_id);
    await f.admission.applyCatalogs(c, JSON.stringify(catalogs));
    const draft = review(assessFlightCandidate(candidate(), context()));
    await f.engine.saveDraft(c, original.id, run.id, null, draft, run.input_sha256);
    f.sql.close();
    const reopened = native(path, false),
      fresh = await reopened.admission.captureContext(catalogs.trip_id);
    expect(await reopened.engine.readDraft(fresh, original.id)).toMatchObject({
      revision: 1,
      review: draft,
    });
    const b = await beginAccountTransition();
    endAccountTransition(b);
    const a = await beginAccountTransition();
    endAccountTransition(a);
    await expect(reopened.engine.readDraft(c, original.id)).rejects.toThrow(
      "Account changed",
    );
    const latest = await reopened.admission.captureContext(catalogs.trip_id);
    expect(await reopened.engine.readDraft(latest, original.id)).not.toBeNull();
    await expect(
      reopened.engine.saveDraft(latest, original.id, run.id, 1, draft, "f".repeat(64)),
    ).rejects.toThrow("INPUT_STALE");
  });
  it("explicit preparation persists exact C intent and never dispatches Event or Ledger", async () => {
    const f = native(),
      c = await f.admission.captureContext(catalogs.trip_id);
    await f.admission.applyCatalogs(c, JSON.stringify(catalogs));
    // Disposable fixture represents retained unclaimed proposals. No real gate is opened.
    f.sql.exec(
      "PRAGMA foreign_keys=OFF; DELETE FROM trip_source_output_slots; PRAGMA foreign_keys=ON;",
    );
    const plan = (await f.engine.assess(c, set(), { [original.id]: context() })).plans[0];
    expect(plan.closure).toBe("READY");
    const choice = {
      ...selection(plan),
      candidateId: original.id,
      reviewedCandidateHash: original.proposal_sha256,
      reviewedBaseRevision: null,
    };
    const result = await f.engine.prepare(c, set(), { [original.id]: context() }, choice);
    expect(result.command).not.toBeNull();
    expect(f.sql.prepare("SELECT operation_type FROM sync_operations").all()).toEqual([
      { operation_type: "C_PREPARE_CONFIRMATION" },
    ]);
    expect(f.sql.prepare("SELECT COUNT(*) n FROM trip_canonical_events").get()?.n).toBe(
      0,
    );
    expect(f.sql.prepare("SELECT COUNT(*) n FROM ledger_expenses").get()?.n).toBe(0);
    expect(f.sql.prepare("SELECT state FROM trip_source_output_slots").get()?.state).toBe(
      "PREPARED",
    );
    await expect(
      f.engine.prepare(
        c,
        set(),
        { [original.id]: context() },
        { ...choice, reviewedCandidateHash: "f".repeat(64) },
      ),
    ).rejects.toThrow("INPUT_STALE");
  });
});

async function seedCanonical(
  f: ReturnType<typeof native>,
  c: AccountRequestContext,
  revision = 7,
) {
  const r = intents["create-receipt"].result_fields;
  const empty = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, null]));
  const endpoint = (role: "ORIGIN" | "DESTINATION") => {
    const raw = role === "ORIGIN" ? r.origin : r.destination;
    return {
      ...empty(Object.keys(canonicalEndpointSchema.shape)),
      ...Object.fromEntries(
        Object.keys(canonicalEndpointSchema.shape)
          .filter((k) => Object.hasOwn(raw, k))
          .map((k) => [k, (raw as Record<string, unknown>)[k]]),
      ),
      event_id: r.id,
      role,
      location_input_revision: 1,
    };
  };
  const read = canonicalEventReadSchema.parse({
    readVersion: 1,
    disposition: "READ_ONLY",
    legacyCompatible: false,
    event: {
      ...empty(Object.keys(canonicalEventFactsSchema.shape)),
      id: r.id,
      trip_id: catalogs.trip_id,
      temporal_contract_version: 1,
      temporal_shape: "TRANSPORT",
      semantic_revision: revision,
      title: r.title,
      event_type: "transport",
      status: "planned",
      participant_scope: "UNASSIGNED",
      is_estimated_time: false,
      itinerary_transport_endpoints: [endpoint("ORIGIN"), endpoint("DESTINATION")],
    },
  });
  await f.events.applyRead(c, r.id, read);
  await f.admission.applyServices(
    c,
    r.id,
    revision,
    JSON.stringify({
      version: 1,
      event_id: r.id,
      semantic_revision: revision,
      services: r.services.map((s) => ({
        ...s,
        event_id: r.id,
        provenance_refs: Object.fromEntries(
          Object.keys(
            flightCommandLeaves({ services: flightServicesSchema.parse([s]) }),
          ).map((k) => [k.split(".").at(-1)!, `retained/${k}`]),
        ),
      })),
    }),
  );
  return r.id;
}
describe("CP13B canonical repository comparison and CAS", () => {
  it("reads canonical endpoints/services and rejects post-review baseline drift", async () => {
    const f = native(),
      ctx = await f.admission.captureContext(catalogs.trip_id);
    await f.admission.applyCatalogs(ctx, JSON.stringify(catalogs));
    f.sql.exec(
      "PRAGMA foreign_keys=OFF; DELETE FROM trip_source_output_slots; PRAGMA foreign_keys=ON;",
    );
    const eventId = await seedCanonical(f, ctx),
      c = candidate();
    arrival(c);
    const proposal = {
      fields: Object.fromEntries(
        Object.entries(c.fields).map(([k, v]) => [
          k,
          { input_ids: v.input_ids, proposed_value: v.proposed_value },
        ]),
      ),
    };
    c.proposal_sha256 = await importDigest(
      "otr-source-candidate-v1",
      proposal as unknown as Json,
      hash,
    );
    f.sql
      .prepare(
        "UPDATE trip_source_candidates SET proposal=?,proposal_sha256=? WHERE id=?",
      )
      .run(canonicalEventJson(proposal as unknown as Json), c.proposal_sha256, c.id);
    const settings = context();
    settings.scope.occurrences = [{ ...c.anchor!, eventId, semanticRevision: 7 }];
    const plans = await f.engine.assess(ctx, set(c), { [c.id]: settings }),
      plan = plans.plans[0];
    expect(plan).toMatchObject({
      closure: "READY",
      outcome: "COMPLETE_EXISTING",
      target: { eventId, semanticRevision: 7 },
    });
    const choice = {
      ...selection(plan),
      candidateId: c.id,
      reviewedCandidateHash: c.proposal_sha256,
      reviewedBaseRevision: 7,
    };
    const prepared = await f.engine.prepare(ctx, set(c), { [c.id]: settings }, choice);
    expect(
      (prepared.command as { baseSemanticRevision: number }).baseSemanticRevision,
    ).toBe(7);
    const payload = (
      prepared.command as { payload: { proofs: Record<string, { kind: string }> } }
    ).payload;
    expect(payload.proofs["DESTINATION.authored_label"].kind).toBe("RETAINED");
    await seedCanonical(f, ctx, 8);
    await expect(
      f.engine.prepare(ctx, set(c), { [c.id]: settings }, choice),
    ).rejects.toThrow("STALE_BASE_REVISION");
    expect(f.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(1);
    f.sql.exec("DELETE FROM trip_transport_service_mirrors");
    const withheld = await f.engine.assess(ctx, set(c), { [c.id]: settings });
    expect(withheld.plans[0]).toMatchObject({ occurrence: "NONE", closure: "CONFLICT" });
  });
  it("stale Candidate is explicit and does not fail its unrelated sibling", async () => {
    const f = native(),
      ctx = await f.admission.captureContext(catalogs.trip_id);
    await f.admission.applyCatalogs(ctx, JSON.stringify(catalogs));
    const s = set(),
      stale = candidate();
    stale.id = id(69);
    s.candidates.push(stale);
    const result = await f.engine.assess(ctx, s, {
      [original.id]: context(),
      [stale.id]: context(),
    });
    expect(result.plans).toHaveLength(2);
    expect(result.plans[1]).toMatchObject({
      closure: "NEEDS_REVIEW",
      occurrence: "NONE",
      reasons: expect.arrayContaining(["INPUT_STALE"]),
    });
  });
  it("ambiguous passenger explicitly deferred still permits safe reviewed arrival", async () => {
    const c = candidate();
    arrival(c);
    defer(c, "passengers", "L LI", "AMBIGUOUS");
    const p = assessFlightCandidate(c, existing());
    expect(p.closure).toBe("NEEDS_REVIEW");
    const result = await buildFlightReviewIntent(
      fakeContext,
      set(c),
      p,
      selection(p),
      hash,
    );
    expect(result.intent.slots[0].disposition).toBe("UPDATE");
    expect(JSON.stringify(result.command)).not.toContain("L LI");
  });
  it("explicit destination defer differs from omitting a selected arrival", async () => {
    const c = candidate();
    arrival(c);
    retime(c);
    continuity(c);
    const p = assessFlightCandidate(c, existing()),
      s = selection(p);
    s.review.selected_fields = ["origin"];
    s.review.deferred_dimensions.push({
      dimension: "destination",
      candidate_field_key: "destination",
      input_id: null,
      locator: null,
      reason: "UNRESOLVED_TEMPORAL",
    });
    const result = await buildFlightReviewIntent(fakeContext, set(c), p, s, hash);
    expect(
      (result.command as { payload: { changes: FlightValues } }).payload.changes,
    ).toHaveProperty("origin");
    expect(
      (result.command as { payload: { changes: FlightValues } }).payload.changes,
    ).not.toHaveProperty("destination");
  });
  it("a review edit cannot change the matched route without reassessment", async () => {
    const p = assessFlightCandidate(candidate(), context()),
      s = selection(p),
      end = structuredClone(
        candidate().fields.destination!.proposed_value,
      ) as unknown as FlightEndpoint;
    end.location.authored_label = "Unreviewed different airport";
    s.review.edits.destination = end;
    await expect(buildFlightReviewIntent(fakeContext, set(), p, s, hash)).rejects.toThrow(
      "MATCH_REASSESSMENT_REQUIRED",
    );
  });
});

describe("CP13B durable waiting references", () => {
  it("eligible missing departure persists as deferred review without a scheduler", async () => {
    const f = native(),
      ctx = await f.admission.captureContext(catalogs.trip_id);
    await f.admission.applyCatalogs(ctx, JSON.stringify(catalogs));
    const c = candidate();
    delete c.fields.origin;
    c.fields.services!.locators = [locator];
    c.resolution_plans = [
      { field: "origin", wait: "NETWORK", eligible: true, exhausted: false },
    ];
    const plan = assessFlightCandidate(c, context()),
      draft = review(plan);
    draft.selected_fields = [];
    expect(draft.deferred_dimensions).toMatchObject([
      { dimension: "origin", reason: "UNRESOLVED_TEMPORAL", input_id: pin.id },
    ]);
    await f.engine.saveDraft(
      ctx,
      "waiting-flight",
      run.id,
      null,
      draft,
      run.input_sha256,
    );
    expect(await f.engine.readDraft(ctx, "waiting-flight")).toMatchObject({
      review: draft,
    });
    expect(f.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(0);
  });
});

describe("CP13B scoped unsupported contradictions", () => {
  it("passenger contradiction is preserved without blocking independent arrival completion", () => {
    const c = candidate();
    arrival(c);
    defer(c, "passengers", { printed_name: "TX" });
    c.contradictions = [
      { field: "passengers.name", values: ["TX", "Caroline"], evidence: [locator] },
    ];
    const p = assessFlightCandidate(c, existing());
    expect(p).toMatchObject({
      closure: "READY",
      occurrence: "UPDATE",
      reasons: ["DEFERRED_DIMENSION_CONTRADICTION"],
    });
    expect(p.candidate.contradictions).toEqual(c.contradictions);
  });
});
