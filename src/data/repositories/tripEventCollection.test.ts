import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  captureAccountRequestContext,
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import {
  canonicalEventFactsSchema,
  canonicalEndpointSchema,
  type CanonicalEventRead,
} from "@/data/api/tripCanonicalReadContracts";
import { createTripCanonicalReadTransport } from "@/data/api/tripCanonicalReadTransport";
import {
  canonicalReadBytes,
  decodeMobileEventCollectionCursor,
  utf8Length,
} from "@/data/api/tripEventCollectionCodec";
import {
  collectionFingerprint,
  eventCollectionPage as serverPage,
  decodeEventCollectionCursor,
} from "../../../backend/src/tripEventCollection";
import {
  fingerprintEventCollection,
  type CollectionPageFetcher,
} from "./tripEventCollectionVerification";
import {
  createTripCanonicalEventRepository,
  type TripCanonicalEventDatabase,
} from "./tripCanonicalEventRepository";
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_: string, s: string) =>
    createHash("sha256").update(s).digest("hex"),
}));
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const account = "10000000-0000-4000-8000-000000000001",
  trip = "20000000-0000-4000-8000-000000000001",
  epoch = "40000000-0000-4000-8000-000000000001";
const otherAccount = "10000000-0000-4000-8000-000000000002",
  otherTrip = "20000000-0000-4000-8000-000000000002";
type ReadOnly = Extract<CanonicalEventRead, { disposition: "READ_ONLY" }>;
function read(i = 1, semantic = 1, t = trip): ReadOnly {
  return {
    readVersion: 1,
    disposition: "READ_ONLY",
    legacyCompatible: false,
    event: {
      ...Object.fromEntries(
        Object.keys(canonicalEventFactsSchema.shape).map((k) => [k, null]),
      ),
      id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      trip_id: t,
      temporal_contract_version: 1,
      temporal_shape: "POINT",
      semantic_revision: semantic,
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
    },
  } as unknown as ReadOnly;
}
function transport(): ReadOnly {
  const r = read();
  Object.assign(r.event, {
    temporal_shape: "TRANSPORT",
    start_quality: null,
    start_basis: null,
    start_civil_resolution: null,
    start_provenance_refs: null,
    location_input_revision: null,
    itinerary_transport_endpoints: ["ORIGIN", "DESTINATION"].map((role) => ({
      ...Object.fromEntries(
        Object.keys(canonicalEndpointSchema.shape).map((k) => [k, null]),
      ),
      event_id: r.event.id,
      role,
      quality: "UNKNOWN",
      basis: "DERIVED_CIVIL",
      civil_resolution: "PENDING",
      provenance_refs: {},
      location_input_revision: 1,
    })),
  });
  return r;
}
const many = (n: number) => Array.from({ length: n }, (_, i) => read(i + 1));
function page(...args: Parameters<typeof serverPage>) {
  const p = serverPage(...args);
  if (!("events" in p)) throw new Error("test fixture WITHHELD");
  return p;
}
const raw = (events: ReadOnly[], revision = "1", e = epoch) => ({
  disposition: "OBSERVATION",
  snapshot: { epochId: e, collectionRevision: revision },
  events,
});
const connections: DatabaseSync[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) db.close();
});
function open(path = ":memory:", through = 46) {
  const db = new DatabaseSync(path);
  connections.push(db);
  db.exec("PRAGMA foreign_keys=ON");
  for (const m of migrations.filter((m) => m.id <= through)) db.exec(m.sql);
  return db;
}
function adapter(db: DatabaseSync): TripCanonicalEventDatabase {
  return serializeDatabaseTransactions({
    async getFirstAsync<T>(s: string, ...args: unknown[]) {
      return (db.prepare(s).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(s: string, ...args: unknown[]) {
      return db.prepare(s).all(...(args as never[])) as T[];
    },
    async runAsync(s: string, ...args: unknown[]) {
      return db.prepare(s).run(...(args as never[])) as never;
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
function fixture(db = open()) {
  let user = account,
    observation = raw([read()]);
  let fetcher: CollectionPageFetcher = async (context, cursor) =>
    page(observation, context.accountId, context.tripId, cursor);
  const database = adapter(db),
    getUser = async () => user;
  const repo = createTripCanonicalEventRepository(
    database,
    getUser,
    undefined,
    (...args) => fetcher(...args),
  );
  return {
    db,
    database,
    repo,
    getUser,
    set: (events: ReadOnly[], rev = "1", e = epoch) => {
      observation = raw(events, rev, e);
    },
    fetch: (f: CollectionPageFetcher) => {
      fetcher = f;
    },
    context: (t = trip) => captureAccountRequestContext(t, getUser),
    async switchUser(next: string) {
      const lease = await beginAccountTransition();
      user = next;
      endAccountTransition(lease);
    },
  };
}
function durable(db: DatabaseSync) {
  return JSON.stringify(
    [
      "trip_canonical_events",
      "trip_canonical_transport_endpoints",
      "trip_canonical_event_collections",
      "trip_canonical_event_collection_ids",
    ].map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY account_id,trip_id`).all()),
  );
}
const token = (c: unknown) => Buffer.from(JSON.stringify(c)).toString("base64url");
describe("B-T3I full-chain certificate verification", () => {
  it("Mobile reproduces five normative B-T3G goldens through native hash seam", async () => {
    const point = read(),
      pointer = read(),
      loss = read();
    const place = "50000000-0000-4000-8000-000000000001";
    Object.assign(pointer.event, {
      accepted_address: "Station",
      accepted_place_id: place,
      spatial_provenance_refs: { accepted_address: "otr-event/confirmation/address" },
    });
    Object.assign(loss.event, { ...pointer.event, accepted_place_id: null });
    const vectors = [[], [point], [pointer], [loss], [transport()]];
    const hashes = [
      "2de0e2f1c8e62730cbe6c2a9fad7fe95962d0549b25e83b36bc1f8079cd6cbb2",
      "c309fd3f17c8722fdb92805c3f8be2fd883f8f69c4a7783ee520b2ae4ed420a7",
      "2ef7b999cae0fbae1fd2b027d081cc3dcb1a99aca838d7c7bc1a5086483f82e6",
      "c48e08190a25614721677542c64a742b863ced01fbfb069e52b8127336e4f972",
      "05ff9d868a7822415e280936bc0124b01846dfc0c44fd205dd3716e21b67a561",
    ];
    for (let i = 0; i < vectors.length; i++) {
      expect(await fingerprintEventCollection(trip, vectors[i])).toBe(hashes[i]);
      expect(collectionFingerprint(trip, vectors[i])).toBe(hashes[i]);
    }
  });
  it("shared bytes preserve binary64, Unicode, controls and endpoint order; malformed Unicode rejects", () => {
    const r = transport();
    r.event.title = "雪🚆\n\u000b\u2028";
    r.event.itinerary_transport_endpoints[0].accepted_latitude = -0;
    r.event.itinerary_transport_endpoints[0].accepted_longitude = 1e-7;
    const bytes = canonicalReadBytes(r);
    expect(bytes).toContain('"accepted_latitude":0,"accepted_longitude":1e-7');
    expect(utf8Length(bytes)).toBe(Buffer.byteLength(bytes));
    r.event.itinerary_transport_endpoints.reverse();
    expect(canonicalReadBytes(r)).toBe(bytes);
    for (const bad of ["\ud800", "\udc00", "a\ud800b"]) {
      r.event.title = bad;
      expect(() => canonicalReadBytes(r)).toThrow("SNAPSHOT_INVALID");
    }
  });
  it.each([0, 1, 100, 101, 1203])(
    "complete %i Event set atomically applies and retries idempotently",
    async (n) => {
      const f = fixture();
      f.set(many(n));
      await f.repo.refreshCollection(trip);
      const cert = await f.repo.getCollectionCertificate(trip);
      expect(cert?.eventCount).toBe(n);
      expect(cert?.ids).toEqual(many(n).map((r) => r.event.id));
      const before = f.db.prepare("SELECT * FROM trip_canonical_events").all();
      await f.repo.refreshCollection(trip);
      expect(f.db.prepare("SELECT * FROM trip_canonical_events").all()).toEqual(before);
    },
    20000,
  );
  const mutations: [string, (p: ReturnType<typeof page>) => void][] = [
    [
      "duplicate ID",
      (p) => {
        p.events[1] = p.events[0];
      },
    ],
    ["wrong order", (p) => p.events.reverse()],
    [
      "missing page",
      (p) => {
        p.startOrdinal = 100;
        p.endOrdinal += 100;
      },
    ],
    [
      "wrong count",
      (p) => {
        p.eventCount++;
      },
    ],
    [
      "wrong fingerprint",
      (p) => {
        p.fingerprint = "0".repeat(64);
      },
    ],
    [
      "altered leaf",
      (p) => {
        p.events[0].event.title = "Forged";
      },
    ],
    [
      "wrong Account",
      (p) => {
        p.accountId = otherAccount;
      },
    ],
    [
      "wrong Trip",
      (p) => {
        p.tripId = otherTrip;
      },
    ],
    [
      "wrong read version",
      (p) => {
        (p as unknown as { readVersion: number }).readVersion = 2;
      },
    ],
    [
      "extra field",
      (p) => {
        Object.assign(p, { extra: true });
      },
    ],
    [
      "premature final",
      (p) => {
        p.complete = true;
        p.nextCursor = null;
      },
    ],
    [
      "extra continuation after final",
      (p) => {
        p.complete = false;
        p.nextCursor = "AAAA";
      },
    ],
    [
      "unsupported participant",
      (p) => {
        p.events[0].event.participant_scope = "ASSIGNED";
      },
    ],
    [
      "uppercase UUID",
      (p) => {
        p.events[0].event.id = "30000000-0000-4000-8000-00000000000A";
      },
    ],
  ];
  it.each(mutations)(
    "%s preserves accepted certificate/mirrors",
    async (_name, mutate) => {
      const f = fixture();
      f.set(many(2));
      await f.repo.refreshCollection(trip);
      const before = durable(f.db);
      f.fetch(async (context, cursor) => {
        const p = page(
          raw(many(_name === "premature final" ? 101 : 2), "2"),
          context.accountId,
          context.tripId,
          cursor,
        );
        mutate(p);
        return p;
      });
      await expect(f.repo.refreshCollection(trip)).rejects.toThrow();
      expect(durable(f.db)).toBe(before);
    },
  );
  it.each([
    "UNSUPPORTED_CLIENT",
    "UNSUPPORTED_EVENT_CONTRACT",
    "COLLECTION_CERTIFICATION_UNAVAILABLE",
  ])("WITHHELD %s never certifies absence", async (reason) => {
    const f = fixture();
    await f.repo.refreshCollection(trip);
    const before = durable(f.db);
    f.fetch(async () => ({
      collectionContractVersion: 1,
      disposition: "WITHHELD",
      reason,
    }));
    expect(await f.repo.refreshCollection(trip)).toBe("WITHHELD");
    expect(durable(f.db)).toBe(before);
  });
  it.each([
    "network loss",
    "stale cursor",
    "auth admission failure",
    "wrong continuation identity",
    "repeated first page",
  ])("%s mid-chain leaves previous state exact", async (kind) => {
    const f = fixture();
    await f.repo.refreshCollection(trip);
    const before = durable(f.db);
    let calls = 0;
    f.fetch(async (context, cursor) => {
      calls++;
      if (calls > 1) {
        if (kind === "wrong continuation identity")
          return page(raw(many(101), "3"), context.accountId, context.tripId, cursor);
        if (kind === "repeated first page")
          return page(raw(many(101), "2"), context.accountId, context.tripId, null);
        throw new Error(kind);
      }
      return page(raw(many(101), "2"), context.accountId, context.tripId, cursor);
    });
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow();
    expect(durable(f.db)).toBe(before);
  });
  it.each([
    "wrong ordinal",
    "wrong Trip",
    "wrong hash",
    "padding",
    "key order",
    "duplicate key",
    "future version",
    "invalid UTF8",
  ])("strict cursor rejects %s", async (kind) => {
    const f = fixture();
    const observation = raw(many(101));
    f.fetch(async (context, cursor) => {
      const p = page(observation, context.accountId, context.tripId, cursor);
      const c = decodeEventCollectionCursor(p.nextCursor!);
      if (kind === "wrong ordinal") c.nextOrdinal = 99;
      if (kind === "wrong Trip") c.tripId = otherTrip;
      if (kind === "wrong hash") c.fingerprint = "0".repeat(64);
      p.nextCursor = token(c);
      if (kind === "padding") p.nextCursor += "=";
      if (kind === "key order")
        p.nextCursor = token(Object.fromEntries(Object.entries(c).reverse()));
      if (kind === "duplicate key")
        p.nextCursor = Buffer.from(
          JSON.stringify(c).replace("{", '{"version":1,'),
        ).toString("base64url");
      if (kind === "future version") p.nextCursor = token({ ...c, version: 2 });
      if (kind === "invalid UTF8")
        p.nextCursor = Buffer.from([0xff]).toString("base64url");
      return p;
    });
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow();
    expect(await f.repo.getCollectionCertificate(trip)).toBeNull();
  });
  it("canonical cursor decoding remains equivalent to Backend", () => {
    const p = page(raw(many(101)), account, trip, null);
    expect(decodeMobileEventCollectionCursor(p.nextCursor!)).toEqual(
      decodeEventCollectionCursor(p.nextCursor!),
    );
  });
  it("count limit rejects before certification", async () => {
    const f = fixture();
    f.fetch(async () => ({
      ...page(raw([]), account, trip, null),
      eventCount: 10001,
    }));
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow();
    expect(await f.repo.getCollectionCertificate(trip)).toBeNull();
  });
  it("oversized page rejects before any mirror apply", async () => {
    const f = fixture();
    const p = page(raw([read()]), account, trip, null);
    p.events[0].event.description = "x".repeat(4 * 1024 * 1024);
    f.fetch(async () => p);
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow("SNAPSHOT_LIMIT");
    expect(await f.repo.getEvent(trip, read().event.id)).toBeNull();
  });
  it("whole-set 64MiB bound applies across individually bounded pages", async () => {
    const f = fixture();
    const template = page(raw([]), account, trip, null);
    f.fetch(async (_context, cursor) => {
      const start =
        cursor === null ? 0 : decodeMobileEventCollectionCursor(cursor).nextOrdinal;
      const events = Array.from({ length: 100 }, (_, i) => {
        const r = read(start + i + 1);
        r.event.description = "x".repeat(35000);
        return r;
      });
      const end = start + 100;
      const p = {
        ...template,
        eventCount: 2000,
        startOrdinal: start,
        endOrdinal: end,
        events,
        complete: end === 2000,
        nextCursor: null as string | null,
      };
      if (!p.complete)
        p.nextCursor = token({
          version: 1,
          purpose: "TRIP_CANONICAL_EVENTS",
          accountId: account,
          tripId: trip,
          collectionContractVersion: 1,
          readVersion: 1,
          temporalContractVersion: 1,
          fingerprintVersion: 1,
          snapshotEpochId: epoch,
          snapshotRevision: "1",
          fingerprint: p.fingerprint,
          eventCount: 2000,
          nextOrdinal: end,
          ordering: "EVENT_ID_ASC",
        });
      return p;
    });
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow("SNAPSHOT_LIMIT");
    expect(await f.repo.getCollectionCertificate(trip)).toBeNull();
  });
});

describe("B-T3I atomic apply and persistent membership fencing", () => {
  it("complete absence removes only owned Account/Trip canonical mirrors", async () => {
    const f = fixture();
    await f.repo.applyRead(await f.context(), read().event.id, transport());
    await f.repo.applyRead(
      await f.context(otherTrip),
      read().event.id,
      read(1, 1, otherTrip),
    );
    await f.switchUser(otherAccount);
    await f.repo.applyRead(await f.context(), read().event.id, read());
    await f.switchUser(account);
    f.db.exec(
      `INSERT INTO itinerary_items(id,trip_id,title,scheduled_date,created_at,updated_at,sync_status) VALUES('local','${trip}','Local','2026-10-05','t','t','LOCAL');INSERT INTO expenses(id,trip_id,title,amount_minor,currency_code,created_at,updated_at,sync_status) VALUES('money','${trip}','Money',123,'NZD','t','t','LOCAL');`,
    );
    f.set([], "2");
    await f.repo.refreshCollection(trip);
    expect(await f.repo.getEvent(trip, read().event.id)).toBeNull();
    expect((await f.repo.getCollectionCertificate(trip))?.ids).toEqual([]);
    expect(f.db.prepare("SELECT COUNT(*) n FROM trip_canonical_events").get()).toEqual({
      n: 2,
    });
    expect(
      f.db.prepare("SELECT COUNT(*) n FROM trip_canonical_transport_endpoints").get(),
    ).toEqual({ n: 0 });
    expect(f.db.prepare("SELECT id FROM itinerary_items").get()).toEqual({ id: "local" });
    expect(f.db.prepare("SELECT id FROM expenses").get()).toEqual({ id: "money" });
  });
  it("delayed individual read cannot resurrect absence, even with higher semantic revision; newer complete set reintroduces", async () => {
    const f = fixture();
    await f.repo.refreshCollection(trip);
    const context = await f.context();
    f.set([], "2");
    await f.repo.refreshCollection(trip);
    expect(await f.repo.applyRead(context, read().event.id, read(1, 99))).toBe(
      "CERTIFIED_ABSENT",
    );
    expect(await f.repo.getEvent(trip, read().event.id)).toBeNull();
    f.set([read(1, 2)], "3");
    await f.repo.refreshCollection(trip);
    expect(await f.repo.applyRead(await f.context(), read().event.id, read(1, 3))).toBe(
      "APPLIED",
    );
  });
  it("cold restart restores empty membership fence and rejects delayed response", async () => {
    const dir = mkdtempSync(join(tmpdir(), "otr-bt3i-")),
      path = join(dir, "cache.sqlite");
    try {
      const f = fixture(open(path));
      await f.repo.refreshCollection(trip);
      f.set([], "2");
      await f.repo.refreshCollection(trip);
      connections.splice(connections.indexOf(f.db), 1);
      f.db.close();
      const db = new DatabaseSync(path);
      connections.push(db);
      db.exec("PRAGMA foreign_keys=ON");
      const repo = createTripCanonicalEventRepository(adapter(db), async () => account);
      expect((await repo.getCollectionCertificate(trip))?.ids).toEqual([]);
      expect(
        await repo.applyRead(
          await captureAccountRequestContext(trip, async () => account),
          read().event.id,
          read(1, 99),
        ),
      ).toBe("CERTIFIED_ABSENT");
      connections.splice(connections.indexOf(db), 1);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it.each([epoch, "40000000-0000-4000-8000-000000000002"])(
    "older refresh cannot overwrite latest epoch %s",
    async (newEpoch) => {
      const f = fixture();
      let release!: (v: unknown) => void, started!: () => void;
      const ready = new Promise<void>((r) => {
        started = r;
      });
      f.fetch(async () => {
        started();
        return new Promise((r) => {
          release = r;
        });
      });
      const old = f.repo.refreshCollection(trip);
      const oldRejected = expect(old).rejects.toThrow("SUPERSEDED");
      await ready;
      f.fetch(async (context, cursor) =>
        page(raw([read(2)], "2", newEpoch), context.accountId, context.tripId, cursor),
      );
      await f.repo.refreshCollection(trip);
      const before = durable(f.db);
      release(page(raw([read()], "1"), account, trip, null));
      await oldRejected;
      expect(durable(f.db)).toBe(before);
    },
  );
  it("same epoch lower revision rejects; equal contradictory bytes reject; identical remains idempotent", async () => {
    const f = fixture();
    f.set([read()], "9007199254740991");
    await f.repo.refreshCollection(trip);
    const before = durable(f.db);
    f.set([], "9");
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow("OLDER");
    expect(durable(f.db)).toBe(before);
    f.set([], "9007199254740991");
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow("MIRROR_INTEGRITY");
    expect(durable(f.db)).toBe(before);
    f.set([read()], "9007199254740991");
    await f.repo.refreshCollection(trip);
  });
  it("different epoch is incomparable and accepted only by latest refresh generation", async () => {
    const f = fixture();
    f.set([read()], "99");
    await f.repo.refreshCollection(trip);
    f.set([read(2)], "1", "40000000-0000-4000-8000-000000000002");
    await f.repo.refreshCollection(trip);
    expect(
      (await f.repo.getCollectionCertificate(trip))?.snapshot.collectionRevision,
    ).toBe("1");
  });
  it("intervening individual observation supersedes buffered absence", async () => {
    const f = fixture();
    let release!: (v: unknown) => void, started!: () => void;
    const ready = new Promise<void>((r) => {
      started = r;
    });
    f.fetch(async () => {
      started();
      return new Promise((r) => {
        release = r;
      });
    });
    const refresh = f.repo.refreshCollection(trip);
    const rejected = expect(refresh).rejects.toThrow("SUPERSEDED");
    await ready;
    await f.repo.applyRead(await f.context(), read().event.id, read());
    release(page(raw([], "2"), account, trip, null));
    await rejected;
    expect((await f.repo.getEvent(trip, read().event.id))?.data).toEqual(read());
  });
  it("Account A→B→A invalidates in-flight collection even after returning to A", async () => {
    const f = fixture();
    let release!: (v: unknown) => void, started!: () => void;
    const ready = new Promise<void>((r) => {
      started = r;
    });
    f.fetch(async () => {
      started();
      return new Promise((r) => {
        release = r;
      });
    });
    const refresh = f.repo.refreshCollection(trip);
    const rejected = expect(refresh).rejects.toThrow("Account changed");
    await ready;
    await f.switchUser(otherAccount);
    await f.switchUser(account);
    release(page(raw([read()]), account, trip, null));
    await rejected;
    expect(await f.repo.getCollectionCertificate(trip)).toBeNull();
  });
  it.each([
    "root upsert",
    "endpoint insert",
    "certificate install",
    "ID install",
    "endpoint removal",
    "root removal",
  ])(
    "transaction failure at %s rolls back all mirrors/certificate/membership",
    async (phase) => {
      const f = fixture();
      f.set([transport()]);
      await f.repo.refreshCollection(trip);
      const before = durable(f.db);
      const table = {
        "root upsert": "trip_canonical_events",
        "endpoint insert": "trip_canonical_transport_endpoints",
        "certificate install": "trip_canonical_event_collections",
        "ID install": "trip_canonical_event_collection_ids",
        "endpoint removal": "trip_canonical_transport_endpoints",
        "root removal": "trip_canonical_events",
      }[phase]!;
      const operation = phase.includes("removal") ? "DELETE" : "INSERT";
      f.db.exec(
        `CREATE TEMP TRIGGER fail BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'injected failure'); END;`,
      );
      f.set(
        phase.includes("removal")
          ? []
          : [{ ...transport(), event: { ...transport().event, semantic_revision: 2 } }],
        "2",
      );
      await expect(f.repo.refreshCollection(trip)).rejects.toThrow("injected failure");
      expect(durable(f.db)).toBe(before);
    },
  );
  it("unknown/corrupt local provenance blocks complete empty removal", async () => {
    const f = fixture();
    await f.repo.applyRead(await f.context(), read().event.id, read());
    f.db.exec("UPDATE trip_canonical_events SET read_version=2");
    const before = durable(f.db);
    f.set([], "2");
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow("MIRROR_INTEGRITY");
    expect(durable(f.db)).toBe(before);
  });
  it("incoming lower semantic revision cannot certify a different resulting mirror", async () => {
    const f = fixture();
    await f.repo.applyRead(await f.context(), read().event.id, read(1, 9));
    const before = durable(f.db);
    f.set([read(1, 8)]);
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow("MIRROR_INTEGRITY");
    expect(durable(f.db)).toBe(before);
  });
  it("Place UUID→null collection delta is atomic and revision-neutral", async () => {
    const f = fixture();
    const r = transport();
    r.event.itinerary_transport_endpoints.forEach((e) => {
      e.accepted_place_id = "50000000-0000-4000-8000-000000000001";
    });
    f.set([r]);
    await f.repo.refreshCollection(trip);
    const loss = structuredClone(r);
    loss.event.itinerary_transport_endpoints.forEach((e) => {
      e.accepted_place_id = null;
    });
    f.set([loss], "2");
    await f.repo.refreshCollection(trip);
    const actual = (await f.repo.getEvent(trip, r.event.id))?.data;
    expect(actual?.disposition).toBe("READ_ONLY");
    if (actual?.disposition === "READ_ONLY")
      expect(canonicalReadBytes(actual)).toBe(canonicalReadBytes(loss));
  });
});

describe("SQLite 46 migration integrity", () => {
  it("45→46 preserves every prior table/schema/row and installs only three scoped tables", () => {
    const db = open(":memory:", 45);
    db.exec(`INSERT INTO trip_person_participation_results VALUES('a','t','p','op','receipt','digest','{}');
    INSERT INTO trip_canonical_events(account_id,trip_id,event_id,read_version,read_disposition,legacy_compatible,observation_sequence,observed_generation,temporal_contract_version,temporal_shape,semantic_revision,title,event_type,status,participant_scope,is_estimated_time)
    VALUES('a','t','event',1,'READ_ONLY',0,1,0,1,'TRANSPORT',1,'Canonical','transport','planned','UNASSIGNED',0);
    INSERT INTO trip_canonical_transport_endpoints(account_id,trip_id,event_id,role) VALUES('a','t','event','ORIGIN'),('a','t','event','DESTINATION');
    INSERT INTO itinerary_items(id,trip_id,title,scheduled_date,created_at,updated_at,sync_status) VALUES('local','t','Local','2026-10-05','t','t','LOCAL');
    INSERT INTO expenses(id,trip_id,title,amount_minor,currency_code,created_at,updated_at,sync_status) VALUES('money','t','Money',123,'NZD','t','t','LOCAL');`);
    const names = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((r) => String(r.name));
    const state = () =>
      JSON.stringify(
        names.map((n) => [
          db.prepare(`SELECT * FROM "${n}"`).all(),
          db
            .prepare(
              "SELECT type,name,sql FROM sqlite_master WHERE tbl_name=? ORDER BY type,name",
            )
            .all(n),
        ]),
      );
    const before = state();
    db.exec(migrations.find((m) => m.id === 46)!.sql);
    expect(state()).toBe(before);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .get(),
    ).toEqual({ n: names.length + 3 });
    for (const bad of ["0", "01", "9007199254740992", "1e3"]) {
      db.exec(
        "INSERT OR IGNORE INTO trip_canonical_event_collection_generations VALUES('a','t',1)",
      );
      expect(() =>
        db
          .prepare(
            "INSERT INTO trip_canonical_event_collections VALUES('a','t',?, ?,1,1,1,1,0,?,1,1)",
          )
          .run(epoch, bad, "0".repeat(64)),
      ).toThrow(/CHECK/);
    }
    expect(() =>
      db.exec("UPDATE trip_person_participation_results SET receipt_json='{}'"),
    ).toThrow("PARTICIPATION_RECEIPT_IMMUTABLE");
  });
});

describe("B-T3I retained certificate isolation", () => {
  it("membership is Account/Trip isolated even for the same Event UUID", async () => {
    const f = fixture();
    f.set([]);
    await f.repo.refreshCollection(trip);
    await f.switchUser(otherAccount);
    expect(await f.repo.applyRead(await f.context(), read().event.id, read())).toBe(
      "APPLIED",
    );
    await f.switchUser(account);
    expect(
      await f.repo.applyRead(
        await f.context(otherTrip),
        read().event.id,
        read(1, 1, otherTrip),
      ),
    ).toBe("APPLIED");
    expect(await f.repo.applyRead(await f.context(), read().event.id, read())).toBe(
      "CERTIFIED_ABSENT",
    );
  });
  it("later individual update invalidates mirror freshness but retains durable membership fence", async () => {
    const f = fixture();
    await f.repo.refreshCollection(trip);
    expect((await f.repo.getCollectionCertificate(trip))?.mirrorMatches).toBe(true);
    await f.repo.applyRead(await f.context(), read().event.id, read(1, 2));
    expect((await f.repo.getCollectionCertificate(trip))?.mirrorMatches).toBe(false);
    const before = durable(f.db);
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow("MIRROR_INTEGRITY");
    expect(durable(f.db)).toBe(before);
    f.set([read(1, 2)], "2");
    await f.repo.refreshCollection(trip);
    expect((await f.repo.getCollectionCertificate(trip))?.mirrorMatches).toBe(true);
  });
  it("durable generation overflow rejects before transport or apply", async () => {
    const f = fixture();
    await f.repo.refreshCollection(trip);
    const before = durable(f.db);
    const fetcher = vi.fn();
    f.fetch(fetcher);
    f.db.exec(
      "UPDATE trip_canonical_event_collection_generations SET refresh_generation=9007199254740991",
    );
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow("MIRROR_INTEGRITY");
    expect(fetcher).not.toHaveBeenCalled();
    expect(durable(f.db)).toBe(before);
  });
  it("commit failure after all writes rolls back the complete set and certificate", async () => {
    const db = open(),
      database = adapter(db);
    let rejectCommit = false;
    database.withTransactionAsync = async (task) => {
      db.exec("BEGIN");
      try {
        await task();
        if (rejectCommit) throw new Error("commit failure");
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    };
    let observation = raw([read()]);
    const repo = createTripCanonicalEventRepository(
      database,
      async () => account,
      undefined,
      async (context, cursor) => {
        if (observation.snapshot.collectionRevision === "2") rejectCommit = true;
        return page(observation, context.accountId, context.tripId, cursor);
      },
    );
    await repo.refreshCollection(trip);
    const before = durable(db);
    observation = raw([], "2");
    await expect(repo.refreshCollection(trip)).rejects.toThrow("commit failure");
    expect(durable(db)).toBe(before);
  });
  it("interrupted pagination leaves no resumable certificate after cold restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "otr-bt3i-interrupted-")),
      path = join(dir, "cache.sqlite");
    try {
      const f = fixture(open(path));
      await f.repo.applyRead(await f.context(), read().event.id, read());
      let count = 0;
      f.fetch(async (context, cursor) => {
        if (++count > 1) throw new Error("process interruption");
        return page(raw(many(101)), context.accountId, context.tripId, cursor);
      });
      await expect(f.repo.refreshCollection(trip)).rejects.toThrow(
        "process interruption",
      );
      connections.splice(connections.indexOf(f.db), 1);
      f.db.close();
      const db = new DatabaseSync(path);
      connections.push(db);
      const repo = createTripCanonicalEventRepository(adapter(db), async () => account);
      expect(await repo.getCollectionCertificate(trip)).toBeNull();
      expect((await repo.getEvent(trip, read().event.id))?.data).toEqual(read());
      connections.splice(connections.indexOf(db), 1);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("B-T3I explicit authenticated transport", () => {
  it("uses exact route/headers/retained context for every cursor; no fallback", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const f = fixture();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        headers: init?.headers as Record<string, string>,
      });
      const cursor = new URL(String(input)).searchParams.get("cursor");
      return new Response(JSON.stringify(page(raw(many(101)), account, trip, cursor)), {
        status: 200,
      });
    });
    const transport = createTripCanonicalReadTransport(
      f.getUser,
      { baseUrl: "http://local", fetchImplementation: fetcher },
      async () => ({ userId: account, token: "token" }),
    );
    f.fetch(transport.collectionPage);
    await f.repo.refreshCollection(trip);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(`http://local/v2/trips/${trip}/canonical-events/snapshot`);
    expect(calls[1].url).toContain("?cursor=");
    for (const c of calls) {
      expect(c.headers["X-OTR-Canonical-Event-Collection-Version"]).toBe("1");
      expect(c.headers["X-OTR-Canonical-Event-Read-Version"]).toBe("1");
    }
  });
  it("actual wire body limit includes whitespace omitted by JSON parsing", async () => {
    const f = fixture();
    const response =
      JSON.stringify(page(raw([]), account, trip, null)) + " ".repeat(4 * 1024 * 1024);
    const transport = createTripCanonicalReadTransport(
      f.getUser,
      {
        baseUrl: "http://local",
        fetchImplementation: async () => new Response(response),
      },
      async () => ({ userId: account, token: "token" }),
    );
    f.fetch(transport.collectionPage);
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow();
    expect(await f.repo.getCollectionCertificate(trip)).toBeNull();
  });
});

describe("B-T3I P2 durable generation integrity", () => {
  it.each([1.5, "1", 0, 9007199254740992])(
    "rejects refresh storage/bounds %s",
    (value) => {
      const db = open();
      expect(() =>
        db
          .prepare(
            "INSERT INTO trip_canonical_event_collection_generations VALUES(?,?,?)",
          )
          .run(account, trip, value),
      ).toThrow();
    },
  );
  it.each([1.5, "1", 0, 9007199254740992])(
    "rejects applied storage/bounds %s",
    async (value) => {
      const f = fixture();
      await f.repo.refreshCollection(trip);
      expect(() =>
        f.db
          .prepare("UPDATE trip_canonical_event_collections SET applied_generation=?")
          .run(value),
      ).toThrow();
    },
  );
  it("accepts safe integer boundary for both generation columns", async () => {
    const f = fixture();
    await f.repo.refreshCollection(trip);
    f.db
      .prepare(
        "UPDATE trip_canonical_event_collection_generations SET refresh_generation=?",
      )
      .run(BigInt(Number.MAX_SAFE_INTEGER));
    f.db
      .prepare("UPDATE trip_canonical_event_collections SET applied_generation=?")
      .run(BigInt(Number.MAX_SAFE_INTEGER));
    expect((await f.repo.getCollectionCertificate(trip))?.mirrorMatches).toBe(true);
  });
  it.each(["insert", "update"])(
    "DB %s guard rejects ahead or missing scoped watermark",
    async (action) => {
      const f = fixture();
      await f.repo.refreshCollection(trip);
      if (action === "update") {
        expect(() =>
          f.db.exec("UPDATE trip_canonical_event_collections SET applied_generation=2"),
        ).toThrow("MIRROR_INTEGRITY");
        expect(() =>
          f.db
            .prepare("UPDATE trip_canonical_event_collections SET trip_id=?")
            .run(otherTrip),
        ).toThrow("MIRROR_INTEGRITY");
      } else {
        expect(() =>
          f.db.exec(
            "INSERT INTO trip_canonical_event_collections SELECT account_id,trip_id,snapshot_epoch_id,snapshot_revision,contract_version,read_version,temporal_version,fingerprint_version,event_count,fingerprint,complete,2 FROM trip_canonical_event_collections",
          ),
        ).toThrow("MIRROR_INTEGRITY");
        expect(() =>
          f.db
            .prepare(
              "INSERT INTO trip_canonical_event_collections SELECT account_id,?,snapshot_epoch_id,snapshot_revision,contract_version,read_version,temporal_version,fingerprint_version,event_count,fingerprint,complete,1 FROM trip_canonical_event_collections",
            )
            .run(otherTrip),
        ).toThrow("MIRROR_INTEGRITY");
      }
    },
  );
  it.each([
    "rewind",
    "missing",
    "refresh REAL",
    "refresh TEXT",
    "applied REAL",
    "applied TEXT",
    "refresh zero",
    "refresh overflow",
    "applied zero",
    "applied overflow",
  ])(
    "%s corruption rejects certificate, individual apply and refresh without writes/network",
    async (kind) => {
      const f = fixture();
      await f.repo.refreshCollection(trip);
      f.set([read(1, 2)], "2");
      await f.repo.refreshCollection(trip);
      // Deliberate local corruption bypasses constraints/guards, never a production repair path.
      f.db.exec(
        "PRAGMA foreign_keys=OFF; PRAGMA ignore_check_constraints=ON; DROP TRIGGER trip_event_collection_generation_insert; DROP TRIGGER trip_event_collection_generation_update;",
      );
      if (kind === "missing")
        f.db.exec("DELETE FROM trip_canonical_event_collection_generations");
      else {
        const applied = kind.startsWith("applied");
        const value = kind.endsWith("REAL")
          ? 1.5
          : kind.endsWith("TEXT")
            ? "2"
            : kind.endsWith("zero")
              ? 0
              : kind.endsWith("overflow")
                ? 9007199254740992
                : 1;
        f.db
          .prepare(
            applied
              ? "UPDATE trip_canonical_event_collections SET applied_generation=?"
              : "UPDATE trip_canonical_event_collection_generations SET refresh_generation=?",
          )
          .run(value);
      }
      f.db.exec("PRAGMA foreign_keys=ON; PRAGMA ignore_check_constraints=OFF");
      const state = () =>
        JSON.stringify([
          durable(f.db),
          f.db
            .prepare(
              "SELECT *,typeof(refresh_generation) FROM trip_canonical_event_collection_generations",
            )
            .all(),
        ]);
      const before = state();
      const fetcher = vi.fn(async () =>
        page(raw([], "1", "40000000-0000-4000-8000-000000000002"), account, trip, null),
      );
      f.fetch(fetcher);
      await expect(f.repo.getCollectionCertificate(trip)).rejects.toThrow(
        "MIRROR_INTEGRITY",
      );
      await expect(
        f.repo.applyRead(await f.context(), read().event.id, read(1, 3)),
      ).rejects.toThrow("MIRROR_INTEGRITY");
      await expect(
        f.repo.applyRead(await f.context(), read(2).event.id, read(2)),
      ).rejects.toThrow("MIRROR_INTEGRITY");
      await expect(f.repo.refreshCollection(trip)).rejects.toThrow("MIRROR_INTEGRITY");
      expect(fetcher).not.toHaveBeenCalled();
      expect(state()).toBe(before);
    },
  );
  it("corrupt generation without a certificate does not reopen bootstrap", async () => {
    const f = fixture();
    f.db.exec("PRAGMA ignore_check_constraints=ON");
    f.db
      .prepare("INSERT INTO trip_canonical_event_collection_generations VALUES(?,?,?)")
      .run(account, trip, "1");
    f.db.exec("PRAGMA ignore_check_constraints=OFF");
    const fetcher = vi.fn();
    f.fetch(fetcher);
    await expect(f.repo.getCollectionCertificate(trip)).rejects.toThrow(
      "MIRROR_INTEGRITY",
    );
    await expect(
      f.repo.applyRead(await f.context(), read().event.id, read()),
    ).rejects.toThrow("MIRROR_INTEGRITY");
    await expect(f.repo.refreshCollection(trip)).rejects.toThrow("MIRROR_INTEGRITY");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
