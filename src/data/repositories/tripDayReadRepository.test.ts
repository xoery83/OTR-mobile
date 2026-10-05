import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import {
  tripDayReadModelMigration,
  dayEventColumns,
} from "@/data/db/migrations/tripDayReadModel";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  canonicalEventFactsSchema,
  canonicalEndpointSchema,
  type CanonicalEventRead,
} from "@/data/api/tripCanonicalReadContracts";
import {
  captureAccountRequestContext,
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import {
  createTripCanonicalEventRepository,
  type TripCanonicalEventDatabase,
} from "./tripCanonicalEventRepository";
import { fingerprintEventCollection } from "./tripEventCollectionVerification";
import { createTripDayReadRepository } from "./tripDayReadRepository";
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_: string, s: string) =>
    createHash("sha256").update(s).digest("hex"),
}));
const account = "10000000-0000-4000-8000-000000000001",
  otherAccount = "10000000-0000-4000-8000-000000000002",
  trip = "20000000-0000-4000-8000-000000000001",
  otherTrip = "20000000-0000-4000-8000-000000000002",
  epoch = "40000000-0000-4000-8000-000000000001";
type ReadOnly = Extract<CanonicalEventRead, { disposition: "READ_ONLY" }>;
function read(
  i = 1,
  shape: ReadOnly["event"]["temporal_shape"] = "POINT",
  t = trip,
): ReadOnly {
  const e = {
    ...Object.fromEntries(
      Object.keys(canonicalEventFactsSchema.shape).map((key) => [key, null]),
    ),
    id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    trip_id: t,
    temporal_contract_version: 1,
    temporal_shape: shape,
    semantic_revision: 1,
    title: "Accepted",
    event_type: "activity",
    status: "planned",
    order_index: 0,
    participant_scope: "UNASSIGNED",
    is_estimated_time: false,
    start_quality: "UNKNOWN",
    start_basis: "DERIVED_CIVIL",
    start_civil_resolution: "PENDING",
    start_provenance_refs: {},
    itinerary_transport_endpoints: [],
  };
  if (["CALENDAR", "ALL_DAY", "WINDOW"].includes(shape))
    Object.assign(e, {
      start_quality: null,
      start_local_date: "2026-12-17",
      timing_label: shape === "WINDOW" ? "afternoon" : null,
    });
  if (shape === "TRANSPORT")
    Object.assign(e, {
      start_quality: null,
      start_basis: null,
      start_civil_resolution: null,
      start_provenance_refs: null,
      itinerary_transport_endpoints: ["ORIGIN", "DESTINATION"].map((role) => ({
        ...Object.fromEntries(
          Object.keys(canonicalEndpointSchema.shape).map((key) => [key, null]),
        ),
        event_id: e.id,
        role,
        quality: "UNKNOWN",
        basis: "DERIVED_CIVIL",
        civil_resolution: "PENDING",
        provenance_refs: {},
      })),
    });
  return {
    readVersion: 1,
    disposition: "READ_ONLY",
    legacyCompatible: false,
    event: e,
  } as unknown as ReadOnly;
}
function timed(i = 1, instant = "2026-12-17T10:00:00.123456Z", t = trip) {
  const r = read(i, "POINT", t);
  Object.assign(r.event, {
    planned_start: instant,
    start_quality: "EXACT",
    start_basis: "SOURCE_INSTANT",
    start_source_instant: instant,
    start_source_instant_precision: 6,
    start_civil_resolution: null,
  });
  return r;
}
const connections: DatabaseSync[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) db.close();
});
function open(path = ":memory:", fresh = true) {
  const db = new DatabaseSync(path);
  connections.push(db);
  db.exec("PRAGMA foreign_keys=ON");
  if (fresh) {
    for (const m of migrations) db.exec(m.sql);
  }
  return db;
}
function adapter(db: DatabaseSync): TripCanonicalEventDatabase {
  return serializeDatabaseTransactions({
    async getFirstAsync<T>(sql: string, ...args: unknown[]) {
      return (db.prepare(sql).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, ...args: unknown[]) {
      return db.prepare(sql).all(...(args as never[])) as T[];
    },
    async runAsync(sql: string, ...args: unknown[]) {
      return db.prepare(sql).run(...(args as never[])) as never;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      db.exec("BEGIN");
      try {
        await task();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  });
}
function fixture(db = open(), database = adapter(db)) {
  let user = account;
  const getUser = async () => user,
    repository = createTripDayReadRepository(database, getUser),
    canonical = createTripCanonicalEventRepository(database, getUser);
  return {
    db,
    database,
    getUser,
    repository,
    canonical,
    async certify(events: ReadOnly[] = [read()], revision = "1", t = trip) {
      const hash = await fingerprintEventCollection(t, events);
      const remote = createTripCanonicalEventRepository(
        database,
        getUser,
        undefined,
        async (context) => ({
          collectionContractVersion: 1,
          readVersion: 1,
          temporalContractVersion: 1,
          fingerprintVersion: 1,
          ordering: "EVENT_ID_ASC",
          disposition: "SNAPSHOT_PAGE",
          accountId: context.accountId,
          tripId: context.tripId,
          snapshot: { epochId: epoch, collectionRevision: revision },
          eventCount: events.length,
          fingerprint: hash,
          startOrdinal: 0,
          endOrdinal: events.length,
          events,
          complete: true,
          nextCursor: null,
        }),
      );
      return remote.refreshCollection(t);
    },
    async switchTo(next: string) {
      const lease = await beginAccountTransition();
      user = next;
      endAccountTransition(lease);
    },
  };
}
function durable(db: DatabaseSync) {
  return JSON.stringify(
    ["trip_day_projections", "trip_day_events", "trip_day_boundaries"].map((table) =>
      db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ),
  );
}
describe("coherent certified source seam", () => {
  it("no certificate cannot prepare/install", async () => {
    const f = fixture();
    expect(await f.repository.prepare(trip)).toBeNull();
    expect(await f.repository.getProjection(trip)).toBeNull();
  });
  it("empty certified collection creates complete empty offline projection", async () => {
    const f = fixture();
    await f.certify([]);
    expect(await f.repository.rebuild(trip)).toEqual({ generation: 1 });
    const result = await f.repository.today(trip, "2026-12-17T12:00:00Z", "UTC");
    expect(result?.projection.events).toEqual([]);
    expect(result?.sourceStatus).toBe("CURRENTLY_MATCHES_SOURCE");
    expect(
      (await f.repository.nextComparableEvent(trip, "2026-12-17T12:00:00Z", "UTC"))
        ?.result,
    ).toEqual({ next: null, unresolved: [] });
  });
  it("complete certificate reads exact roots/endpoints and association", async () => {
    const f = fixture();
    await f.certify([read(1, "TRANSPORT"), timed(2)]);
    const context = await captureAccountRequestContext(trip, f.getUser);
    await f.canonical.withCertifiedCollection(context, async (source) => {
      expect(source?.ids).toEqual([read(1).event.id, read(2).event.id]);
      expect(source?.events[0].event.itinerary_transport_endpoints).toHaveLength(2);
      expect(source?.appliedGeneration).toBe(1);
      expect(source?.context).toEqual(context);
      expect(f.db.isTransaction).toBe(true);
    });
  });
  it.each([
    "missing root",
    "extra root",
    "missing membership",
    "extra membership",
    "fingerprint",
    "root malformed",
    "missing endpoint",
    "contradictory participant",
    "generation rewind",
  ])("%s makes collection non-certifiable", async (kind) => {
    const f = fixture();
    await f.certify([read(1, "TRANSPORT")]);
    if (kind === "missing root")
      f.db.exec(
        "DELETE FROM trip_canonical_transport_endpoints; DELETE FROM trip_canonical_events",
      );
    if (kind === "extra root")
      f.db.exec(
        `INSERT INTO trip_canonical_events SELECT account_id,trip_id,'${read(2).event.id}',${Object.keys(canonicalEventFactsSchema.shape).length ? "read_version,read_disposition,legacy_compatible,observation_sequence,observed_generation," : ""}${Object.keys(
          canonicalEventFactsSchema.shape,
        )
          .filter((k) => !["id", "trip_id", "itinerary_transport_endpoints"].includes(k))
          .join(",")} FROM trip_canonical_events`,
      );
    if (kind === "missing membership")
      f.db.exec("DELETE FROM trip_canonical_event_collection_ids");
    if (kind === "extra membership")
      f.db
        .prepare("INSERT INTO trip_canonical_event_collection_ids VALUES(?,?,?)")
        .run(account, trip, read(2).event.id);
    if (kind === "fingerprint")
      f.db.exec(
        "UPDATE trip_canonical_event_collections SET fingerprint='" +
          "0".repeat(64) +
          "'",
      );
    if (kind === "root malformed")
      f.db.exec("UPDATE trip_canonical_events SET read_version=2");
    if (kind === "missing endpoint")
      f.db.exec(
        "DELETE FROM trip_canonical_transport_endpoints WHERE role='DESTINATION'",
      );
    if (kind === "contradictory participant")
      f.db.exec("UPDATE trip_canonical_events SET participant_scope='ASSIGNED'");
    if (kind === "generation rewind") {
      await f.certify([read(1, "TRANSPORT")], "2");
      f.db.exec(
        "UPDATE trip_canonical_event_collection_generations SET refresh_generation=1",
      );
    }
    expect(await f.repository.rebuild(trip)).toBeNull();
    expect(await f.repository.getProjection(trip)).toBeNull();
  });
  it("partial/withheld refresh cannot certify new projection", async () => {
    const f = fixture();
    const remote = createTripCanonicalEventRepository(
      f.database,
      f.getUser,
      undefined,
      async () => ({
        collectionContractVersion: 1,
        disposition: "WITHHELD",
        reason: "COLLECTION_CERTIFICATION_UNAVAILABLE",
      }),
    );
    expect(await remote.refreshCollection(trip)).toBe("WITHHELD");
    expect(await f.repository.prepare(trip)).toBeNull();
    const partial = createTripCanonicalEventRepository(
      f.database,
      f.getUser,
      undefined,
      async () => ({ events: [read()], complete: false }),
    );
    await expect(partial.refreshCollection(trip)).rejects.toThrow();
    expect(await f.repository.rebuild(trip)).toBeNull();
  });
  it("withheld individual observation never creates certificate", async () => {
    const f = fixture();
    await f.canonical.applyRead(
      await captureAccountRequestContext(trip, f.getUser),
      read().event.id,
      { readVersion: 1, disposition: "WITHHELD", reason: "UNSUPPORTED_CONTRACT" },
    );
    expect(await f.repository.rebuild(trip)).toBeNull();
  });
  it("read callback holds the SQLite/Account gate against intervening individual apply", async () => {
    const f = fixture();
    await f.certify([timed()]);
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((r) => {
        entered = r;
      }),
      hold = new Promise<void>((r) => {
        release = r;
      });
    const context = await captureAccountRequestContext(trip, f.getUser);
    const reading = f.canonical.withCertifiedCollection(context, async (source) => {
      entered();
      await hold;
      expect(source?.events[0].event.semantic_revision).toBe(1);
      expect(f.db.isTransaction).toBe(true);
    });
    await ready;
    const newer = timed();
    newer.event.semantic_revision = 2;
    let applied = false;
    const applying = f.canonical.applyRead(context, newer.event.id, newer).then(() => {
      applied = true;
    });
    await Promise.resolve();
    expect(applied).toBe(false);
    release();
    await reading;
    await applying;
    expect(await f.repository.rebuild(trip)).toBeNull();
  });
});
describe("independent SQLite snapshot race", () => {
  it("concurrent WAL writer cannot mix certificate and individual member facts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "otr-day-snapshot-")),
      path = join(dir, "cache.db");
    try {
      const db = open(path);
      db.exec("PRAGMA journal_mode=WAL");
      const f = fixture(db);
      await f.certify([timed()]);
      const writer = new DatabaseSync(path);
      connections.push(writer);
      const readRows = f.database.getAllAsync.bind(f.database);
      let raced = false;
      f.database.getAllAsync = async (sql: string, ...args: unknown[]) => {
        const rows = await readRows(sql, ...(args as never[]));
        if (!raced && sql.startsWith("SELECT event_id FROM trip_canonical_events")) {
          raced = true;
          writer.exec(
            "UPDATE trip_canonical_events SET title='changed after certificate read'",
          );
        }
        return rows as never;
      };
      const context = await captureAccountRequestContext(trip, f.getUser);
      await f.canonical.withCertifiedCollection(context, async (source) => {
        expect(source?.events[0].event.title).toBe("Accepted");
      });
      expect(raced).toBe(true);
      expect(await f.repository.rebuild(trip)).toBeNull();
      connections.splice(connections.indexOf(writer), 1);
      writer.close();
      connections.splice(connections.indexOf(db), 1);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("installation CAS and Account/Trip fencing", () => {
  it("replaces and removes scoped children with foreign keys disabled", async () => {
    const f = fixture();
    await f.certify([timed()]);
    await f.repository.rebuild(trip);
    f.db.exec("PRAGMA foreign_keys=OFF");
    await expect(f.repository.rebuild(trip)).resolves.toEqual({ generation: 2 });
    await f.certify([], "2");
    await expect(f.repository.rebuild(trip)).resolves.toEqual({ generation: 3 });
    expect((await f.repository.getProjection(trip))?.projection.events).toEqual([]);
    expect(f.db.prepare("SELECT COUNT(*) n FROM trip_day_boundaries").get()).toEqual({
      n: 0,
    });
  });
  it("projection version/generation is distinct from source and semantic revisions", async () => {
    const f = fixture();
    const r = timed();
    r.event.semantic_revision = 9;
    await f.certify([r], "27");
    await f.repository.rebuild(trip);
    await f.repository.rebuild(trip);
    expect((await f.repository.getProjection(trip))?.projection).toMatchObject({
      version: 1,
      generation: 2,
      source: { revision: "27", appliedGeneration: 1 },
      events: [{ semantic_revision: 9 }],
    });
  });
  it("same-source concurrent stale builder loses to later installation", async () => {
    const f = fixture();
    await f.certify();
    const a = await f.repository.prepare(trip),
      b = await f.repository.prepare(trip);
    await b!.install();
    const before = durable(f.db);
    await expect(a!.install()).rejects.toThrow("SUPERSEDED");
    expect(durable(f.db)).toBe(before);
    await expect(b!.install()).rejects.toThrow("SUPERSEDED");
  });
  it("changed applied generation invalidates builder even with identical fingerprint/revision", async () => {
    const f = fixture();
    await f.certify();
    const old = await f.repository.prepare(trip);
    await f.certify();
    await expect(old!.install()).rejects.toThrow("SUPERSEDED");
  });
  it("source changes between derivation and commit cannot install", async () => {
    const f = fixture();
    await f.certify([timed()]);
    const old = await f.repository.prepare(trip);
    const newer = timed();
    newer.event.semantic_revision = 2;
    await f.canonical.applyRead(
      await captureAccountRequestContext(trip, f.getUser),
      newer.event.id,
      newer,
    );
    await expect(old!.install()).rejects.toThrow("SUPERSEDED");
    expect(await f.repository.getProjection(trip)).toBeNull();
  });
  it("newer accepted collection supersedes old builder", async () => {
    const f = fixture();
    await f.certify();
    const old = await f.repository.prepare(trip);
    await f.certify([read(2)], "2");
    await f.repository.rebuild(trip);
    const before = durable(f.db);
    await expect(old!.install()).rejects.toThrow("SUPERSEDED");
    expect(durable(f.db)).toBe(before);
  });
  it("A→B→A rejects the captured operation", async () => {
    const f = fixture();
    await f.certify();
    const old = await f.repository.prepare(trip);
    await f.switchTo(otherAccount);
    await f.switchTo(account);
    await expect(old!.install()).rejects.toThrow("Account changed");
    expect(await f.repository.getProjection(trip)).toBeNull();
  });
  it("same Event ID is isolated across Accounts and Trips", async () => {
    const f = fixture();
    await f.certify([timed()]);
    const original = await f.repository.prepare(trip);
    await f.certify([timed(1, "2026-12-18T12:00:00Z", otherTrip)], "1", otherTrip);
    await f.repository.rebuild(otherTrip);
    await original!.install();
    expect(
      (await f.repository.getProjection(trip))?.projection.events[0].boundaries[1]
        .instant ??
        (await f.repository.getProjection(trip))?.projection.events[0].boundaries[0]
          .instant,
    ).toBe("2026-12-17T10:00:00.123456Z");
    await f.switchTo(otherAccount);
    expect(await f.repository.getProjection(trip)).toBeNull();
    await f.certify([]);
    await f.repository.rebuild(trip);
    expect((await f.repository.getProjection(trip))?.projection.events).toEqual([]);
    await f.switchTo(account);
    expect((await f.repository.getProjection(trip))?.projection.events).toHaveLength(1);
  });
  it.each(["trip_day_projections", "trip_day_events", "trip_day_boundaries"])(
    "failure during %s installation rolls back replacement",
    async (table) => {
      const f = fixture();
      await f.certify([timed()]);
      await f.repository.rebuild(trip);
      const before = durable(f.db);
      f.db.exec(
        `CREATE TEMP TRIGGER fail BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'crash before commit'); END`,
      );
      await expect(f.repository.rebuild(trip)).rejects.toThrow("crash before commit");
      expect(durable(f.db)).toBe(before);
    },
  );
  it("commit failure after all writes leaves prior projection unchanged", async () => {
    const db = open(),
      base = adapter(db);
    let crash = false;
    const database = {
      ...base,
      withTransactionAsync: async (task: () => Promise<void>) =>
        base.withTransactionAsync(async () => {
          await task();
          if (crash) throw new Error("lost process before commit");
        }),
    };
    const f = fixture(db, database);
    await f.certify();
    await f.repository.rebuild(trip);
    const prepared = await f.repository.prepare(trip),
      before = durable(db);
    crash = true;
    await expect(prepared!.install()).rejects.toThrow("before commit");
    expect(durable(db)).toBe(before);
  });
  it("Account transition waits until installation commit", async () => {
    const f = fixture();
    await f.certify();
    const prepared = await f.repository.prepare(trip);
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((r) => {
        entered = r;
      }),
      hold = new Promise<void>((r) => {
        release = r;
      });
    const run = f.database.runAsync.bind(f.database);
    f.database.runAsync = async (sql, ...params) => {
      const result = await run(sql, ...(params as unknown as never[]));
      if (sql.startsWith("INSERT INTO trip_day_projections")) {
        entered();
        await hold;
      }
      return result;
    };
    const installing = prepared!.install();
    await ready;
    let switched = false;
    const switching = f.switchTo(otherAccount).then(() => {
      switched = true;
    });
    await Promise.resolve();
    expect(switched).toBe(false);
    release();
    await expect(installing).rejects.toThrow("Account changed");
    await switching;
    await f.switchTo(account);
    expect(await f.repository.getProjection(trip)).toBeNull();
  });
});
describe("lossless durable facts and offline read", () => {
  it.each([
    "POINT",
    "CALENDAR",
    "ALL_DAY",
    "SPAN",
    "STAY",
    "TRANSPORT",
    "WINDOW",
  ] as const)(
    "%s retains immutable shape, roles, temporal/spatial representations",
    async (shape) => {
      const f = fixture(),
        r = read(1, shape);
      r.event.authored_address = "Authored address";
      r.event.accepted_latitude = 1.123456789012345;
      r.event.spatial_provenance_refs = { address: "accepted/ref" };
      if (shape === "TRANSPORT")
        Object.assign(r.event.itinerary_transport_endpoints[0], {
          authored_label: "Airport",
          local_date: "2026-12-17",
          local_time: "11:22:33.123456",
          quality: "EXACT",
          clock_precision: 6,
          zone_id: "Pacific/Auckland",
          civil_resolution: "FOLD",
          provenance_refs: { clock: "accepted/clock" },
        });
      else if (["POINT", "SPAN", "STAY"].includes(shape))
        Object.assign(r.event, {
          start_local_date: "2026-12-17",
          start_local_time: "11:22:33.123456",
          start_quality: "EXACT",
          start_clock_precision: 6,
          start_zone_id: "Pacific/Auckland",
          start_civil_resolution: "PENDING",
        });
      await f.certify([r]);
      await f.repository.rebuild(trip);
      const p = (await f.repository.getProjection(trip))!.projection.events[0];
      for (const key of dayEventColumns) expect(p[key]).toEqual(r.event[key]);
      expect(p.boundaries.map((b) => b.role).sort()).toEqual(
        shape === "TRANSPORT" ? ["DESTINATION", "ORIGIN"] : ["END", "START"],
      );
      expect(
        p.boundaries.find((b) => b.role === (shape === "TRANSPORT" ? "ORIGIN" : "START"))
          ?.local_time,
      ).toBe(
        ["POINT", "SPAN", "STAY", "TRANSPORT"].includes(shape) ? "11:22:33.123456" : null,
      );
    },
  );
  it("queries immutable facts after newer individual mirror read", async () => {
    const f = fixture();
    await f.certify([timed(), read(2)]);
    await f.repository.rebuild(trip);
    const newer = timed(1, "2026-12-18T00:00:00Z");
    newer.event.semantic_revision = 2;
    await f.canonical.applyRead(
      await captureAccountRequestContext(trip, f.getUser),
      newer.event.id,
      newer,
    );
    const result = await f.repository.itemsForLocalDate(trip, "2026-12-17", "UTC");
    expect(result?.sourceStatus).toBe("HISTORICAL_ACCEPTED_PROJECTION");
    expect(result?.result.timed[0].anchor).toBe("2026-12-17T10:00:00.123456Z");
    expect(
      (
        await f.repository.nextComparableEvent(trip, "2026-12-17T09:00:00Z", "UTC")
      )?.result.unresolved.map((e) => e.id),
    ).toEqual([read(2).event.id]);
    expect(
      (await f.repository.tomorrow(trip, "2026-12-16T09:00:00Z", "UTC"))?.result.date,
    ).toBe("2026-12-17");
  });
  it("source read unavailable keeps historical observation readable", async () => {
    const f = fixture();
    await f.certify([timed()]);
    await f.repository.rebuild(trip);
    const query = f.database.getFirstAsync.bind(f.database);
    f.database.getFirstAsync = async (sql, ...params) => {
      if (sql.includes("trip_canonical_")) throw new Error("source unavailable");
      return query(sql, ...(params as unknown as never[]));
    };
    const p = await f.repository.getProjection(trip);
    expect(p?.sourceStatus).toBe("HISTORICAL_ACCEPTED_PROJECTION");
    expect(p?.projection.events).toHaveLength(1);
  });
  it("source generation corruption keeps historical accepted data", async () => {
    const f = fixture();
    await f.certify();
    await f.repository.rebuild(trip);
    await f.certify(undefined, "2");
    f.db.exec(
      "UPDATE trip_canonical_event_collection_generations SET refresh_generation=1",
    );
    expect((await f.repository.getProjection(trip))?.sourceStatus).toBe(
      "HISTORICAL_ACCEPTED_PROJECTION",
    );
  });
  it.each(["matches", "changed", "removed"])(
    "cold restart without transport, source %s",
    async (kind) => {
      const dir = mkdtempSync(join(tmpdir(), "otr-day-")),
        path = join(dir, "cache.db");
      try {
        const f = fixture(open(path));
        await f.certify([timed()]);
        await f.repository.rebuild(trip);
        if (kind === "changed") {
          const n = timed();
          n.event.semantic_revision = 2;
          await f.canonical.applyRead(
            await captureAccountRequestContext(trip, f.getUser),
            n.event.id,
            n,
          );
        }
        if (kind === "removed")
          f.db.exec(
            "DELETE FROM trip_canonical_events;DELETE FROM trip_canonical_event_collections",
          );
        connections.splice(connections.indexOf(f.db), 1);
        f.db.close();
        const restarted = fixture(open(path, false));
        const p = await restarted.repository.getProjection(trip);
        expect(p?.sourceStatus).toBe(
          kind === "matches"
            ? "CURRENTLY_MATCHES_SOURCE"
            : "HISTORICAL_ACCEPTED_PROJECTION",
        );
        expect(p?.projection.events[0].semantic_revision).toBe(1);
        expect(
          (await restarted.repository.today(trip, "2026-12-17T00:00:00Z", "UTC"))?.result
            .timed,
        ).toHaveLength(1);
        connections.splice(connections.indexOf(restarted.db), 1);
        restarted.db.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
  it("invalid chosen normalized instant blocks projection while preserving certificate", async () => {
    const f = fixture(),
      r = timed();
    r.event.start_source_instant = "2026-12-17T11:00:00Z";
    await f.certify([r]);
    await expect(f.repository.rebuild(trip)).rejects.toThrow("PROJECTION_INTEGRITY");
    expect((await f.canonical.getCollectionCertificate(trip))?.mirrorMatches).toBe(true);
  });
});
describe("independent SQLite 47 migration", () => {
  it("adds only three projection tables and preserves historical tables", () => {
    const db = new DatabaseSync(":memory:");
    connections.push(db);
    for (const m of migrations.filter(({ id }) => id < 47)) db.exec(m.sql);
    const names = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((r) => String(r.name));
    const prior = () =>
      JSON.stringify(
        names.map((n) => [
          db.prepare(`SELECT * FROM ${n}`).all(),
          db
            .prepare(
              "SELECT type,name,sql FROM sqlite_master WHERE tbl_name=? ORDER BY type,name",
            )
            .all(n),
        ]),
      );
    const before = prior();
    db.exec(tripDayReadModelMigration.sql);
    expect(prior()).toBe(before);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .get(),
    ).toEqual({ n: names.length + 3 });
    expect(migrations.find((m) => m.id === 47)).toBe(tripDayReadModelMigration);
  });
  it.each([1.5, "1", 0, 9007199254740992])(
    "generation %s rejects coercion/overflow",
    async (value) => {
      const f = fixture();
      await f.certify([]);
      await f.repository.rebuild(trip);
      expect(() =>
        f.db
          .prepare("UPDATE trip_day_projections SET projection_generation=?")
          .run(value),
      ).toThrow();
      expect(() =>
        f.db
          .prepare("UPDATE trip_day_projections SET source_applied_generation=?")
          .run(value),
      ).toThrow();
    },
  );
  it("projection generation exhaustion rejects without replacing last observation", async () => {
    const f = fixture();
    await f.certify([]);
    await f.repository.rebuild(trip);
    f.db.exec("UPDATE trip_day_projections SET projection_generation=9007199254740991");
    const before = durable(f.db);
    await expect(f.repository.prepare(trip)).rejects.toThrow();
    expect(durable(f.db)).toBe(before);
  });
});
