import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripDayFeedReader } from "./tripDayFeedRepository";
import { createTripTodaysJourneyReader } from "./tripTodaysJourneyRepository";
import { createTripRepository } from "./tripRepository";
import { createTripLocalManualReader } from "./tripLocalManualReadRepository";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
const connections: DatabaseSync[] = [];
afterEach(() => connections.splice(0).forEach((sql) => sql.close()));
async function fixture() {
  const sql = new DatabaseSync(":memory:");
  connections.push(sql);
  for (const migration of migrations) sql.exec(migration.sql);
  let account = randomUUID(),
    aba = false,
    badHash = false;
  const database: CoreDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      const result = sql.prepare(query).get(...(args as never[])) ?? null;
      if (aba && query.includes("FROM local_trip_containers")) {
        aba = false;
        advanceAccountGeneration();
        advanceAccountGeneration();
      }
      return result as T | null;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      return sql.prepare(query).all(...(args as never[])) as T[];
    },
    async runAsync(query: string, ...args: unknown[]) {
      return sql.prepare(query).run(...(args as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  });
  const identity = async () => account;
  const core = createTripCoreV2Repository(database, identity, async (b) =>
    badHash ? "0".repeat(64) : createHash("sha256").update(b).digest("hex"),
  );
  const trips = createTripRepository(database, identity, core);
  const tripId = randomUUID(),
    itemId = randomUUID(),
    operationId = randomUUID();
  await trips.createTrip({
    operationId: randomUUID(),
    tripId,
    name: "Local Trip",
    destination: null,
    startDate: "2026-10-16",
    endDate: "2026-10-18",
  });
  await trips.addItem(tripId, {
    operationId,
    itemId,
    family: "P3",
    title: "Manual hotel",
    startDate: "2026-10-16",
    endDate: "2026-10-18",
  });
  const manual = createTripLocalManualReader(database, identity, core);
  const days = createTripDayFeedReader({
    account: identity,
    projection: async () => null,
    localManual: manual,
    candidates: async () => [],
    services: async () => ({}),
  });
  const today = createTripTodaysJourneyReader(
    days,
    { resolveItem: vi.fn(async () => null) },
    identity,
  );
  return {
    today,
    sql,
    tripId,
    itemId,
    operationId,
    read: createTripLocalManualReader(database, identity, core),
    corruptHash() {
      badHash = true;
    },
    switchAccount() {
      account = randomUUID();
      advanceAccountGeneration();
    },
    aba() {
      aba = true;
    },
    trips,
  };
}
it("committed date-only hotel reads Day and Tonight with explicit clock; no certificate, network, or write", async () => {
  const f = await fixture();
  const before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const local = (await f.read(f.tripId))!;
  expect(local.source.kind).toBe("LOCAL_MANUAL_COMMITTED");
  expect(local.items[0]).toMatchObject({ itemId: f.itemId, localState: "PENDING" });
  expect(local.rows("2026-10-16")).toEqual([
    expect.objectContaining({
      itemRef: f.itemId,
      localState: "PENDING",
      certificateGeneration: 0,
    }),
  ]);
  expect(local.rows("2026-10-17")[0].itemRef).toBe(f.itemId);
  expect(local.today({ now: "2026-10-16T01:00:00Z", zone: null })).toBeNull();
  expect(local.today({ now: "2026-10-16T01:00:00Z", zone: "Invalid/Zone" })).toBeNull();
  expect(
    local.today({ now: "2026-10-16T01:00:00Z", zone: "Pacific/Auckland" })?.tonight
      ?.itemRef,
  ).toBe(f.itemId);
  expect(
    local.today({ now: "2026-10-19T01:00:00Z", zone: "Pacific/Auckland" }),
  ).toMatchObject({ primaryKind: "FREE", tonight: null });
  expect(f.sql.prepare("SELECT * FROM trip_core_read_certificates").all()).toEqual([]);
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
  );
});
it("reread refresh changes fingerprint after normal manual save", async () => {
  const f = await fixture();
  const first = (await f.read(f.tripId))!;
  await f.trips.addItem(f.tripId, {
    operationId: randomUUID(),
    itemId: randomUUID(),
    family: "P1",
    title: "Walk",
    startDate: "2026-10-16",
  });
  const second = (await f.read(f.tripId))!;
  expect(second.source.fingerprint).not.toBe(first.source.fingerprint);
  expect(second.rows("2026-10-16")).toHaveLength(2);
});
it.each(["CONFLICT", "REVIEW"])(
  "%s intent is not formal local Day authority",
  async (state) => {
    const f = await fixture();
    f.sql.prepare("UPDATE trip_core_pending_intents SET state=?").run(state);
    expect((await f.read(f.tripId))?.rows("2026-10-16")).toEqual([]);
  },
);
it("missing owning queue and changed bytes fail closed", async () => {
  for (const mutation of [
    "UPDATE sync_operations SET payload_json='{}' WHERE operation_type='CORE_V2_COMMAND'",
    "DELETE FROM sync_operations WHERE operation_type='CORE_V2_COMMAND'",
  ]) {
    const f = await fixture();
    f.sql.exec(mutation);
    await expect(f.read(f.tripId)).rejects.toThrow("LOCAL_MANUAL_COMMIT_PIN");
  }
});
it("different account and account ABA cannot publish local creator reads", async () => {
  const f = await fixture();
  f.aba();
  await expect(f.read(f.tripId)).rejects.toThrow();
  f.switchAccount();
  expect(await f.read(f.tripId)).toBeNull();
});

it("intent digest mismatch fails closed independently of immutable storage", async () => {
  const f = await fixture();
  f.corruptHash();
  await expect(f.read(f.tripId)).rejects.toThrow("LOCAL_MANUAL_COMMIT_PIN");
});
it("captured row/today closures reject account generation changes", async () => {
  const f = await fixture();
  const local = (await f.read(f.tripId))!;
  f.switchAccount();
  expect(() => local.rows("2026-10-16")).toThrow();
  expect(() =>
    local.today({ now: "2026-10-16T01:00:00Z", zone: "Pacific/Auckland" }),
  ).toThrow();
});

it("normal Day/Today consumer resolves local Item without accepted admission and rejects stale taps", async () => {
  const f = await fixture();
  const clock = { now: "2026-10-16T01:00:00Z", zone: "Pacific/Auckland" };
  expect(await f.today.read(f.tripId, clock)).toBeNull();
  expect(await f.today.readLocal(f.tripId, { ...clock, zone: null })).toBeNull();
  const read = (await f.today.readLocal(f.tripId, clock))!;
  expect(read.today.tonight?.itemRef).toBe(f.itemId);
  expect((await f.today.resolveLocalItem(f.tripId, f.itemId, read))?.item).toMatchObject({
    itemId: f.itemId,
    localState: "PENDING",
  });
  await f.trips.addItem(f.tripId, {
    operationId: randomUUID(),
    itemId: randomUUID(),
    family: "P1",
    title: "New walk",
    startDate: "2026-10-16",
  });
  expect(await f.today.resolveLocalItem(f.tripId, f.itemId, read)).toBeNull();
});
