import {
  emptyFlightSegment,
  sparseFlightSavePlan,
  flightSegmentFromRead,
} from "../../features/day-feed/manualFlightFormFields";
import { runMigrations } from "../db/migrationRunner";
import { createTripLocalManualReader } from "./tripLocalManualReadRepository";
import { createCoreP6DayFeedReader } from "./tripCoreV2P6DayFeedRepository";
import { createManualStayRepository } from "./manualStayRepository";
import { createManualRentalRepository } from "./manualRentalRepository";
import { createManualActivityRepository } from "./manualActivityRepository";
import { createManualTransportRepository } from "./manualTransportRepository";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { createLocalManualFlightRepository } from "./localManualFlightRepository";
import {
  localTestHash,
  localTestStamp,
} from "../../domain/trip/__fixtures__/localCoreAuthority";
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(),
  resolveRetainedTripPhoto: vi.fn(),
  probeRetainedTripPhotoIdentity: vi.fn(),
  discardRetainedTripPhoto: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
const opened = new Set<DatabaseSync>(),
  directories: string[] = [];
afterEach(() => {
  for (const sql of opened) sql.close();
  opened.clear();
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture(
  path = ":memory:",
  initialize: boolean | "gap" = true,
  accountId = randomUUID(),
) {
  const sql = new DatabaseSync(path);
  opened.add(sql);
  sql.exec("PRAGMA foreign_keys=ON");
  if (initialize) {
    if (initialize === "gap")
      sql.exec(
        "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
      );
    for (const m of migrations) {
      // Keep later independent Trip tables;69 must be repaired before73's dependent trigger hardening.
      if (initialize === "gap" && (m.id === 69 || m.id >= 73)) continue;
      sql.exec(m.sql);
      if (initialize === "gap")
        sql
          .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
          .run(m.id, m.name, localTestStamp);
    }
  }
  let active = accountId,
    failQueue = false;
  const db: CoreDatabase = serializeDatabaseTransactions({
    async isInTransactionAsync() {
      return sql.isTransaction;
    },
    async getFirstAsync<T>(q: string, ...args: unknown[]) {
      return (sql.prepare(q).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...args: unknown[]) {
      return sql.prepare(q).all(...(args as never[])) as T[];
    },
    async runAsync(q: string, ...args: unknown[]) {
      if (failQueue && q.includes("INSERT INTO sync_operations")) {
        failQueue = false;
        throw new Error("QUEUE_FAILURE");
      }
      return sql.prepare(q).run(...(args as never[])) as never;
    },
    async withTransactionAsync(fn) {
      sql.exec("BEGIN");
      try {
        await fn();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  });
  const account = async () => active;
  const core = createTripCoreV2Repository(
    db,
    account,
    localTestHash,
    () => localTestStamp,
  );
  const repo = createLocalManualFlightRepository(core, account);
  const trips = createTripRepository(db, account, core, () => localTestStamp);
  return {
    sql,
    db,
    core,
    repo,
    trips,
    accountId,
    account,
    close() {
      sql.close();
      opened.delete(sql);
    },
    failQueue() {
      failQueue = true;
    },
    switchAccount() {
      active = randomUUID();
      advanceAccountGeneration();
    },
  };
}
async function draft(f: ReturnType<typeof fixture>) {
  const tripId = randomUUID();
  await f.trips.createTrip({
    operationId: randomUUID(),
    tripId,
    name: "Winter journey",
    destination: null,
    startDate: null,
    endDate: null,
  });
  return f.repo.createDraft(tripId);
}
const fields = { flightNumberLiteral: "NZ5069", departureDate: "2027-02-06" };
it("normal manual save survives a real close/reopen with the same journal receipt and no duplicate queue", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-manual-flight-"));
  directories.push(folder);
  const path = join(folder, "local.sqlite"),
    f = fixture(path),
    d = await draft(f);
  const result = await f.repo.save(d, fields, () => true);
  expect(result.status).toBe("LOCAL_COMMITTED");
  const account = f.accountId;
  f.close();
  const cold = fixture(path, false, account),
    restored = JSON.parse(JSON.stringify(d));
  expect(await cold.repo.recover(restored)).toEqual(result);
  expect(await cold.repo.save(restored, fields, () => true)).toEqual(result);
  const snapshot = await cold.core.combinedSnapshot(
    await cold.core.captureContext(d.tripId),
  );
  expect(snapshot?.certificate).toBeNull();
  expect(snapshot?.graph.trip_flight_intents[0].flight_number_literal).toBe("NZ5069");
  expect(snapshot?.graph.itinerary_events[0].start_local_date).toBe(fields.departureDate);
  expect(
    cold.sql.prepare("SELECT count(*) AS n FROM local_core_authority_slots").get()?.n,
  ).toBe(1);
  expect(
    cold.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='LOCAL_CORE_COMMIT' AND status='DEPENDENCY_BLOCKED'",
      )
      .get()?.n,
  ).toBe(1);
  await expect(
    cold.repo.save(restored, { ...fields, flightNumberLiteral: "NZ5070" }, () => true),
  ).rejects.toThrow("OUTCOME_MISMATCH");
});
it("queue failure rolls back, retains exact attempt IDs and input, and retry commits once", async () => {
  const f = fixture(),
    d = await draft(f);
  f.failQueue();
  await expect(f.repo.save(d, fields, () => true)).rejects.toThrow("QUEUE_FAILURE");
  expect(await f.repo.recover(d)).toBeNull();
  await expect(
    f.repo.save(d, { ...fields, departureDate: "2027-02-07" }, () => true),
  ).rejects.toThrow("DRAFT_FROZEN");
  const result = await f.repo.save(d, fields, () => true);
  expect(result.receipt.operationId).toBe(d.operationId);
  expect((await f.repo.recover(d))?.receipt).toEqual(result.receipt);
});
it("rejects invalid/closed/foreign intents and permits a second explicitly Manual sparse flight", async () => {
  const f = fixture(),
    d = await draft(f);
  await expect(
    f.repo.save(d, { ...fields, departureDate: "2027-02-30" }, () => true),
  ).rejects.toThrow();
  await expect(f.repo.save(d, fields, () => false)).rejects.toThrow("INTENT_CLOSED");
  await f.repo.save(d, fields, () => true);
  const second = await f.repo.createDraft(d.tripId);
  await expect(
    f.repo.save(second, { ...fields, flightNumberLiteral: "NZ5070" }, () => true),
  ).resolves.toMatchObject({ status: "LOCAL_COMMITTED", itemId: second.itemId });
  f.switchAccount();
  await expect(f.repo.recover(d)).rejects.toThrow("ACCOUNT_CHANGED");
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM local_core_authority_slots").get()?.n,
  ).toBe(2);
});
it("rechecks the captured intent and Account generation after owning preparation and before mutation", async () => {
  const f = fixture(),
    d = await draft(f);
  let checks = 0;
  await expect(f.repo.save(d, fields, () => ++checks < 3)).rejects.toThrow(
    "INTENT_CLOSED",
  );
  expect(await f.repo.recover(d)).toBeNull();
  const aba = createLocalManualFlightRepository(
    {
      ...f.core,
      async prepareLocalManualSparse(
        ...args: Parameters<typeof f.core.prepareLocalManualSparse>
      ) {
        const envelope = await f.core.prepareLocalManualSparse(...args);
        advanceAccountGeneration();
        advanceAccountGeneration();
        return envelope;
      },
    },
    async () => f.accountId,
  );
  const second = await aba.createDraft(d.tripId);
  await expect(aba.save(second, fields, () => true)).rejects.toThrow();
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM local_core_authority_slots").get()?.n,
  ).toBe(0);
});

it("fills the real 68+70 registry gap transactionally, preserving photos and four pending Forms through repeat/cold P2 reads", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-p2-gap69-"));
  directories.push(folder);
  const path = join(folder, "db.sqlite"),
    f = fixture(path, "gap"),
    d = await draft(f);
  await f.trips.addItem(d.tripId, {
    operationId: randomUUID(),
    itemId: randomUUID(),
    family: "P1",
    title: "Plan",
    startDate: "2027-02-06",
  });
  const identity = async () => f.accountId;
  const stay = createManualStayRepository(f.db, identity, f.core),
    sd = await stay.createDraft(d.tripId);
  await stay.save(sd, {
    ...sd.fields,
    title: "Stay",
    startDate: "2027-02-06",
    endDate: "2027-02-08",
  });
  const rental = createManualRentalRepository(f.db, identity, f.core),
    rd = await rental.createDraft(d.tripId);
  await rental.save(rd, {
    ...rd.fields,
    title: "Rental",
    startDate: "2027-02-06",
    endDate: "2027-02-08",
    startTime: "09:00",
    endTime: "17:00",
    pickupLocation: "Airport",
    returnLocation: "City",
  });
  const transport = createManualTransportRepository(f.db, identity, f.core),
    td = await transport.createDraft(d.tripId);
  await transport.save(td, {
    ...td.fields,
    title: "Train",
    transportType: "TRAIN",
    departureDate: "2027-02-06",
    departureLocation: "Station",
  });
  f.sql
    .prepare(
      "INSERT INTO local_trip_photos VALUES(?,?,?,'image/jpeg',12,?,'file:///owned/photo.jpg',?)",
    )
    .run(f.accountId, d.tripId, "photo-owned", "a".repeat(64), localTestStamp);
  const preservedTables = (
    f.sql
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'local_core_%' AND name<>'schema_migrations' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((row) => row.name);
  const preserved = () =>
    Object.fromEntries(
      preservedTables.map((name) => [
        name,
        f.sql.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
      ]),
    );
  const before = preserved();
  const coverSchema = () =>
    f.sql
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name LIKE '%cover%' OR name='local_trip_photos' ORDER BY name",
      )
      .all();
  const schema = coverSchema();
  const adapter = {
    ...f.db,
    execAsync: async (q: string) => f.sql.exec(q),
    runAsync: async (q: string, ...args: unknown[]) => {
      if (args[0] === 69) throw Error("MIGRATION_MARKER_FAILURE");
      return f.sql.prepare(q).run(...(args as never[]));
    },
  };
  await expect(runMigrations(adapter)).rejects.toThrow("MIGRATION_MARKER_FAILURE");
  expect(
    f.sql.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'local_core_%'").all(),
  ).toEqual([]);
  expect(preserved()).toEqual(before);
  await runMigrations({ ...adapter, runAsync: f.db.runAsync });
  expect(preserved()).toEqual(before);
  expect(coverSchema()).toEqual(schema);
  expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(
    f.sql
      .prepare("SELECT id FROM schema_migrations WHERE id IN (68,69,70) ORDER BY id")
      .all()
      .map((r) => r.id),
  ).toEqual([68, 69, 70]);
  await runMigrations({ ...adapter, runAsync: f.db.runAsync });
  const saved = await f.repo.save(d, fields, () => true);
  expect(saved.status).toBe("LOCAL_COMMITTED");
  const read = createTripLocalManualReader(f.db, identity, f.core);
  expect((await read(d.tripId))?.items.map((i) => i.family).sort()).toEqual([
    "P1",
    "P2",
    "P3",
    "P4",
    "P5",
  ]);
  expect(
    (await createCoreP6DayFeedReader(f.core)(d.tripId))?.projection.items.map(
      (i) => i.family,
    ),
  ).toEqual(["P2"]);
  f.close();
  const cold = fixture(path, false, f.accountId);
  expect(await cold.repo.recover(d)).toEqual(saved);
  expect(
    (await createTripLocalManualReader(cold.db, identity, cold.core)(d.tripId))?.items,
  ).toHaveLength(5);
  expect(
    (await createCoreP6DayFeedReader(cold.core)(d.tripId))?.projection.items[0].itemId,
  ).toBe(d.itemId);
});
it("saves a Flight beside verified pending P6 activity commands without changing the activity", async () => {
  const f = fixture(),
    d = await draft(f);
  const activity = createManualActivityRepository(
    f.db,
    f.account,
    f.core,
    () => localTestStamp,
  );
  const a = await activity.createDraft(d.tripId);
  await activity.save(a, {
    ...a.fields,
    title: "Museum",
    startDate: fields.departureDate,
    startTime: "09:00",
    endDate: fields.departureDate,
    endTime: "11:00",
    location: "Museum entrance",
  });
  const edit = await activity.read(d.tripId, a.itemId);
  await activity.save(edit, {
    ...edit.fields,
    title: "Museum edited",
    activityDetails: { ...edit.fields.activityDetails, sessionLabel: "Morning" },
  });
  const before = f.sql
    .prepare(
      "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY operation_id",
    )
    .all();
  expect(before.length).toBeGreaterThan(0);
  const result = await f.repo.save(d, fields, () => true);
  expect(result.status).toBe("LOCAL_COMMITTED");
  expect(
    f.sql
      .prepare(
        "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY operation_id",
      )
      .all(),
  ).toEqual(before);
  expect(await f.repo.recover(d)).toEqual(result);
});
it("does not infer non-Flight coverage from an unpinned SET or corrupted Manual creation", async () => {
  for (const corruption of ["queue", "set-only"] as const) {
    const f = fixture(),
      d = await draft(f),
      itemId = randomUUID();
    await f.trips.addItem(d.tripId, {
      operationId: randomUUID(),
      itemId,
      family: "P1",
      title: "Plan",
      startDate: "2027-02-06",
    });
    if (corruption === "queue")
      f.sql
        .prepare(
          "UPDATE sync_operations SET payload_json='{}' WHERE entity_type='TRIP_CORE_V2'",
        )
        .run();
    else
      f.sql
        .prepare("DELETE FROM trip_core_pending_intents WHERE account_id=? AND trip_id=?")
        .run(f.accountId, d.tripId);
    if (corruption === "set-only")
      await f.core.enqueue(await f.core.captureContext(d.tripId), {
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId: d.tripId,
        command: "SET_ITEM_TEXT",
        target: { kind: "ITEM", id: itemId },
        baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: { title: "Unknown", description: null },
      });
    await expect(f.repo.save(d, fields, () => true)).rejects.toThrow();
    expect(
      f.sql.prepare("SELECT count(*) n FROM local_core_authority_commits").get()?.n,
    ).toBe(0);
  }
});

it("preserves explicit P1-style Everyone participation through normal sparse save and recovery", async () => {
  const f = fixture(),
    d = await draft(f);
  const input = {
    ...fields,
    participation: { mode: "WHOLE_GROUP" as const, people: [], selfPersonId: null },
  };
  const saved = await f.repo.save(d, input, () => true);
  expect(await f.repo.save(d, input, () => true)).toEqual(saved);
  const snapshot = await f.core.combinedSnapshot(await f.core.captureContext(d.tripId));
  expect(snapshot!.graph.itinerary_events[0].participation_mode).toBe("WHOLE_GROUP");
  await expect(
    f.repo.save(
      d,
      { ...input, participation: { mode: "SELF", people: [], selfPersonId: null } },
      () => true,
    ),
  ).rejects.toThrow("LOCAL_MANUAL_OUTCOME_MISMATCH");
});
it("preserves selected authorized people without duplicate local commits", async () => {
  const f = fixture(),
    d = await draft(f);
  const person = (
    f.sql
      .prepare(
        "SELECT person_id FROM local_trip_ledger_bindings WHERE account_id=? AND trip_id=?",
      )
      .get(f.accountId, d.tripId) as { person_id: string }
  ).person_id;
  const input = {
    ...fields,
    participation: {
      mode: "SELECTED_MEMBERS" as const,
      people: [person],
      selfPersonId: null,
    },
  };
  const saved = await f.repo.save(d, input, () => true);
  expect(await f.repo.save(d, input, () => true)).toEqual(saved);
  const snapshot = await f.core.combinedSnapshot(await f.core.captureContext(d.tripId));
  expect(
    snapshot!.graph.trip_item_participants
      .filter((row) => row.active)
      .map((row) => row.person_id),
  ).toEqual([person]);
});
it("rejects unsupported extra fields before committing rather than silently saving a truncated flight", async () => {
  const f = fixture(),
    d = await draft(f);
  await expect(
    f.repo.save(d, { ...fields, departureTime: "09:00" } as any, () => true),
  ).rejects.toThrow();
  const snapshot = await f.core.combinedSnapshot(await f.core.captureContext(d.tripId));
  expect(snapshot?.graph.trip_flight_intents ?? []).toHaveLength(0);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM local_core_authority_slots").get()?.n,
  ).toBe(0);
});

it("loads only an actor-readable P2 Form snapshot and pins the requested revision", async () => {
  const f = fixture(),
    d = await draft(f);
  await f.repo.save(d, fields, () => true);
  const read = await f.repo.readForForm(d.tripId, d.itemId, 1);
  expect(read).toMatchObject({
    itemId: d.itemId,
    tripId: d.tripId,
    family: "P2",
    itemRevision: 1,
    details: { flightNumberLiteral: "NZ5069" },
  });
  await expect(f.repo.readForForm(d.tripId, d.itemId, 2)).rejects.toThrow(
    "MANUAL_FLIGHT_READ_CHANGED",
  );
  expect(read.capabilities).not.toMatchObject({ edit: true });
  expect(flightSegmentFromRead(read)).toMatchObject({
    flightNumberLiteral: fields.flightNumberLiteral,
    departureDate: fields.departureDate,
    departureTime: "",
    departureZone: "",
  });
});
it("never returns the previous Account's flight through Form loading", async () => {
  const f = fixture(),
    d = await draft(f);
  await f.repo.save(d, fields, () => true);
  f.switchAccount();
  await expect(f.repo.readForForm(d.tripId, d.itemId)).rejects.toThrow();
});

it("rejects participants outside the existing actor roster without creating a flight", async () => {
  const f = fixture(),
    d = await draft(f);
  await expect(
    f.repo.save(
      d,
      {
        ...fields,
        participation: {
          mode: "SELECTED_MEMBERS",
          people: [randomUUID()],
          selfPersonId: null,
        },
      },
      () => true,
    ),
  ).rejects.toThrow();
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM local_core_authority_slots").get()?.n,
  ).toBe(0);
});

function fullFields() {
  const plan = sparseFlightSavePlan([
    {
      ...emptyFlightSegment("one", "2026-11-01"),
      flightNumberLiteral: "NZ99",
      originCode: "AKL",
      originName: "Auckland International Airport",
      originTerminal: "I",
      destinationCode: "JFK",
      destinationName: "John F. Kennedy International Airport",
      destinationTerminal: "4",
      departureTime: "23:30",
      departureZone: "Pacific/Auckland",
      arrivalDate: "2026-11-01",
      arrivalTime: "01:30",
      arrivalZone: "America/New_York",
    },
  ]);
  if (plan.kind !== "READY") throw Error("Expected full lawful plan");
  return plan.fields;
}
it("persists full authored airports, unresolved DST clocks, same-ID Edit, another flight and cold recovery", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-full-manual-flight-"));
  directories.push(folder);
  const path = join(folder, "local.sqlite"),
    f = fixture(path),
    d = await draft(f);
  const value = fullFields();
  const saved = await f.repo.save(d, value, () => true);
  expect(await f.repo.save(d, value, () => true)).toEqual(saved);
  const read = await f.repo.readForForm(d.tripId, d.itemId);
  expect(flightSegmentFromRead(read)).toMatchObject({
    flightNumberLiteral: "NZ99",
    originCode: "AKL",
    destinationCode: "JFK",
    originTerminal: "I",
    destinationTerminal: "4",
    departureTime: "23:30",
    arrivalTime: "01:30",
    arrivalZone: "America/New_York",
  });
  const edit = await f.repo.createDraft(d.tripId, d.itemId, Number(read.itemRevision));
  const edited = {
    ...value,
    flightNumberLiteral: "NZ101",
    destination: { ...value.destination!, terminal: "8" },
  };
  const result = await f.repo.save(edit, edited, () => true);
  expect(result.itemId).toBe(d.itemId);
  expect(result.receipt.localRevision).toBe(2);
  const second = await f.repo.createDraft(d.tripId);
  await f.repo.save(second, value, () => true);
  const account = f.accountId;
  f.close();
  const cold = fixture(path, false, account);
  expect(await cold.repo.recover(JSON.parse(JSON.stringify(edit)))).toEqual(result);
  const reread = await cold.repo.readForForm(d.tripId, d.itemId);
  expect(flightSegmentFromRead(reread)).toMatchObject({
    flightNumberLiteral: "NZ101",
    destinationTerminal: "8",
  });
  const snapshot = await cold.core.combinedSnapshot(
    await cold.core.captureContext(d.tripId),
  );
  expect(snapshot?.graph.itinerary_events).toHaveLength(2);
  expect(snapshot?.graph.itinerary_transport_endpoints).toHaveLength(4);
  expect(snapshot?.graph.itinerary_transport_services).toHaveLength(0);
  expect(
    snapshot?.graph.trip_flight_intents.every((x) => x.qualification === "SPARSE"),
  ).toBe(true);
  expect(
    snapshot?.graph.itinerary_transport_endpoints.every(
      (x) =>
        x.instant === null &&
        x.source_instant === null &&
        x.civil_resolution === "PENDING",
    ),
  ).toBe(true);
  const local = await createTripLocalManualReader(
    cold.db,
    cold.account,
    cold.core,
  )(d.tripId);
  expect(local?.rows("2026-11-01").some((r) => r.itemRef === d.itemId)).toBe(true);
});
it("rejects stale full edits, a foreign Account and malformed authored temporal authority", async () => {
  const f = fixture(),
    d = await draft(f),
    value = fullFields();
  await f.repo.save(d, value, () => true);
  const first = await f.repo.createDraft(d.tripId, d.itemId, 1);
  const stale = await f.repo.createDraft(d.tripId, d.itemId, 1);
  await f.repo.save(first, { ...value, flightNumberLiteral: "NZ100" }, () => true);
  await expect(
    f.repo.save(stale, { ...value, flightNumberLiteral: "NZ101" }, () => true),
  ).rejects.toThrow("REVISION_CONFLICT");
  const next = await f.repo.createDraft(d.tripId);
  await expect(
    f.repo.save(
      next,
      {
        ...value,
        origin: {
          ...value.origin!,
          time: { ...value.origin!.time, instant: "2026-11-01T01:00:00Z" },
        },
      },
      () => true,
    ),
  ).rejects.toThrow();
  await expect(
    f.repo.save(
      next,
      {
        ...value,
        origin: {
          ...value.origin!,
          time: { ...value.origin!.time, zone_id: "Not/AZone" },
        },
      },
      () => true,
    ),
  ).rejects.toThrow();
  await expect(
    f.repo.save(
      next,
      {
        ...value,
        origin: { ...value.origin!, time: { ...value.origin!.time, zone_id: "+05:30" } },
      },
      () => true,
    ),
  ).rejects.toThrow();
  f.switchAccount();
  await expect(f.repo.save(next, value, () => true)).rejects.toThrow();
});
