import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
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
import catalogs from "@/data/repositories/__fixtures__/tripImportCatalogs.json";
import {
  tripImportCatalogSchemas,
  tripImportSnapshotSchema,
} from "@/data/api/tripImportCatalogContracts";
import intents from "@/data/repositories/__fixtures__/tripImportIntents.json";
import {
  canonicalEventFactsSchema,
  canonicalEndpointSchema,
  canonicalEventReadSchema,
} from "@/data/api/tripCanonicalReadContracts";
import { flightCommandLeaves, type FlightValues } from "@/domain/trip/flightAdmission";
import { importDigest } from "@/domain/trip/flightImportReview";
import { REFERENCE_FLIGHT_DESCRIPTOR } from "@/domain/trip/referenceFlightExtractor";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import {
  interpretFlightBatch,
  flightRunInputDigest,
  flightInterpretationConfiguration,
  FLIGHT_INTERPRETATION_SCHEMA,
  type FlightInterpretationBatch,
  type FlightCandidateSet,
} from "@/data/interpretation/flightInterpretation";
import { type FlightClosureChoices } from "@/data/interpretation/flightClosureProjection";
import {
  type ClosureContext,
  type FlightBaseline,
} from "@/domain/trip/flightImportClosure";
import {
  createTripImportAdmissionRepository,
  type ImportAdmissionDatabase,
} from "@/data/repositories/tripImportAdmissionRepository";
import { createTripCanonicalEventRepository } from "@/data/repositories/tripCanonicalEventRepository";
import { createFlightImportClosureOrchestrator } from "@/data/repositories/flightImportClosureOrchestrator";
import { spawnSync } from "node:child_process";
import {
  createClosedInboundAiClient,
  inboundId,
  inboundRequestDigest,
  type InboundProjectionMaterial,
} from "./inboundAiClient";
import {
  commandDigest,
  type ProtectedCommand,
  type VerifiedCallContextV1,
  type PrivateMaterialCustody,
} from "./externalIntegrationPersistence";
import {
  inboundPackageSchema,
  type InboundScope,
} from "@/domain/intelligence/inboundImportPackage";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const account = catalogs.actor_account_id,
  trip = catalogs.trip_id;
const id = (n: number) => `ca13b000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = () => "2026-10-06T00:00:00Z";
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
// Test transport projections only. PostgreSQL mode calls the unchanged protected
// Server83 roots; default mode is a fault-injection double, never shipped authority.
type Row = Record<string, any>;
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

const actual = process.env.CP14_B2_SERVER83 === "1";
function sql(body: string) {
  const container = "otr-cp14-b2-preflight";
  expect(
    spawnSync(
      "docker",
      ["inspect", container, "--format", "{{.HostConfig.NetworkMode}}"],
      { encoding: "utf8" },
    ).stdout.trim(),
  ).toBe("none");
  const r = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
    ],
    { input: body, encoding: "utf8" },
  );
  if (r.status !== 0)
    throw new Error(r.stderr.match(/ERROR:\s+([^\n]+)/)?.[1] ?? "B2_FIXTURE_SQL_FAILURE");
  return r.stdout.trim();
}
const literal = (v: unknown) =>
  "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
const sign = <T extends Record<string, unknown>>(raw: T) => ({
  ...raw,
  request_sha256: inboundRequestDigest(raw),
});
async function harness(texts = [exact], staging = false) {
  const integration = `b2-${randomUUID()}`,
    client = randomUUID(),
    grant = randomUUID(),
    packageId = randomUUID();
  const scope: InboundScope = {
    integration_id: integration,
    client_identity_id: client,
    account_id: account,
    grant_id: grant,
    grant_revision: 1,
    trip_id: staging ? null : trip,
    package_id: packageId,
  };
  const batch = await fixture(texts);
  const dir = mkdtempSync(join(tmpdir(), "otr-b2-"));
  dirs.push(dir);
  let local = native(join(dir, "device.sqlite"));
  const packages = new Map<string, Row>(),
    invocations = new Map<string, Row>(),
    decisions = new Map<string, Row>(),
    requests = new Map<string, string>();
  const commands: { kind: ProtectedCommand; body: Row }[] = [];
  let principal: VerifiedCallContextV1["principal_kind"] = "EXTERNAL_CLIENT",
    denied = false,
    expires = false,
    tripDenied = false;
  let lost: ProtectedCommand | null = null,
    losePrepare = false,
    custodyCount = 0,
    admissionCount = 0,
    publishCount = 0,
    prepareCount = 0,
    configVersion = 2;
  let authPatch: Partial<VerifiedCallContextV1> = {},
    hook: (() => void | Promise<void>) | null = null;
  function context(
    requestId: string,
    digest: string,
    command: string,
  ): VerifiedCallContextV1 {
    return {
      version: 1,
      principal_kind: principal,
      verified_actor_id: account,
      verified_account_id: account,
      verified_client_identity: client,
      verified_external_subject: {
        issuer_namespace: "synthetic",
        subject_digest: "a".repeat(64),
      },
      verified_environment: "TEST",
      auth_source: "TEST_ONLY_INJECTED_VERIFIER",
      auth_config_version: 1,
      auth_session_reference: "vault:synthetic-session",
      verified_at: now(),
      expires_at: "2070-01-01T00:00:00Z",
      revoked: false,
      request_id: requestId,
      request_sha256: digest,
      command_kind: command,
      gateway_identity: "otr_external_integration_inbound_gateway",
      ...authPatch,
    };
  }
  if (actual) {
    sql(
      `insert into auth.users(id) values('${account}') on conflict do nothing; insert into public.profiles(id,display_name) values('${account}','B2 synthetic') on conflict do nothing; insert into public.trips(id,name,created_by) values('${trip}','B2 synthetic','${account}') on conflict(id) do update set created_by=excluded.created_by;`,
    );
    const template = (table: string) =>
      JSON.parse(sql(`select to_jsonb(t) from public.${table} t limit 1;`));
    const adminActor = sql(
      "select actor_id from public.external_integration_admin_grants where permission='CONFIG_ADMIN' and revoked_at is null and expires_at>clock_timestamp() limit 1;",
    );
    function root(
      kind: string,
      fields: Row,
      actor = adminActor,
      gateway = "otr_external_integration_admin_gateway",
      who: VerifiedCallContextV1["principal_kind"] = "OTR_ADMIN",
    ) {
      const body = {
        version: 1,
        environment: "TEST",
        request_id: randomUUID(),
        ...fields,
      };
      const command = { ...body, request_sha256: commandDigest(body) };
      const ctx = {
        ...context(command.request_id, command.request_sha256, kind),
        principal_kind: who,
        verified_actor_id: actor,
        verified_account_id: actor,
        gateway_identity: gateway,
      };
      return JSON.parse(
        sql(
          `set session authorization ${gateway};select public.${kind}(${literal(ctx)},${literal(command)});`,
        ),
      );
    }
    const registry = {
      ...template("external_integrations"),
      integration_id: integration,
      category: "AI_CLIENT_INBOUND",
      vendor_namespace: "synthetic",
      environment: "TEST",
      admin_label: "B2 synthetic",
      enabled: true,
      kill_switch: true,
      config_version: 1,
      config_sha256: "a".repeat(64),
      capabilities: ["SUBMIT", "STATUS", "REVIEW"],
      quota_limit: null,
      quota_window_seconds: null,
      rate_per_minute: null,
      created_by: adminActor,
      updated_by: adminActor,
    };
    root("external_integration_configure", {
      actor_id: adminActor,
      integration_id: integration,
      expected_version: null,
      audit_id: randomUUID(),
      reason_code: "SYNTHETIC",
      row: registry,
    });
    root("external_integration_set_kill", {
      actor_id: adminActor,
      integration_id: integration,
      expected_version: 1,
      audit_id: randomUUID(),
      reason_code: "SYNTHETIC",
      kill_switch: false,
    });
    const identity = {
      ...template("external_client_identities"),
      client_identity_id: client,
      integration_id: integration,
      issuer_namespace: "synthetic",
      subject_digest: "a".repeat(64),
      auth_config_reference: "authcfg:synthetic-v1",
      enabled: true,
      created_at: now(),
      updated_at: now(),
    };
    const authority = {
      ...template("external_client_grants"),
      grant_id: grant,
      integration_id: integration,
      client_identity_id: client,
      account_id: account,
      user_id: account,
      scope_kind: staging ? "ACCOUNT_STAGING" : "SINGLE_TRIP",
      trip_id: scope.trip_id,
      actions: ["SUBMIT", "STATUS", "REVIEW"],
      auth_session_reference: "vault:synthetic-session",
      expires_at: "2070-01-01T00:00:00Z",
      revoked_at: null,
      grant_revision: 1,
      authorized_by: account,
      quota_limit: null,
      quota_window_seconds: null,
      created_at: now(),
      updated_at: now(),
    };
    root(
      "external_client_authorize_grant",
      {
        actor_id: account,
        account_id: account,
        client_identity_id: client,
        integration_id: integration,
        expected_version: null,
        audit_id: randomUUID(),
        reason_code: "SYNTHETIC",
        identity,
        row: authority,
      },
      account,
      "otr_external_integration_inbound_gateway",
      "OTR_USER",
    );
  }
  const custody: PrivateMaterialCustody = {
    async put(p) {
      custodyCount++;
      expect(await hash(p.bytes)).toBe(p.sha256);
      expect(p.bytes.byteLength).toBe(p.byteCount);
      const reference = inboundId(p.accountId, p.reservationId, p.sha256);
      const path = join(dir, reference);
      if (!exists(path)) writeFileSync(path, p.bytes);
      return { reference };
    },
    async verify(p) {
      return (
        exists(join(dir, p.reference)) &&
        (await hash(readFileSync(join(dir, p.reference)))) === p.sha256 &&
        readFileSync(join(dir, p.reference)).byteLength === p.byteCount
      );
    },
    async read(p) {
      if (!(await custody.verify(p))) throw new Error("CUSTODY_INVALID");
      return readFileSync(join(dir, p.reference));
    },
    async release() {
      throw new Error("RESPONSIBILITY_OPEN");
    },
  };
  function exists(path: string) {
    try {
      readFileSync(path);
      return true;
    } catch {
      return false;
    }
  }
  async function execute(
    kind: ProtectedCommand,
    ctx: VerifiedCallContextV1,
    body: unknown,
  ) {
    const b = body as Row;
    commands.push({ kind, body: structuredClone(b) });
    let result: Row;
    if (actual)
      result = JSON.parse(
        sql(
          `set session authorization otr_external_integration_inbound_gateway;select public.${kind}(${literal(ctx)},${literal(b)});`,
        ),
      );
    else {
      if (
        denied ||
        expires ||
        tripDenied ||
        b.grant_id !== grant ||
        b.grant_revision !== 1 ||
        b.trip_id !== scope.trip_id
      )
        throw new Error("CP14_GRANT_FORBIDDEN");
      const oldRequest = requests.get(b.request_id);
      if (oldRequest && oldRequest !== b.request_sha256)
        throw new Error("CP14_CHANGED_REQUEST");
      requests.set(b.request_id, b.request_sha256);
      const pkg = packages.get(b.package_id);
      switch (kind) {
        case "inbound_ai_reserve_package": {
          if (
            pkg &&
            (pkg.package_sha256 !== b.row.package_sha256 ||
              pkg.idempotency_key !== b.row.idempotency_key)
          )
            throw new Error("CP14_CHANGED_PACKAGE");
          if (!pkg) packages.set(b.package_id, structuredClone(b.row));
          result = packages.get(b.package_id)!;
          break;
        }
        case "inbound_ai_attach_material":
          Object.assign(pkg!, {
            package_material_reference: b.material_reference,
            state: "MATERIAL_PENDING",
            row_revision: pkg!.row_revision + 1,
          });
          result = pkg!;
          break;
        case "inbound_ai_status":
          if (!pkg) throw new Error("CP14_PACKAGE_SCOPE");
          result = {
            version: 1,
            reservation_id: pkg.reservation_id,
            state: pkg.state,
            result_version: pkg.result_version,
            result_sha256: pkg.result_sha256,
          };
          break;
        case "inbound_ai_reserve_invocation":
          if (!invocations.has(b.row.request_id))
            invocations.set(b.row.request_id, {
              ...structuredClone(b.row),
              call: structuredClone(b.call),
            });
          result = invocations.get(b.row.request_id)!;
          break;
        case "inbound_ai_complete_invocation": {
          const inv = [...invocations.values()].find(
            (i) => i.invocation_id === b.invocation_id,
          )!;
          Object.assign(inv, {
            state: b.state,
            safe_response: b.safe_response,
            response_sha256: b.response_sha256,
            row_revision: inv.row_revision + 1,
          });
          const { expected_revision: _, ...update } = b.reservation_update;
          void _;
          Object.assign(pkg!, update, { row_revision: pkg!.row_revision + 1 });
          result = inv;
          break;
        }
        case "inbound_ai_reserve_review":
          if (ctx.principal_kind !== "OTR_USER")
            throw new Error("CP14_CONFIRMATION_REQUIRED");
          if (!decisions.has(b.row.review_key))
            decisions.set(b.row.review_key, structuredClone(b.row));
          result = decisions.get(b.row.review_key)!;
          break;
        case "inbound_ai_observe_review":
          result = [...decisions.values()].find(
            (d) => d.review_decision_id === b.review_decision_id,
          )!;
          Object.assign(result, {
            state: b.state,
            preparation_sha256: b.preparation_sha256,
            safe_result: b.safe_result,
            result_sha256: b.result_sha256,
            row_revision: result.row_revision + 1,
          });
          break;
        default:
          throw new Error("UNEXPECTED_ROOT");
      }
    }
    if (lost === kind) {
      lost = null;
      throw new Error("TRANSPORT_LOST");
    }
    return structuredClone(result);
  }
  const readPackage = async () =>
    actual
      ? JSON.parse(
          sql(
            `select to_jsonb(p) from public.inbound_ai_import_reservations p where integration_id='${integration}' and package_id='${packageId}';`,
          ),
        )
      : structuredClone(packages.get(packageId));
  const readInvocation = async (_: InboundScope, key: string) =>
    actual
      ? JSON.parse(
          sql(
            `select coalesce((select to_jsonb(i)||jsonb_build_object('call',to_jsonb(c)) from public.inbound_ai_invocations i join public.external_integration_calls c using(call_id) where i.integration_id='${integration}' and i.request_id='${key}'),'null'::jsonb);`,
          ),
        )
      : structuredClone(invocations.get(key) ?? null);
  const readDecision = async (_: InboundScope, key: string) =>
    actual
      ? JSON.parse(
          sql(
            `select coalesce((select to_jsonb(d) from public.inbound_ai_review_decisions d join public.inbound_ai_import_reservations p using(reservation_id) where p.integration_id='${integration}' and d.review_key='${key}'),'null'::jsonb);`,
          ),
        )
      : structuredClone(decisions.get(key) ?? null);
  const dependencies: Parameters<typeof createClosedInboundAiClient>[0] = {
    mode: "TEST_ONLY",
    async verify(r) {
      return context(r.requestId, r.requestSha256, r.action);
    },
    execute,
    custody,
    verifyCustody: async (ctx, p) =>
      await custody.verify({
        accountId: ctx.verified_account_id!,
        reference: p.reference,
        sha256: p.sha256,
        byteCount: readFileSync(join(dir, p.reference)).byteLength,
      }),
    readPackage,
    readInvocation,
    readDecision,
    async readPublishedRun(c, runId) {
      return local.sql
        .prepare(
          "select generation,input_sha256 from trip_source_runs where cache_account_id=? and trip_id=? and id=?",
        )
        .get(c.accountId, c.tripId, runId) as {
        generation: number;
        input_sha256: string;
      };
    },
    async readIntegration() {
      return actual
        ? JSON.parse(
            sql(
              `select jsonb_build_object('config_version',config_version,'config_sha256',config_sha256) from public.external_integrations where integration_id='${integration}';`,
            ),
          )
        : { config_version: configVersion, config_sha256: "a".repeat(64) };
    },
    projectionMaterial: {
      async retain(_s, digest, body) {
        const path = join(dir, digest);
        if (exists(path)) expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(body);
        else writeFileSync(path, canonicalEventJson(body as unknown as Json));
      },
      async read(_s, digest) {
        const path = join(dir, digest);
        return exists(path)
          ? (JSON.parse(readFileSync(path, "utf8")) as InboundProjectionMaterial)
          : null;
      },
    },
    async admit(_s, _p, runId) {
      admissionCount++;
      if (hook) {
        const fn = hook;
        hook = null;
        await fn();
      }
      batch.request.binding.run_id = runId;
      return structuredClone(batch);
    },
    async publish(c, set) {
      publishCount++;
      await local.admission.applyCatalogs(
        c,
        JSON.stringify(await publication(batch, set)),
      );
    },
    async reviewContext(set) {
      return { choices: choices(set), contexts: contexts(set) };
    },
    closure: {
      ...local.engine,
      assess: (...args) => local.engine.assess(...args),
      async prepare(...args) {
        prepareCount++;
        const prepared = await local.engine.prepare(...args);
        if (losePrepare) {
          losePrepare = false;
          throw new Error("TRANSPORT_LOST");
        }
        return prepared;
      },
    },
    async readExactPreparation(c, row) {
      const found = (await local.admission.pending(c)).find(
        (p) =>
          p.entity_id === row.confirmation_id &&
          p.operation_type === "C_PREPARE_CONFIRMATION",
      );
      return found
        ? { intent: JSON.parse(found.payload_json as string), command: null }
        : null;
    },
    getAccountId: async () => account,
    now,
  };
  const p = inboundPackageSchema.parse({
    contract_version: "otr-inbound-import-v1",
    package_version: 1,
    package_id: packageId,
    idempotency_key: randomUUID(),
    client_identity_id: client,
    account_id: account,
    trip_intent: staging ? { kind: "SELECT" } : { kind: "KNOWN", trip_id: trip },
    requested_action: "SUBMIT",
    materials: batch.request.materials.map((m) => ({
      id: m.pin.id,
      reference: m.pin.representation_id,
      sha256: m.pin.payload_sha256,
      byte_count: m.pin.byte_count,
      kind: "MATERIAL",
    })),
    items: [
      {
        id: "flight",
        family: "FLIGHT",
        material_ids: batch.request.materials.map((m) => m.pin.id),
      },
    ],
    summaries: [],
  });
  const request = sign({
    version: 1,
    environment: "TEST",
    request_id: randomUUID(),
    scope,
    package: p,
    expected_review_version: 0,
  });
  const status = () =>
    sign({ version: 1, environment: "TEST", request_id: randomUUID(), scope });
  const decision = (
    proposal: Awaited<
      ReturnType<ReturnType<typeof createClosedInboundAiClient>["submit"]>
    >,
    disposition = "ACCEPT",
  ) => ({
    version: 1,
    environment: "TEST",
    request_id: randomUUID(),
    scope,
    review_key: randomUUID(),
    review_version: proposal.proposal.review_version,
    proposal_sha256: proposal.proposal_sha256,
    ...proposal.proposal.candidates[0],
    closure: undefined,
    action: undefined,
    disposition,
  });
  // Remove projection-only fields before the strict authenticated request boundary.
  const choose = (proposal: Parameters<typeof decision>[0], disposition = "ACCEPT") => {
    const raw = decision(proposal, disposition);
    const { closure: _, action: __, ...d } = raw;
    void _;
    void __;
    return sign(d);
  };
  return {
    adapter: createClosedInboundAiClient(dependencies),
    restart: () => createClosedInboundAiClient(dependencies),
    dependencies,
    local,
    batch,
    reopen: () => {
      local.sql.close();
      local = native(join(dir, "device.sqlite"), false);
      return createClosedInboundAiClient(dependencies);
    },
    scope,
    request,
    p,
    status,
    choose,
    commands,
    readPackage,
    readDecision,
    external: () => {
      principal = "EXTERNAL_CLIENT";
    },
    user: () => {
      principal = "OTR_USER";
    },
    lose: (kind: ProtectedCommand) => {
      lost = kind;
    },
    losePrepare: () => {
      losePrepare = true;
    },
    patch: (p: Partial<VerifiedCallContextV1>) => {
      authPatch = p;
    },
    hook: (fn: () => void | Promise<void>) => {
      hook = fn;
    },
    rotate: () => {
      configVersion++;
    },
    revoke: () => {
      denied = true;
      if (actual)
        sql(
          `alter table public.external_client_grants disable trigger user; update public.external_client_grants set revoked_at=clock_timestamp(),grant_revision=grant_revision+1 where grant_id='${grant}';alter table public.external_client_grants enable trigger user;`,
        );
    },
    expire: () => {
      expires = true;
      if (actual)
        sql(
          `alter table public.external_client_grants disable trigger user; update public.external_client_grants set expires_at='2000-01-01T00:00:00Z',grant_revision=grant_revision+1 where grant_id='${grant}';alter table public.external_client_grants enable trigger user;`,
        );
    },
    revokeTrip: () => {
      tripDenied = true;
      if (actual)
        sql(
          `update public.trips set created_by=(select actor_id from public.external_integration_admin_grants where permission='CONFIG_ADMIN' limit 1) where id='${trip}';delete from public.journey_members where trip_id='${trip}' and user_id='${account}';`,
        );
    },
    counts: () => ({
      custodyCount,
      admissionCount,
      publishCount,
      prepareCount,
      decisions: actual
        ? Number(
            sql(
              `select count(*) from public.inbound_ai_review_decisions d join public.inbound_ai_import_reservations p using(reservation_id) where p.integration_id='${integration}';`,
            ),
          )
        : decisions.size,
    }),
  };
}

describe(
  actual
    ? "B2 unchanged Server83 + native SQLite50 lifecycle"
    : "B2 native CP13B/CP13A lifecycle with fault-injected transport",
  () => {
    it("retains a NEEDS_REVIEW proposal with no decision/authority IDs and restarts exact status", async () => {
      const h = await harness();
      const first = await h.adapter.submit(h.request);
      expect(first.proposal.state).toBe("NEEDS_REVIEW");
      expect(first.proposal.candidates).toHaveLength(1);
      expect(first.proposal.candidates[0].closure).toBe("READY");
      expect(h.counts().decisions).toBe(0);
      expect(h.counts().prepareCount).toBe(0);
      expect(h.commands.some((c) => c.kind === "inbound_ai_reserve_review")).toBe(false);
      expect(await h.restart().status(h.status())).toEqual(first);
      expect(await h.restart().submit(h.request)).toEqual(first);
      expect(h.counts().admissionCount).toBe(1);
      expect(JSON.stringify(first)).not.toMatch(
        /confirmed_user|confirmed_at|confirmation_id|slot_id|operation_key|intended_event|PNR|passenger|text_content/,
      );
      const call = h.commands.find(
        (c) => c.kind === "inbound_ai_reserve_invocation",
      )!.body;
      expect(call.call.call_kind).toBe("INBOUND_TOOL");
      expect(call.call.provider_id).toBeNull();
      expect(call.call.model_id).toBeNull();
      expect(call.start.cost_nanos).toBeNull();
      expect(call.start.input_tokens).toBeNull();
      expect(
        h.local.sql.prepare("select count(*) n from trip_source_confirmations").get()!.n,
      ).toBe(0);
      expect(
        h.local.sql.prepare("select count(*) n from trip_canonical_events").get()!.n,
      ).toBe(0);
    });
    it("requires authenticated OTR_USER and rejects caller confirmation claims", async () => {
      const h = await harness();
      const first = await h.adapter.submit(h.request);
      const d = h.choose(first);
      await expect(h.adapter.decide(d)).rejects.toThrow("INBOUND_AUTH_REQUIRED");
      await expect(
        h.adapter.decide(sign({ ...d, confirmed_user_id: account, confirmed_at: now() })),
      ).rejects.toThrow("INVALID_INBOUND_REQUEST");
      expect(h.counts().decisions).toBe(0);
    });
    it("ACCEPT reserves once before real CP13A preparation; exact restart replay keeps IDs", async () => {
      const h = await harness();
      const first = await h.adapter.submit(h.request);
      h.user();
      const d = h.choose(first);
      const saved = await h.adapter.decide(d);
      expect(saved.state).toBe("PREPARED");
      expect(saved.confirmation_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(await h.restart().decide(d)).toEqual(saved);
      expect(h.counts().decisions).toBe(1);
      expect(h.counts().prepareCount).toBe(1);
      expect(
        h.local.sql.prepare("select count(*) n from trip_source_confirmations").get()!.n,
      ).toBe(1);
      expect(
        h.local.sql.prepare("select count(*) n from trip_source_output_slots").get()!.n,
      ).toBe(1);
      expect(
        h.local.sql
          .prepare(
            "select count(*) n from sync_operations where operation_type='C_PREPARE_CONFIRMATION'",
          )
          .get()!.n,
      ).toBe(1);
      expect(
        h.local.sql.prepare("select count(*) n from trip_canonical_events").get()!.n,
      ).toBe(0);
      await expect(
        h.adapter.decide(sign({ ...d, disposition: "REJECT" })),
      ).rejects.toThrow("INBOUND_CHANGED_DECISION");
    });
    it.each(["REJECT", "DEFER"])(
      "%s reserves no canonical authority and replays exact",
      async (disposition) => {
        const h = await harness();
        const first = await h.adapter.submit(h.request);
        h.user();
        const d = h.choose(first, disposition);
        const saved = await h.adapter.decide(d);
        expect(saved.state).toBe(disposition === "REJECT" ? "REJECTED" : "DEFERRED");
        for (const key of [
          "confirmation_id",
          "slot_id",
          "operation_key",
          "intended_event_id",
        ] as const)
          expect(saved[key]).toBeNull();
        expect(saved.input_identity_map).toEqual({});
        expect(await h.restart().decide(d)).toEqual(saved);
        expect(h.counts().prepareCount).toBe(0);
      },
    );
    it.each([
      "inbound_ai_reserve_package",
      "inbound_ai_attach_material",
      "inbound_ai_reserve_invocation",
      "inbound_ai_complete_invocation",
    ] as const)("lost %s response recovers retained identities", async (kind) => {
      const h = await harness();
      h.lose(kind);
      await expect(h.adapter.submit(h.request)).rejects.toThrow("TRANSPORT_LOST");
      const recovered = await h.restart().submit(h.request);
      expect(await h.restart().submit(h.request)).toEqual(recovered);
      expect(h.counts().admissionCount).toBe(1);
      expect(h.counts().decisions).toBe(0);
    });
    it.each(["inbound_ai_reserve_review", "inbound_ai_observe_review"] as const)(
      "lost %s response retains exact decision without replacement",
      async (kind) => {
        const h = await harness();
        const first = await h.adapter.submit(h.request);
        h.user();
        const d = h.choose(first);
        h.lose(kind);
        await expect(h.adapter.decide(d)).rejects.toThrow("TRANSPORT_LOST");
        const saved = await h.readDecision(h.scope, d.review_key);
        const recovered = await h.restart().decide(d);
        expect(recovered.confirmation_id).toBe(saved.confirmation_id);
        expect(h.counts().decisions).toBe(1);
        if (kind === "inbound_ai_reserve_review") {
          expect(recovered.state).toBe("UNKNOWN");
          expect(h.counts().prepareCount).toBe(0);
        } else expect(recovered.state).toBe("PREPARED");
      },
    );
    it("lost CP13A prepare response recovers exact durable queued preparation", async () => {
      const h = await harness();
      const first = await h.adapter.submit(h.request);
      h.user();
      const d = h.choose(first);
      h.losePrepare();
      const uncertain = await h.adapter.decide(d);
      expect(uncertain.state).toBe("UNKNOWN");
      const recovered = await h.restart().decide(d);
      expect(recovered.state).toBe("PREPARED");
      expect(recovered.confirmation_id).toBe(uncertain.confirmation_id);
      expect(h.counts().prepareCount).toBe(1);
    });
    it("refresh increments review_version and preserves sealed historical decisions and invocation replay", async () => {
      const h = await harness();
      const first = await h.adapter.submit(h.request);
      h.user();
      const d = h.choose(first, "REJECT");
      const saved = await h.adapter.decide(d);
      const refresh = sign({
        ...h.request,
        request_id: randomUUID(),
        expected_review_version: 1,
      });
      const newer = await h.adapter.submit(refresh);
      expect(newer.proposal.review_version).toBe(2);
      expect(await h.restart().submit(refresh)).toEqual(newer);
      h.external();
      expect(await h.restart().submit(h.request)).toEqual(first);
      h.user();
      expect(await h.restart().decide(d)).toEqual(saved);
      const stale = sign({
        ...d,
        request_id: randomUUID(),
        review_key: randomUUID(),
        disposition: "ACCEPT",
      });
      await expect(h.adapter.decide(stale)).rejects.toThrow("INBOUND_STALE_REVIEW");
      expect(h.counts().admissionCount).toBe(1);
    });
    it.each([
      "candidate_sha256",
      "run_generation",
      "input_sha256",
      "base_revision",
      "review_version",
    ])("rejects stale %s without a decision", async (pin) => {
      const h = await harness();
      const first = await h.adapter.submit(h.request);
      h.user();
      const d = h.choose(first);
      await expect(
        h.adapter.decide(
          sign({ ...d, [pin]: pin.includes("sha256") ? "b".repeat(64) : 2 }),
        ),
      ).rejects.toThrow("INBOUND_STALE_REVIEW");
      expect(h.counts().decisions).toBe(0);
    });
    it.each(["revoke", "expire", "revokeTrip"] as const)(
      "%s blocks status, replay, and decision disclosure",
      async (action) => {
        const h = await harness();
        const first = await h.adapter.submit(h.request);
        h.user();
        const d = h.choose(first);
        h[action]();
        await expect(h.adapter.status(h.status())).rejects.toThrow();
        await expect(h.adapter.submit(h.request)).rejects.toThrow();
        await expect(h.adapter.decide(d)).rejects.toThrow();
      },
    );
    it("Account A→B→A invalidates in-flight work before publication", async () => {
      const h = await harness();
      h.hook(async () => {
        const token = await beginAccountTransition();
        await endAccountTransition(token);
      });
      await expect(h.adapter.submit(h.request)).rejects.toThrow();
      expect(h.counts().publishCount).toBe(0);
    });
    it.each([
      { verified_client_identity: randomUUID() },
      { verified_account_id: randomUUID() },
      { verified_environment: "DEV" as const },
      { revoked: true },
      { expires_at: "2000-01-01T00:00:00Z" },
      { command_kind: "STATUS" },
    ])("rejects mismatched verifier context %j", async (patch) => {
      const h = await harness();
      h.patch(patch);
      await expect(h.adapter.submit(h.request)).rejects.toThrow("INBOUND_AUTH_REQUIRED");
      expect(h.counts().admissionCount).toBe(0);
    });
    it("same package changed bytes/new key and changed request body reject", async () => {
      const h = await harness();
      await h.adapter.submit(h.request);
      for (const change of [{ idempotency_key: randomUUID() }, { items: [] }])
        await expect(
          h.adapter.submit(
            sign({
              ...h.request,
              request_id: randomUUID(),
              package: { ...h.p, ...change },
            }),
          ),
        ).rejects.toThrow();
      await expect(
        h.adapter.submit(sign({ ...h.request, expected_review_version: 1 })),
      ).rejects.toThrow();
    });
    it("MATERIAL drives N→M, duplicate passenger evidence consolidates, advisory SUMMARY is ignored", async () => {
      const h = await harness([exact + " passenger=Alice", exact + " passenger=Bob"]);
      const req = sign({
        ...h.request,
        package: {
          ...h.p,
          items: [
            ...h.p.items,
            { id: "other", family: "OTHER", material_ids: [h.p.materials[0].id] },
          ],
          summaries: [
            {
              id: randomUUID(),
              kind: "SUMMARY",
              reference: randomUUID(),
              sha256: "f".repeat(64),
              byte_count: 12,
              material_ids: h.p.materials.map((m) => m.id),
            },
          ],
        },
      });
      const first = await h.adapter.submit(req);
      expect(first.proposal.candidates).toHaveLength(1);
      expect(first.proposal.unsupported_items).toBe(1);
      expect(
        h.local.sql
          .prepare("select count(*) n from trip_person_participation_results")
          .get()!.n,
      ).toBe(0);
    });
    it("one material yields many occurrences and contradictions remain unresolved", async () => {
      const h = await harness([
        exact + "\nNZ290 CHC→AKL 2026-12-19 dep=12:30 depInstant=2026-12-18T23:30:00Z",
      ]);
      expect((await h.adapter.submit(h.request)).proposal.candidates).toHaveLength(2);
      const conflict = await harness([exact, leg + " depInstant=2026-12-17T22:30:00Z"]);
      const proposal = await conflict.adapter.submit(conflict.request);
      expect(proposal.proposal.candidates.some((c) => c.closure !== "READY")).toBe(true);
    });
    it("strict package rejects unknown fields, advisory-as-material, invalid refs and resource overflow", async () => {
      const h = await harness();
      for (const p of [
        { ...h.p, executable_instruction: "run" },
        { ...h.p, materials: [{ ...h.p.materials[0], kind: "SUMMARY" }] },
        { ...h.p, items: [{ ...h.p.items[0], material_ids: [randomUUID()] }] },
        { ...h.p, materials: [{ ...h.p.materials[0], byte_count: 4194305 }] },
      ])
        await expect(
          h.adapter.submit(sign({ ...h.request, package: p })),
        ).rejects.toThrow("INVALID_INBOUND_REQUEST");
      expect(h.counts().admissionCount).toBe(0);
    });
    it("lost prepare followed by proposal refresh recovers historical preparation without reapplying it", async () => {
      const h = await harness();
      const first = await h.adapter.submit(h.request);
      h.user();
      const d = h.choose(first);
      h.losePrepare();
      const unknown = await h.adapter.decide(d);
      const refresh = await h.adapter.submit(
        sign({ ...h.request, request_id: randomUUID(), expected_review_version: 1 }),
      );
      expect(refresh.proposal.review_version).toBe(2);
      const recovered = await h.restart().decide(d);
      expect(recovered.state).toBe("PREPARED");
      expect(recovered.confirmation_id).toBe(unknown.confirmation_id);
      expect(h.counts().prepareCount).toBe(1);
    });
    it("reserved invocation retry uses retained configuration without a new config read", async () => {
      const h = await harness();
      h.lose("inbound_ai_reserve_invocation");
      await expect(h.adapter.submit(h.request)).rejects.toThrow("TRANSPORT_LOST");
      h.dependencies.readIntegration = async () => {
        throw new Error("CURRENT_CONFIG_ROTATED");
      };
      const recovered = await h.restart().submit(h.request);
      expect(recovered.proposal.state).toBe("NEEDS_REVIEW");
      expect(h.counts().admissionCount).toBe(1);
    });
    it.each(["REJECT", "DEFER"])(
      "lost %s decision response recovers retained null IDs",
      async (disposition) => {
        const h = await harness();
        const first = await h.adapter.submit(h.request);
        h.user();
        const d = h.choose(first, disposition);
        h.lose("inbound_ai_reserve_review");
        await expect(h.adapter.decide(d)).rejects.toThrow("TRANSPORT_LOST");
        const recovered = await h.restart().decide(d);
        expect(recovered.confirmation_id).toBeNull();
        expect(recovered.slot_id).toBeNull();
        expect(recovered.operation_key).toBeNull();
        expect(recovered.intended_event_id).toBeNull();
        expect(h.counts().decisions).toBe(1);
      },
    );
    it("SQLite50 reopen retains exact prepared intent and IDs without a second operation", async () => {
      const h = await harness();
      const first = await h.adapter.submit(h.request);
      h.user();
      const d = h.choose(first);
      h.losePrepare();
      const unknown = await h.adapter.decide(d);
      const reopened = await h.reopen().decide(d);
      expect(reopened.state).toBe("PREPARED");
      expect(reopened.confirmation_id).toBe(unknown.confirmation_id);
      expect(h.counts().prepareCount).toBe(1);
    });
    it("account-staging SELECT defers without semantic work or decisions", async () => {
      const h = await harness([exact], true);
      const proposal = await h.adapter.submit(h.request);
      expect(proposal.proposal.state).toBe("DEFERRED");
      expect(proposal.proposal.candidates).toEqual([]);
      expect(h.counts().admissionCount).toBe(0);
      expect(await h.restart().status(h.status())).toEqual(proposal);
    });
    it.each(["trip_id", "grant_id", "account_id", "client_identity_id"] as const)(
      "cannot widen retained %s scope",
      async (key) => {
        const h = await harness();
        await h.adapter.submit(h.request);
        const badScope = { ...h.scope, [key]: randomUUID() };
        const badPackage = {
          ...h.p,
          account_id: badScope.account_id,
          client_identity_id: badScope.client_identity_id,
          trip_intent: { kind: "KNOWN", trip_id: badScope.trip_id },
        };
        await expect(
          h.adapter.submit(
            sign({
              ...h.request,
              request_id: randomUUID(),
              scope: badScope,
              package: badPackage,
            }),
          ),
        ).rejects.toThrow();
        expect(h.counts().admissionCount).toBe(1);
      },
    );
    it.each([
      ["candidate", "REJECT"],
      ["candidate", "DEFER"],
      ["material", "REJECT"],
      ["material", "DEFER"],
    ] as const)(
      "F1: stale %s + %s rejects before custody or authority",
      async (kind, disposition) => {
        const h = await harness();
        const proposal = await h.adapter.submit(h.request);
        h.user();
        if (kind === "candidate")
          h.local.sql
            .prepare("update trip_source_candidates set proposal_sha256=? where id=?")
            .run("b".repeat(64), proposal.proposal.candidates[0].candidate_id);
        else
          h.local.sql
            .prepare("update trip_sources set row_revision=row_revision+1")
            .run();
        const before = h.counts();
        const commandCount = h.commands.length;
        await expect(h.adapter.decide(h.choose(proposal, disposition))).rejects.toThrow(
          "INBOUND_STALE_REVIEW",
        );
        expect(h.counts()).toEqual(before);
        expect(h.counts().decisions).toBe(0);
        expect(h.counts().prepareCount).toBe(0);
        const newCommands = h.commands.slice(commandCount);
        expect(newCommands.some((c) => c.kind === "inbound_ai_reserve_review")).toBe(
          false,
        );
        expect(newCommands.every((c) => c.kind.startsWith("inbound_ai_"))).toBe(true);
        for (const table of [
          "trip_source_confirmations",
          "trip_source_output_slots",
          "trip_canonical_events",
          "sync_operations",
        ])
          expect(h.local.sql.prepare(`select count(*) n from ${table}`).get()!.n).toBe(0);
      },
    );
    it.each(["REJECT", "DEFER"])(
      "F1: current incomplete proposal permits %s",
      async (disposition) => {
        const h = await harness([leg]);
        const proposal = await h.adapter.submit(h.request);
        h.user();
        expect(proposal.proposal.candidates[0].closure).toBe("INCOMPLETE");
        const result = await h.adapter.decide(h.choose(proposal, disposition));
        expect(result.state).toBe(disposition === "REJECT" ? "REJECTED" : "DEFERRED");
        expect(result.confirmation_id).toBeNull();
        expect(result.slot_id).toBeNull();
        expect(result.operation_key).toBeNull();
        expect(result.intended_event_id).toBeNull();
        expect(h.counts().prepareCount).toBe(0);
      },
    );
    it("F1: current ambiguous match permits REJECT", async () => {
      const h = await harness();
      h.batch.resolved_airports = [];
      await bind(h.batch);
      const proposal = await h.adapter.submit(h.request);
      h.user();
      expect(proposal.proposal.candidates[0].action).toBe("UNRESOLVED_MATCH");
      expect(proposal.proposal.candidates[0].closure).not.toBe("READY");
      expect((await h.adapter.decide(h.choose(proposal, "REJECT"))).state).toBe(
        "REJECTED",
      );
      expect(h.counts().prepareCount).toBe(0);
    });
    it("F1: current unsupported passenger augmentation permits DEFER", async () => {
      const h = await harness([exact + " passenger=Alice"]);
      const initial = await fixture([exact]);
      const source = await interpretFlightBatch(initial, {
        sha256: hash,
        getAccountId: async () => account,
        now,
      });
      const baseline = eventBaseline(source);
      h.batch.matching.occurrences = [
        {
          ...source.candidates[0].anchors[0],
          eventId: baseline.eventId,
          semanticRevision: 7,
        },
      ];
      await bind(h.batch);
      const c = await h.local.admission.captureContext(trip);
      await seedEvent(h.local, c, baseline);
      const proposal = await h.adapter.submit(h.request);
      h.user();
      expect(proposal.proposal.candidates[0].closure).toBe("UNSUPPORTED");
      const result = await h.adapter.decide(h.choose(proposal, "DEFER"));
      expect(result.state).toBe("DEFERRED");
      expect(result.confirmation_id).toBeNull();
      expect(h.counts().prepareCount).toBe(0);
    });
    it.each(["REJECT", "DEFER", "ACCEPT"])(
      "F1: sealed historical %s survives later stale evidence",
      async (disposition) => {
        const h = await harness();
        const proposal = await h.adapter.submit(h.request);
        h.user();
        const decision = h.choose(proposal, disposition);
        const sealed = await h.adapter.decide(decision);
        h.local.sql
          .prepare("update trip_source_candidates set proposal_sha256=? where id=?")
          .run("b".repeat(64), proposal.proposal.candidates[0].candidate_id);
        h.local.sql.prepare("update trip_sources set row_revision=row_revision+1").run();
        const before = h.counts();
        expect(await h.restart().decide(decision)).toEqual(sealed);
        expect(h.counts()).toEqual(before);
        const refresh = await h.adapter.submit(
          sign({ ...h.request, request_id: randomUUID(), expected_review_version: 1 }),
        );
        expect(refresh.proposal.review_version).toBe(2);
        expect(await h.restart().decide(decision)).toEqual(sealed);
        expect(h.counts().decisions).toBe(1);
      },
    );
    it("current retained Run/Candidate/material changes invalidate displayed proposals", async () => {
      for (const kind of ["run", "candidate", "material"] as const) {
        const h = await harness();
        const first = await h.adapter.submit(h.request);
        h.user();
        if (kind === "run")
          h.local.sql
            .prepare("update trip_source_runs set generation=generation+1 where id=?")
            .run(first.proposal.candidates[0].run_id);
        if (kind === "candidate")
          h.local.sql
            .prepare("update trip_source_candidates set proposal_sha256=? where id=?")
            .run("b".repeat(64), first.proposal.candidates[0].candidate_id);
        if (kind === "material")
          h.local.sql
            .prepare("update trip_sources set row_revision=row_revision+1")
            .run();
        await expect(h.adapter.decide(h.choose(first))).rejects.toThrow(
          "INBOUND_STALE_REVIEW",
        );
        expect(h.counts().decisions).toBe(0);
      }
    });
    it("arrival evidence completes the same incomplete occurrence through one CP13A UPDATE", async () => {
      const h = await harness([
        exact + " arrDate=2026-12-18 arr=11:30 arrInstant=2026-12-17T22:30:00Z",
      ]);
      const initial = await fixture([exact]);
      initial.request.binding.run_id = randomUUID();
      const source = await interpretFlightBatch(initial, {
        sha256: hash,
        getAccountId: async () => account,
        now,
      });
      const baseline = eventBaseline(source);
      h.batch.matching.occurrences = [
        {
          ...source.candidates[0].anchors[0],
          eventId: baseline.eventId,
          semanticRevision: baseline.semanticRevision,
        },
      ];
      await bind(h.batch);
      const c = await h.local.admission.captureContext(trip);
      await seedEvent(h.local, c, baseline);
      const proposal = await h.adapter.submit(h.request);
      expect(proposal.proposal.candidates[0].action).toBe("COMPLETE_EXISTING");
      expect(proposal.proposal.candidates[0].event_id).toBe(baseline.eventId);
      h.user();
      const saved = await h.adapter.decide(h.choose(proposal));
      expect(saved.state).toBe("PREPARED");
      expect(saved.intended_event_id).toBe(baseline.eventId);
      const queued = await h.local.admission.pending(c);
      const intent = JSON.parse(queued[0].payload_json as string);
      expect(intent.slots[0].disposition).toBe("UPDATE");
      expect(intent.slots[0].base_revision).toBe(7);
      expect(
        h.local.sql.prepare("select count(*) n from trip_canonical_events").get()!.n,
      ).toBe(1);
    });
    it("post-display Event revision change requires refresh and never silently rebases", async () => {
      const h = await harness([
        exact + " arrDate=2026-12-18 arr=11:30 arrInstant=2026-12-17T22:30:00Z",
      ]);
      const initial = await fixture([exact]);
      const source = await interpretFlightBatch(initial, {
        sha256: hash,
        getAccountId: async () => account,
        now,
      });
      const baseline = eventBaseline(source);
      h.batch.matching.occurrences = [
        {
          ...source.candidates[0].anchors[0],
          eventId: baseline.eventId,
          semanticRevision: 7,
        },
      ];
      await bind(h.batch);
      const c = await h.local.admission.captureContext(trip);
      await seedEvent(h.local, c, baseline);
      const proposal = await h.adapter.submit(h.request);
      h.user();
      await seedEvent(h.local, c, { ...baseline, semanticRevision: 8 });
      await expect(h.adapter.decide(h.choose(proposal))).rejects.toThrow(
        "INBOUND_STALE_REVIEW",
      );
      expect(h.counts().decisions).toBe(0);
    });
    it("same-occurrence passenger evidence remains augmentation review without Person authority", async () => {
      const h = await harness([exact + " passenger=Alice", exact + " passenger=Bob"]);
      const initial = await fixture([exact]);
      const source = await interpretFlightBatch(initial, {
        sha256: hash,
        getAccountId: async () => account,
        now,
      });
      const baseline = eventBaseline(source);
      h.batch.matching.occurrences = [
        {
          ...source.candidates[0].anchors[0],
          eventId: baseline.eventId,
          semanticRevision: 7,
        },
      ];
      await bind(h.batch);
      const c = await h.local.admission.captureContext(trip);
      await seedEvent(h.local, c, baseline);
      const proposal = await h.adapter.submit(h.request);
      expect(proposal.proposal.candidates).toHaveLength(1);
      expect(proposal.proposal.candidates[0].action).toBe("AUGMENT_EXISTING");
      expect(proposal.proposal.candidates[0].closure).not.toBe("READY");
      h.user();
      await expect(h.adapter.decide(h.choose(proposal))).rejects.toThrow(
        "INBOUND_STALE_REVIEW",
      );
      expect(h.counts().decisions).toBe(0);
    });
  },
);
