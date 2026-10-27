import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { createTripLocalManualReader } from "./tripLocalManualReadRepository";
import { createTripDayFeedReader } from "./tripDayFeedRepository";
import {
  createManualActivityRepository,
  type ManualActivityFields,
} from "./manualActivityRepository";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(),
  resolveRetainedTripPhoto: vi.fn(),
  probeRetainedTripPhotoIdentity: vi.fn(),
  discardRetainedTripPhoto: vi.fn(),
}));
const opened: DatabaseSync[] = [];
afterEach(() => opened.splice(0).forEach((s) => s.close()));
async function fixture(structured = false) {
  const sql = new DatabaseSync(":memory:");
  opened.push(sql);
  sql.exec("PRAGMA foreign_keys=ON");
  for (const m of migrations) sql.exec(m.sql);
  let accountId = randomUUID(),
    failAt = 0,
    inserts = 0,
    aba = false;
  const originalAccount = accountId;
  const database: CoreDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(q: string, ...args: unknown[]) {
      const result = sql.prepare(q).get(...(args as never[])) ?? null;
      if (aba && q.includes("FROM local_trip_containers")) {
        aba = false;
        advanceAccountGeneration();
        advanceAccountGeneration();
      }
      return result as T | null;
    },
    async getAllAsync<T>(q: string, ...args: unknown[]) {
      return sql.prepare(q).all(...(args as never[])) as T[];
    },
    async runAsync(q: string, ...args: unknown[]) {
      if (q.startsWith("INSERT INTO trip_core_pending_intents") && ++inserts === failAt)
        throw new Error("TEST_WRITE_FAILURE");
      return sql.prepare(q).run(...(args as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  });
  const identity = async () => accountId;
  const clock = () => "2026-10-20T00:00:00.000Z";
  const core = createTripCoreV2Repository(
    database,
    identity,
    async (b) => createHash("sha256").update(b).digest("hex"),
    clock,
  );
  const trips = createTripRepository(database, identity, core, clock);
  const tripId = randomUUID();
  await trips.createTrip({
    tripId,
    operationId: randomUUID(),
    name: "Winter trip",
    ...(structured ? { syncFormatVersion: 2 as const, destinations: [] } : {}),
    destination: null,
    startDate: "2026-12-30",
    endDate: "2027-04-28",
  });
  const repo = () => createManualActivityRepository(database, identity, core, clock);
  const read = createTripLocalManualReader(database, identity, core);
  const days = createTripDayFeedReader({
    account: identity,
    localManual: read,
    projection: async () => null,
    candidates: async () => [],
    services: async () => ({}),
  });
  return {
    sql,
    coreDatabase: database,
    identity,
    core,
    trips,
    tripId,
    repo,
    read,
    days,
    originalAccount,
    failNext(n: number) {
      inserts = 0;
      failAt = n;
    },
    switchAccount() {
      accountId = randomUUID();
      advanceAccountGeneration();
    },
    aba() {
      aba = true;
    },
  };
}

const values = (fields: ManualActivityFields): ManualActivityFields => ({
  ...fields,
  title: "Museum",
  startDate: "2026-12-30",
});
it("P6 Save stays closed at the existing Manual Batch owning Gate without journaling", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  await expect(repo.save(draft, values(draft.fields))).rejects.toThrow(
    "MANUAL_BATCH_INVALID",
  );
  expect(f.sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n).toBe(
    0,
  );
});
it("no Draft write and account switch cannot Save a stale activity", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  expect(f.sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n).toBe(
    0,
  );
  f.switchAccount();
  await expect(repo.save(draft, values(draft.fields))).rejects.toThrow();
});
