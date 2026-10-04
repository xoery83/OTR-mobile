import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalEventFactsSchema,
  canonicalEventReadSchema,
  canonicalEndpointSchema,
  type CanonicalEventRead,
} from "@/data/api/tripCanonicalReadContracts";
import { createTripCanonicalReadTransport } from "@/data/api/tripCanonicalReadTransport";
import { migrations } from "@/data/db/migrations";
import {
  runMigrations,
  getSchemaVersion,
  type MigrationDatabase,
} from "@/data/db/migrationRunner";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  captureAccountRequestContext,
  beginAccountTransition,
  endAccountTransition,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { createItineraryRepository } from "./itineraryRepository";
import {
  createTripCanonicalEventRepository,
  type TripCanonicalEventDatabase,
} from "./tripCanonicalEventRepository";
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const accountA = "10000000-0000-4000-8000-000000000001";
const accountB = "10000000-0000-4000-8000-000000000002";
const trip = "20000000-0000-4000-8000-000000000001";
const otherTrip = "20000000-0000-4000-8000-000000000002";
const eventId = "30000000-0000-4000-8000-000000000001";
type ReadOnly = Extract<CanonicalEventRead, { disposition: "READ_ONLY" }>;
const connections: DatabaseSync[] = [];
afterEach(() => {
  for (const database of connections.splice(0)) database.close();
});
function connection(path = ":memory:", through = 44) {
  const sqlite = new DatabaseSync(path);
  connections.push(sqlite);
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const migration of migrations.filter(({ id }) => id <= through))
    sqlite.exec(migration.sql);
  return sqlite;
}
function adapter(sqlite: DatabaseSync): TripCanonicalEventDatabase & MigrationDatabase {
  return serializeDatabaseTransactions({
    async execAsync(sql: string) {
      sqlite.exec(sql);
    },
    async getFirstAsync<T>(sql: string, ...params: unknown[]) {
      return (sqlite.prepare(sql).get(...(params as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, ...params: unknown[]) {
      return sqlite.prepare(sql).all(...(params as never[])) as T[];
    },
    async runAsync(sql: string, ...params: unknown[]) {
      return sqlite.prepare(sql).run(...(params as never[])) as never;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  });
}
function fixture(path = ":memory:") {
  const sqlite = connection(path);
  const database = adapter(sqlite);
  let account = accountA;
  const getAccount = async () => account;
  const repository = createTripCanonicalEventRepository(database, getAccount);
  return {
    sqlite,
    database,
    repository,
    getAccount,
    context: () => captureAccountRequestContext(trip, getAccount),
    async switchTo(next: string) {
      const lease = await beginAccountTransition();
      account = next;
      endAccountTransition(lease);
    },
  };
}
function emptyFields(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, null]));
}
function read(
  shape: ReadOnly["event"]["temporal_shape"] = "POINT",
  revision = 1,
): ReadOnly {
  const event: Record<string, unknown> = {
    ...emptyFields(Object.keys(canonicalEventFactsSchema.shape)),
    id: eventId,
    trip_id: trip,
    temporal_contract_version: 1,
    temporal_shape: shape,
    semantic_revision: revision,
    title: "Canonical",
    event_type: "activity",
    status: "planned",
    order_index: 0,
    participant_scope: "UNASSIGNED",
    is_estimated_time: false,
    location_input_revision: 1,
    start_quality: "UNKNOWN",
    start_basis: "DERIVED_CIVIL",
    start_civil_resolution: "PENDING",
    start_provenance_refs: {},
    itinerary_transport_endpoints: [],
  };
  if (["CALENDAR", "ALL_DAY"].includes(shape))
    Object.assign(event, {
      start_quality: null,
      start_local_date: "2026-12-17",
      start_provenance_refs: { local_date: "otr-event/confirmation/date" },
    });
  if (["SPAN", "STAY"].includes(shape))
    Object.assign(event, {
      end_quality: "UNKNOWN",
      end_basis: "DERIVED_CIVIL",
      end_civil_resolution: "PENDING",
      end_provenance_refs: {},
    });
  if (shape === "STAY")
    Object.assign(event, {
      start_local_date: "2026-12-17",
      end_local_date: "2026-12-19",
      start_provenance_refs: { local_date: "otr-event/confirmation/check-in" },
      end_provenance_refs: { local_date: "otr-event/confirmation/check-out" },
    });
  if (shape === "WINDOW")
    Object.assign(event, {
      start_quality: null,
      timing_label: "late afternoon",
      timing_provenance_ref: "otr-event/confirmation/label",
      end_basis: "DERIVED_CIVIL",
      end_civil_resolution: "PENDING",
      end_provenance_refs: {},
    });
  if (shape === "TRANSPORT")
    Object.assign(event, {
      start_quality: null,
      start_basis: null,
      start_civil_resolution: null,
      start_provenance_refs: null,
      location_input_revision: null,
      itinerary_transport_endpoints: ["DESTINATION", "ORIGIN"].map((role) => ({
        ...emptyFields(Object.keys(canonicalEndpointSchema.shape)),
        event_id: eventId,
        role,
        quality: "UNKNOWN",
        basis: "DERIVED_CIVIL",
        civil_resolution: "PENDING",
        provenance_refs: {},
        location_input_revision: 1,
      })),
    });
  return canonicalEventReadSchema.parse({
    readVersion: 1,
    disposition: "READ_ONLY",
    legacyCompatible: false,
    event,
  }) as ReadOnly;
}
function state(sqlite: DatabaseSync) {
  return {
    roots: sqlite
      .prepare("SELECT * FROM trip_canonical_events ORDER BY account_id,trip_id,event_id")
      .all(),
    endpoints: sqlite
      .prepare(
        "SELECT * FROM trip_canonical_transport_endpoints ORDER BY account_id,trip_id,event_id,role",
      )
      .all(),
  };
}
function allTables(sqlite: DatabaseSync) {
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return Object.fromEntries(
    tables.map(({ name }) => [
      String(name),
      sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    ]),
  );
}

function populateOldTables(sqlite: DatabaseSync) {
  sqlite.exec(`INSERT INTO itinerary_items(id,trip_id,title,scheduled_date,start_time,created_at,updated_at,sync_status,sync_version,local_owner_user_id)
    VALUES ('legacy','${trip}','Legacy','2026-12-17','08:30','old','old','PENDING_CREATE',0,'${accountA}');
    INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,attempt_count,created_at,updated_at)
    VALUES ('op','${trip}','itinerary','legacy','CREATE_ITINERARY','op','{"itineraryItemId":"legacy"}','PENDING',0,'old','old');
    INSERT INTO ledger_sync_cursors(user_id,journey_id,cursor,server_time,updated_at)
    VALUES ('${accountA}','${trip}','financial-checkpoint','old','old');
    INSERT INTO ledger_personal_payment_sync_cursors(user_id,journey_id,cursor,server_time,updated_at)
    VALUES ('${accountA}','${trip}','private-checkpoint','old','old');
    INSERT INTO ledger_expenses(id,journey_id,payer_member_id,title,category,occurred_at,original_amount_minor,
      original_currency,original_scale,business_status,revision,sync_status,created_at,updated_at)
    VALUES ('expense','${trip}','person','Protected Expense','other','2026-10-01T00:00:00Z',1234,'NZD',2,'ACCEPTED',1,'SYNCED','old','old');
    INSERT INTO ledger_members(id,journey_id,display_name,role,status,updated_at,participation_active,participation_revision)
    VALUES ('person','${trip}','Person','owner','linked','old',0,8);`);
}

describe("canonical Event local mirror", () => {
  it("v43→v44 preserves all existing table schemas/rows including legacy, queue and financial/private cursors", () => {
    const sqlite = connection(":memory:", 43);
    populateOldTables(sqlite);
    const before = allTables(sqlite);
    const definitions = sqlite
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    sqlite.exec(migrations.find(({ id }) => id === 44)!.sql);
    const after = allTables(sqlite);
    for (const [table, rows] of Object.entries(before))
      expect(after[table]).toEqual(rows);
    for (const definition of definitions)
      expect(
        sqlite
          .prepare("SELECT name,sql FROM sqlite_master WHERE name=?")
          .get(definition.name as string),
      ).toEqual(definition);
    expect(state(sqlite)).toEqual({ roots: [], endpoints: [] });
  });
  it("migration runner records 44 once and opens the same on-disk mirror after restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otr-bt3f-"));
    const path = join(directory, "cache.db");
    try {
      let sqlite = new DatabaseSync(path);
      await runMigrations(adapter(sqlite));
      await runMigrations(adapter(sqlite));
      expect(await getSchemaVersion(adapter(sqlite))).toBe(45);
      expect(
        sqlite.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id=44").get(),
      ).toEqual({ n: 1 });
      const repository = createTripCanonicalEventRepository(
        adapter(sqlite),
        async () => accountA,
      );
      const context = await captureAccountRequestContext(trip, async () => accountA);
      const input = read("TRANSPORT");
      await repository.applyRead(context, eventId, input);
      sqlite.close();
      sqlite = new DatabaseSync(path);
      const offline = createTripCanonicalEventRepository(
        adapter(sqlite),
        async () => accountA,
      );
      expect((await offline.getEvent(trip, eventId))?.data).toEqual(input);
      expect(
        sqlite.prepare("SELECT observation_sequence FROM trip_canonical_events").get(),
      ).toEqual({ observation_sequence: 1 });
      sqlite.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each([
    "POINT",
    "CALENDAR",
    "ALL_DAY",
    "SPAN",
    "STAY",
    "WINDOW",
    "TRANSPORT",
  ] as const)(
    "round-trips %s fully as READ_ONLY without a fake scheduledDate",
    async (shape) => {
      const f = fixture();
      const input = read(shape);
      expect(await f.repository.applyRead(await f.context(), eventId, input)).toBe(
        "APPLIED",
      );
      const result = await f.repository.getEvent(trip, eventId);
      expect(result?.data).toEqual(input);
      expect(result?.context).toMatchObject({ accountId: accountA, tripId: trip });
      expect(JSON.stringify(result)).not.toContain("scheduledDate");
      expect(Object.keys(f.repository)).toEqual([
        "applyRead",
        "getEvent",
        "refreshEvent",
      ]);
    },
  );
  it("retains microseconds, source offset, local precision and accepted fold/zone bindings verbatim", async () => {
    const f = fixture();
    const input = read();
    Object.assign(input.event, {
      start_local_date: "2026-11-01",
      start_local_time: "01:30:00.123456",
      start_clock_precision: 6,
      start_quality: "EXACT",
      start_basis: "DERIVED_CIVIL",
      start_zone_id: "America/Los_Angeles",
      start_supplied_offset_seconds: -28800,
      start_resolution_offset_seconds: -28800,
      start_civil_resolution: "FOLD_RESOLVED",
      start_interpretation_key: "reviewed-test/tzdb-2026",
      start_interpretation_input_sha256: "a".repeat(64),
      start_source_instant: "2026-11-01T09:30:00.123456+00:00",
      start_source_instant_precision: 6,
      planned_start: "2026-11-01T09:30:00.123456+00:00",
      start_provenance_refs: {
        local_date: "otr-event/confirmation/date",
        local_time: "otr-event/confirmation/clock",
        zone_id: "otr-event/confirmation/zone",
        fold_choice: "otr-event/confirmation/fold",
        source_instant: "otr-event/confirmation/source",
      },
      legacy_planned_start: "2026-11-01T09:30:00.123456+00:00",
      legacy_is_estimated_time: false,
      legacy_snapshot_at: "2026-10-01T00:00:00.000001Z",
    });
    await f.repository.applyRead(await f.context(), eventId, input);
    expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(input);
    expect(
      f.sqlite
        .prepare(
          "SELECT typeof(start_local_time) t,typeof(planned_start) p,start_source_instant FROM trip_canonical_events",
        )
        .get(),
    ).toEqual({
      t: "text",
      p: "text",
      start_source_instant: input.event.start_source_instant,
    });
  });
  it("retains SOURCE_INSTANT and partial unzoned estimated civil facts without inferring date/zone", async () => {
    const f = fixture();
    const source = read();
    Object.assign(source.event, {
      start_quality: "EXACT",
      start_basis: "SOURCE_INSTANT",
      start_civil_resolution: null,
      start_source_instant: "2026-12-17T18:00:00.123456+12:00",
      start_source_instant_precision: 6,
      planned_start: "2026-12-17T18:00:00.123456+12:00",
      start_provenance_refs: { source_instant: "otr-event/confirmation/source" },
    });
    await f.repository.applyRead(await f.context(), eventId, source);
    expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(source);
    const partial = read("POINT", 2);
    Object.assign(partial.event, {
      is_estimated_time: true,
      start_local_time: "08:35:00",
      start_clock_precision: -1,
      start_quality: "ESTIMATED",
      start_provenance_refs: {
        local_time: "otr-event/confirmation/clock",
        quality: "otr-event/confirmation/estimate",
      },
    });
    await f.repository.applyRead(await f.context(), eventId, partial);
    expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(partial);
  });
  it("retains every spatial/address/Place/provenance field on root and endpoint", async () => {
    const f = fixture();
    const root = read();
    const spatial: Record<string, unknown> = {
      authored_label: "駅",
      authored_text: " untouched wording ",
      authored_address: "literal address",
      accepted_address: "accepted address",
      accepted_latitude: -36.1234567890123,
      accepted_longitude: 174.9876543210987,
      accepted_place_id: eventId,
      spatial_provenance_refs: { authored_label: "otr-event/confirmation/label" },
    };
    for (const key of Object.keys(canonicalEndpointSchema.shape).filter((name) =>
      /^(authored|accepted)_address_/.test(name),
    ))
      spatial[key] = `${key}/中文`;
    Object.assign(root.event, spatial);
    await f.repository.applyRead(await f.context(), eventId, root);
    expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(root);
    const transport = read("TRANSPORT", 2);
    Object.assign(transport.event.itinerary_transport_endpoints[1], spatial);
    await f.repository.applyRead(await f.context(), eventId, transport);
    expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(transport);
  });
  it("schema has a dedicated typed column for every exposed root/endpoint fact, never private/candidate bodies", () => {
    const f = fixture();
    const root = f.sqlite
      .prepare("PRAGMA table_info(trip_canonical_events)")
      .all()
      .map(({ name }) => name);
    const endpoints = f.sqlite
      .prepare("PRAGMA table_info(trip_canonical_transport_endpoints)")
      .all()
      .map(({ name }) => name);
    for (const key of Object.keys(canonicalEventFactsSchema.shape).filter(
      (key) => key !== "itinerary_transport_endpoints",
    ))
      expect(root).toContain(key === "id" ? "event_id" : key);
    for (const key of Object.keys(canonicalEndpointSchema.shape))
      expect(endpoints).toContain(key);
    expect(root).toHaveLength(77);
    expect(endpoints).toHaveLength(40);
    expect([...root, ...endpoints].join(",")).not.toMatch(
      /source_text|candidate_|financial|canonical_json|scheduled_date/,
    );
  });
  it("equal semantic bytes are neutral, including map member and keyed endpoint order", async () => {
    const f = fixture();
    const input = read("TRANSPORT");
    input.event.itinerary_transport_endpoints[0].provenance_refs = {
      local_date: "otr-event/confirmation/date",
      quality: "otr-event/confirmation/q",
    };
    await f.repository.applyRead(await f.context(), eventId, input);
    const before = state(f.sqlite);
    const reordered = structuredClone(input);
    reordered.event.itinerary_transport_endpoints.reverse();
    reordered.event.itinerary_transport_endpoints[1].provenance_refs = {
      quality: "otr-event/confirmation/q",
      local_date: "otr-event/confirmation/date",
    };
    expect(await f.repository.applyRead(await f.context(), eventId, reordered)).toBe(
      "UNCHANGED",
    );
    expect(state(f.sqlite)).toEqual(before);
  });
  it.each(["title", "start_source_instant", "accepted_place_id"])(
    "same-revision %s mismatch fails closed without changing mirror or observations",
    async (field) => {
      const f = fixture();
      const input = read();
      await f.repository.applyRead(await f.context(), eventId, input);
      const before = state(f.sqlite);
      const mismatch = structuredClone(input);
      Object.assign(mismatch.event, {
        [field]:
          field === "title"
            ? "changed"
            : field === "accepted_place_id"
              ? eventId
              : "2026-12-17T06:00:00.123456Z",
      });
      await expect(
        f.repository.applyRead(await f.context(), eventId, mismatch),
      ).rejects.toThrow("CANONICAL_EVENT_MIRROR_INTEGRITY");
      expect(state(f.sqlite)).toEqual(before);
    },
  );
  it.each(["ROOT", "ORIGIN", "DESTINATION"] as const)(
    "%s Place UUID→null is revision-neutral and changes only the scoped pointer",
    async (target) => {
      const f = fixture();
      const input = read(target === "ROOT" ? "POINT" : "TRANSPORT");
      const spatial =
        target === "ROOT"
          ? input.event
          : input.event.itinerary_transport_endpoints.find((end) => end.role === target)!;
      spatial.accepted_place_id = eventId;
      await f.repository.applyRead(await f.context(), eventId, input);
      const expected = structuredClone(state(f.sqlite));
      if (target === "ROOT") expected.roots[0].accepted_place_id = null;
      else
        expected.endpoints.find((end) => end.role === target)!.accepted_place_id = null;
      spatial.accepted_place_id = null;
      expect(await f.repository.applyRead(await f.context(), eventId, input)).toBe(
        "APPLIED",
      );
      expect(state(f.sqlite)).toEqual(expected);
      expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(input);
      expect(await f.repository.applyRead(await f.context(), eventId, input)).toBe(
        "UNCHANGED",
      );
      expect(state(f.sqlite)).toEqual(expected);
    },
  );
  it.each(["ROOT", "ORIGIN", "DESTINATION"] as const)(
    "%s Place null→UUID and UUID_A→UUID_B still fail closed",
    async (target) => {
      const f = fixture();
      const input = read(target === "ROOT" ? "POINT" : "TRANSPORT");
      const spatial =
        target === "ROOT"
          ? input.event
          : input.event.itinerary_transport_endpoints.find((end) => end.role === target)!;
      for (const previous of [null, eventId]) {
        spatial.accepted_place_id = previous;
        await f.repository.applyRead(await f.context(), eventId, input);
        const before = state(f.sqlite);
        spatial.accepted_place_id = accountB;
        await expect(
          f.repository.applyRead(await f.context(), eventId, input),
        ).rejects.toThrow("CANONICAL_EVENT_MIRROR_INTEGRITY");
        expect(state(f.sqlite)).toEqual(before);
        spatial.accepted_place_id = previous;
        input.event.semantic_revision++;
      }
    },
  );
  it.each(["ROOT", "ORIGIN", "DESTINATION"] as const)(
    "%s pointer loss cannot admit any other spatial, temporal or read change",
    async (target) => {
      const f = fixture();
      const input = read(target === "ROOT" ? "POINT" : "TRANSPORT");
      const spatial =
        target === "ROOT"
          ? input.event
          : input.event.itinerary_transport_endpoints.find((end) => end.role === target)!;
      spatial.accepted_place_id = eventId;
      await f.repository.applyRead(await f.context(), eventId, input);
      const before = state(f.sqlite);
      for (const field of [
        "accepted_address",
        "accepted_address_line1",
        "accepted_latitude",
        "accepted_longitude",
        "spatial_provenance_refs",
        "temporal",
        "title",
        "legacyCompatible",
        "role",
        "cardinality",
      ]) {
        const changed = structuredClone(input);
        const end =
          target === "ROOT"
            ? changed.event
            : changed.event.itinerary_transport_endpoints.find(
                (item) => item.role === target,
              )!;
        end.accepted_place_id = null;
        if (field === "temporal") {
          if (target === "ROOT") changed.event.start_local_date = "2026-12-18";
          else
            changed.event.itinerary_transport_endpoints.find(
              (item) => item.role === target,
            )!.local_date = "2026-12-18";
        } else if (field === "title") changed.event.title = "changed";
        else if (field === "legacyCompatible")
          Object.assign(changed, { legacyCompatible: true });
        else if (field === "role") {
          if (target === "ROOT") changed.event.status = "completed";
          else
            changed.event.itinerary_transport_endpoints.find(
              (item) => item.role === target,
            )!.role = target === "ORIGIN" ? "DESTINATION" : "ORIGIN";
        } else if (field === "cardinality") {
          if (target === "ROOT") changed.event.order_index = 1;
          else changed.event.itinerary_transport_endpoints.pop();
        } else
          Object.assign(end, {
            [field]:
              field === "spatial_provenance_refs"
                ? { accepted_address: "otr-event/confirmation/changed" }
                : field.includes("latitude") || field.includes("longitude")
                  ? 1
                  : "changed",
          });
        await expect(
          f.repository.applyRead(await f.context(), eventId, changed),
        ).rejects.toThrow();
        expect(state(f.sqlite)).toEqual(before);
      }
    },
  );
  it("Place loss from an A→B→A stale response rejects before any pointer write", async () => {
    const f = fixture();
    const input = read("TRANSPORT");
    for (const end of input.event.itinerary_transport_endpoints)
      end.accepted_place_id = eventId;
    await f.repository.applyRead(await f.context(), eventId, input);
    const context = await f.context();
    const before = state(f.sqlite);
    await f.switchTo(accountB);
    await f.switchTo(accountA);
    for (const end of input.event.itinerary_transport_endpoints)
      end.accepted_place_id = null;
    await expect(f.repository.applyRead(context, eventId, input)).rejects.toThrow(
      "Account changed",
    );
    expect(state(f.sqlite)).toEqual(before);
  });
  it("neutral Place loss rolls back root and both endpoints when the second endpoint update fails", async () => {
    const f = fixture();
    const input = read("TRANSPORT");
    input.event.accepted_place_id = eventId;
    for (const end of input.event.itinerary_transport_endpoints)
      end.accepted_place_id = eventId;
    await f.repository.applyRead(await f.context(), eventId, input);
    const before = state(f.sqlite);
    f.sqlite.exec(
      "CREATE TRIGGER fail_place_loss BEFORE UPDATE OF accepted_place_id ON trip_canonical_transport_endpoints WHEN NEW.role='ORIGIN' BEGIN SELECT RAISE(ABORT,'Place loss failed'); END",
    );
    input.event.accepted_place_id = null;
    for (const end of input.event.itinerary_transport_endpoints)
      end.accepted_place_id = null;
    await expect(
      f.repository.applyRead(await f.context(), eventId, input),
    ).rejects.toThrow("Place loss failed");
    expect(state(f.sqlite)).toEqual(before);
    f.sqlite.exec("DROP TRIGGER fail_place_loss");
    expect(await f.repository.applyRead(await f.context(), eventId, input)).toBe(
      "APPLIED",
    );
    const expected = structuredClone(before);
    expected.roots[0].accepted_place_id = null;
    for (const end of expected.endpoints) end.accepted_place_id = null;
    expect(state(f.sqlite)).toEqual(expected);
  });
  it("same-revision endpoint mismatch is an integrity error and cannot replace either end", async () => {
    const f = fixture();
    const input = read("TRANSPORT");
    await f.repository.applyRead(await f.context(), eventId, input);
    const before = state(f.sqlite);
    const changed = structuredClone(input);
    changed.event.itinerary_transport_endpoints[0].authored_label = "different place";
    await expect(
      f.repository.applyRead(await f.context(), eventId, changed),
    ).rejects.toThrow("CANONICAL_EVENT_MIRROR_INTEGRITY");
    expect(state(f.sqlite)).toEqual(before);
  });
  it("endpoint FK and role key cannot cross Account/Trip or reference a missing root", async () => {
    const f = fixture();
    await f.repository.applyRead(await f.context(), eventId, read());
    const insert = f.sqlite.prepare(
      "INSERT INTO trip_canonical_transport_endpoints(account_id,trip_id,event_id,role) VALUES (?,?,?,?)",
    );
    expect(() => insert.run(accountB, trip, eventId, "ORIGIN")).toThrow("FOREIGN KEY");
    expect(() => insert.run(accountA, otherTrip, eventId, "ORIGIN")).toThrow(
      "FOREIGN KEY",
    );
    expect(() => insert.run(accountA, trip, eventId, "OTHER")).toThrow("CHECK");
    expect(state(f.sqlite).endpoints).toEqual([]);
  });
  it("orders only by semantic_revision and preserves cache on older/withheld observations", async () => {
    const f = fixture();
    await f.repository.applyRead(await f.context(), eventId, read("TRANSPORT", 9));
    const before = state(f.sqlite);
    expect(
      await f.repository.applyRead(await f.context(), eventId, read("POINT", 3)),
    ).toBe("IGNORED_OLDER");
    expect(
      await f.repository.applyRead(await f.context(), eventId, {
        readVersion: 1,
        disposition: "WITHHELD",
        reason: "UNSUPPORTED_CLIENT",
      }),
    ).toBe("WITHHELD");
    expect(state(f.sqlite)).toEqual(before);
    expect(
      await f.repository.applyRead(await f.context(), eventId, read("POINT", 10)),
    ).toBe("APPLIED");
    expect(
      f.sqlite
        .prepare(
          "SELECT semantic_revision,observation_sequence FROM trip_canonical_events",
        )
        .get(),
    ).toEqual({ semantic_revision: 10, observation_sequence: 2 });
    expect(state(f.sqlite).endpoints).toEqual([]);
  });
  it("endpoint insert failure rolls back changed root, replaced endpoints and observation sequence", async () => {
    const f = fixture();
    await f.repository.applyRead(await f.context(), eventId, read("TRANSPORT"));
    const before = state(f.sqlite);
    f.sqlite.exec(
      "CREATE TRIGGER fail_endpoint BEFORE INSERT ON trip_canonical_transport_endpoints WHEN NEW.role='ORIGIN' BEGIN SELECT RAISE(ABORT,'endpoint failed'); END",
    );
    const newer = read("TRANSPORT", 2);
    newer.event.title = "new root";
    await expect(
      f.repository.applyRead(await f.context(), eventId, newer),
    ).rejects.toThrow("endpoint failed");
    expect(state(f.sqlite)).toEqual(before);
  });
  it("withholds future local versions without legacy fallback or overwriting the future row", async () => {
    const f = fixture();
    await f.repository.applyRead(await f.context(), eventId, read());
    for (const column of ["read_version", "temporal_contract_version"]) {
      f.sqlite.exec(`UPDATE trip_canonical_events SET ${column}=2`);
      expect((await f.repository.getEvent(trip, eventId))?.data).toEqual({
        readVersion: 1,
        disposition: "WITHHELD",
        reason: "UNSUPPORTED_CONTRACT",
      });
      await expect(
        f.repository.applyRead(await f.context(), eventId, read("POINT", 3)),
      ).rejects.toThrow("CANONICAL_EVENT_MIRROR_INTEGRITY");
      f.sqlite.exec(`UPDATE trip_canonical_events SET ${column}=1`);
    }
  });
  it("known-version local corruption fails closed", async () => {
    const f = fixture();
    await f.repository.applyRead(await f.context(), eventId, read());
    f.sqlite.exec("UPDATE trip_canonical_events SET start_local_time='25:00:00'");
    await expect(f.repository.getEvent(trip, eventId)).rejects.toThrow(
      "CANONICAL_EVENT_MIRROR_INTEGRITY",
    );
  });
  it("same Event UUID across Accounts/Trips never shares or deletes another scoped mirror", async () => {
    const f = fixture();
    const a = read("TRANSPORT");
    await f.repository.applyRead(await f.context(), eventId, a);
    await f.switchTo(accountB);
    expect(await f.repository.getEvent(trip, eventId)).toBeNull();
    const b = read("POINT", 4);
    b.event.title = "B";
    await f.repository.applyRead(await f.context(), eventId, b);
    const differentTrip = structuredClone(b);
    differentTrip.event.trip_id = otherTrip;
    const context = await captureAccountRequestContext(otherTrip, f.getAccount);
    await f.repository.applyRead(context, eventId, differentTrip);
    expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(b);
    await f.switchTo(accountA);
    expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(a);
    expect(await f.repository.getEvent(otherTrip, eventId)).toBeNull();
    expect(state(f.sqlite).roots).toHaveLength(3);
    expect(state(f.sqlite).endpoints).toHaveLength(2);
  });
  it("context Trip/Event mismatch and private Source payload reject without persisting", async () => {
    const f = fixture();
    const input = read();
    input.event.trip_id = otherTrip;
    await expect(
      f.repository.applyRead(await f.context(), eventId, input),
    ).rejects.toThrow("CANONICAL_EVENT_MIRROR_INTEGRITY");
    input.event.trip_id = trip;
    input.event.id = accountB;
    await expect(
      f.repository.applyRead(await f.context(), eventId, input),
    ).rejects.toThrow("CANONICAL_EVENT_MIRROR_INTEGRITY");
    const extra = read();
    Object.assign(extra.event, { source_text: "private Source content" });
    await expect(
      f.repository.applyRead(await f.context(), eventId, extra),
    ).rejects.toThrow();
    expect(state(f.sqlite)).toEqual({ roots: [], endpoints: [] });
  });
  it("late A→B→A response cannot apply over A's cached state", async () => {
    const f = fixture();
    await f.repository.applyRead(await f.context(), eventId, read());
    const before = state(f.sqlite);
    let release!: (value: {
      context: AccountRequestContext;
      data: CanonicalEventRead;
    }) => void;
    let staleContext!: AccountRequestContext;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const repository = createTripCanonicalEventRepository(
      f.database,
      f.getAccount,
      async () => {
        staleContext = await f.context();
        started();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    );
    const response = repository.refreshEvent(trip, eventId);
    await entered;

    await withAccountApplyGate(async () => {}); // Network owns no apply gate.
    await f.switchTo(accountB);
    await f.switchTo(accountA);
    release({ context: staleContext, data: read("POINT", 2) });
    await expect(response).rejects.toThrow("Account changed");
    expect(state(f.sqlite)).toEqual(before);
  });
  it("generation is rechecked inside apply transaction and Account transition waits through commit", async () => {
    const f = fixture();
    const context = await f.context();
    let entered!: () => void;
    let resume!: () => void;
    const transactionEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const db = {
      ...f.database,
      withTransactionAsync: async (task: () => Promise<void>) => {
        await f.database.withTransactionAsync(async () => {
          await task();
          entered();
          await hold;
        });
      },
    };
    const repository = createTripCanonicalEventRepository(db, f.getAccount);
    const applying = repository.applyRead(context, eventId, read());
    await transactionEntered;
    let switched = false;
    const transition = f.switchTo(accountB).then(() => {
      switched = true;
    });
    await Promise.resolve();
    expect(switched).toBe(false);
    resume();
    await applying;
    await transition;
    await f.switchTo(accountA);
    expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(read());
    await expect(
      f.repository.applyRead(context, eventId, read("POINT", 2)),
    ).rejects.toThrow("Account changed");
  });
  it("commit-time Account mismatch rolls back tentative root and endpoints", async () => {
    const f = fixture();
    const context = await f.context();
    let checks = 0;
    const repository = createTripCanonicalEventRepository(f.database, async () =>
      ++checks === 1 ? accountA : accountB,
    );
    await expect(
      repository.applyRead(context, eventId, read("TRANSPORT")),
    ).rejects.toThrow("Account changed");
    expect(state(f.sqlite)).toEqual({ roots: [], endpoints: [] });
  });
  it("concurrent apply calls serialize and late older responses never regress revisions", async () => {
    const f = fixture();
    const context = await f.context();
    await Promise.all([
      f.repository.applyRead(context, eventId, read("POINT", 3)),
      f.repository.applyRead(context, eventId, read("TRANSPORT", 2)),
    ]);
    expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(read("POINT", 3));
    expect(state(f.sqlite).endpoints).toEqual([]);
  });
  it("individual refresh reuses B-T3E transport, while offline read never requests a token/network", async () => {
    const f = fixture();
    const input = read("ALL_DAY");
    const send = vi.fn(async () => Response.json(input));
    const token = vi.fn(async () => ({ userId: accountA, token: "test-only" }));
    const transport = createTripCanonicalReadTransport(
      f.getAccount,
      { baseUrl: "http://local", fetchImplementation: send },
      token,
    );
    const repository = createTripCanonicalEventRepository(
      f.database,
      f.getAccount,
      transport.event,
    );
    expect(await repository.refreshEvent(trip, eventId)).toBe("APPLIED");
    const offline = createTripCanonicalEventRepository(f.database, f.getAccount);
    expect((await offline.getEvent(trip, eventId))?.data).toEqual(input);
    expect(send).toHaveBeenCalledOnce();
    expect(token).toHaveBeenCalledOnce();
    send.mockRejectedValue(new Error("offline"));
    await expect(repository.refreshEvent(trip, eventId)).rejects.toThrow();
    expect((await offline.getEvent(trip, eventId))?.data).toEqual(input);
  });
  it("legacy repository cannot edit/full-save or see canonical rows and all noncanonical tables remain unchanged during mirror apply", async () => {
    const f = fixture();
    populateOldTables(f.sqlite);
    const legacy = createItineraryRepository(f.database as never, f.getAccount);
    const before = allTables(f.sqlite);
    await f.repository.applyRead(await f.context(), eventId, read("TRANSPORT"));
    const after = allTables(f.sqlite);
    for (const [table, rows] of Object.entries(before).filter(
      ([name]) => !name.startsWith("trip_canonical_"),
    ))
      expect(after[table]).toEqual(rows);
    expect((await legacy.listItineraryItems(trip)).map(({ id }) => id)).toEqual([
      "legacy",
    ]);
    expect(await legacy.getItineraryItem(eventId)).toBeNull();
    await legacy.markItineraryItemSyncing(eventId);
    await legacy.markItineraryItemFailed(eventId);
    expect((await f.repository.getEvent(trip, eventId))?.data).toEqual(read("TRANSPORT"));
    expect(Object.keys(f.repository).join(",")).not.toMatch(
      /create|edit|save|delete|enqueue/,
    );
  });
});
