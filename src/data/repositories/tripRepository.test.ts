import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createSyncOperationRepository } from "../sync/syncOperationRepository";
import { createTripRepository } from "./tripRepository";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
const connections: DatabaseSync[] = [],
  folders: string[] = [];
afterEach(() => {
  for (const sql of connections.splice(0)) {
    try {
      sql.close();
    } catch {}
  }
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});
const accountA = randomUUID(),
  accountB = randomUUID(),
  stamp = "2026-10-13T05:30:00Z";
function local(path = ":memory:", initialize = true) {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  if (initialize) for (const migration of migrations) sql.exec(migration.sql);
  let account: string = accountA,
    failQueue = false,
    abaRead = false,
    abaWrite = false,
    abaAccept = false;
  const database: CoreDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      const row = sql.prepare(query).get(...(args as never[])) ?? null;
      if (abaRead && query.includes("FROM local_trip_containers")) {
        abaRead = false;
        account = accountB;
        advanceAccountGeneration();
        account = accountA;
        advanceAccountGeneration();
      }
      return row as T | null;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      return sql.prepare(query).all(...(args as never[])) as T[];
    },
    async runAsync(query: string, ...args: unknown[]) {
      if (failQueue && query.startsWith("INSERT INTO sync_operations")) {
        failQueue = false;
        throw new Error("QUEUE_WRITE_FAILED");
      }
      const result = sql.prepare(query).run(...(args as never[]));
      if (abaWrite && query.startsWith("INSERT INTO local_trip_containers")) {
        abaWrite = false;
        account = accountB;
        advanceAccountGeneration();
        account = accountA;
        advanceAccountGeneration();
      }
      if (abaAccept && query.startsWith("UPDATE local_trip_containers")) {
        abaAccept = false;
        account = accountB;
        advanceAccountGeneration();
        account = accountA;
        advanceAccountGeneration();
      }
      return result as never;
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
  const core = createTripCoreV2Repository(database, identity, async (bytes) =>
    createHash("sha256").update(bytes).digest("hex"),
  );
  return {
    sql,
    core,
    queue: createSyncOperationRepository(database, identity),
    repo: createTripRepository(database, identity, core, () => stamp),
    switchTo(id: string) {
      account = id;
      advanceAccountGeneration();
    },
    failNextQueue() {
      failQueue = true;
    },
    abaNextRead() {
      abaRead = true;
    },
    abaNextWrite() {
      abaWrite = true;
    },
    abaNextAccept() {
      abaAccept = true;
    },
  };
}
const input = () => ({
  operationId: randomUUID(),
  tripId: randomUUID(),
  name: "  Local trip  ",
  destination: "Nelson",
  startDate: "2027-01-15",
  endDate: "2027-01-18",
});
it("local Trip→save→open→P1/P3 pending→real file close/reopen preserves UUIDs without inventing admission or finances", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-trip-local-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const create = input(),
    saved = await f.repo.createTrip(create);
  expect(saved).toMatchObject({
    id: create.tripId,
    name: "Local trip",
    syncStatus: "PENDING_CREATE",
    serverId: null,
    ownerPersonId: null,
    baseCurrency: null,
  });
  expect((await f.repo.listTrips()).map((t) => t.id)).toEqual([saved.id]);
  expect(await f.repo.getTrip(saved.id)).toEqual(saved);
  const activity = {
    operationId: randomUUID(),
    itemId: randomUUID(),
    family: "P1" as const,
    title: "Ridge walk",
    startDate: "2027-01-16",
  };
  const stay = {
    operationId: randomUUID(),
    itemId: randomUUID(),
    family: "P3" as const,
    title: "Lodge",
    startDate: "2027-01-15",
    endDate: "2027-01-18",
  };
  await f.repo.addItem(saved.id, activity);
  await f.repo.addItem(saved.id, stay);
  const pending = await f.repo.pendingItems(saved.id);
  expect(pending).toHaveLength(2);
  expect(pending.every((p) => p.state === "BLOCKED")).toBe(true);
  expect(pending.map((p) => p.command.target.id).sort()).toEqual(
    [activity.itemId, stay.itemId].sort(),
  );
  for (const p of pending) {
    expect(p.payload.schedule.start).toMatchObject({
      quality: "UNKNOWN",
      instant: null,
      local_time: null,
      zone_id: null,
    });
    expect(p.payload.participation.selfPersonId).toBeNull();
  }
  expect(await f.core.acceptedSnapshot(await f.core.captureContext(saved.id))).toBeNull();
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_core_itinerary_events").get()?.n,
  ).toBe(0);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_core_read_certificates").get()?.n,
  ).toBe(0);
  const queue = f.sql
    .prepare(
      "SELECT operation_type,status,attempt_count FROM sync_operations ORDER BY id",
    )
    .all();
  expect(queue).toHaveLength(3);
  expect(await f.queue.listPending()).toEqual([]);
  expect(
    queue.every((q) => q.status === "DEPENDENCY_BLOCKED" && q.attempt_count === 0),
  ).toBe(true);
  f.sql.close();
  f = local(path, false);
  expect(await f.repo.getTrip(saved.id)).toEqual(saved);
  expect(await f.repo.pendingItems(saved.id)).toEqual(pending);
  expect(
    f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE status IN ('PENDING','RETRYABLE')",
      )
      .get()?.n,
  ).toBe(0);
});
it("duplicate Trip request replays exactly; changed payload, duplicate Trip key and queue failure cannot leave partial records", async () => {
  const f = local(),
    create = input();
  const first = await f.repo.createTrip(create);
  expect(await f.repo.createTrip(create)).toEqual(first);
  await expect(f.repo.createTrip({ ...create, name: "Different" })).rejects.toThrow(
    "TRIP_OPERATION_REUSE_MISMATCH",
  );
  await expect(
    f.repo.createTrip({ ...create, operationId: randomUUID() }),
  ).rejects.toThrow();
  expect(await f.repo.listTrips()).toHaveLength(1);
  expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()?.n).toBe(1);
  const failed = input();
  f.failNextQueue();
  await expect(f.repo.createTrip(failed)).rejects.toThrow("QUEUE_WRITE_FAILED");
  expect(await f.repo.getTrip(failed.tripId)).toBeNull();
  expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()?.n).toBe(1);
});
it("Account isolation and same-ID ABA block stale local Trip reads and item enqueue", async () => {
  const f = local(),
    saved = await f.repo.createTrip(input());
  f.switchTo(accountB);
  expect(await f.repo.listTrips()).toEqual([]);
  expect(await f.repo.getTrip(saved.id)).toBeNull();
  await expect(
    f.repo.addItem(saved.id, {
      operationId: randomUUID(),
      itemId: randomUUID(),
      family: "P1",
      title: "Not owned",
      startDate: "2027-01-16",
    }),
  ).rejects.toThrow("TRIP_LOCAL_RECORD_MISSING");
  f.switchTo(accountA);
  f.abaNextRead();
  await expect(f.repo.getTrip(saved.id)).rejects.toThrow("Account changed");
  f.abaNextRead();
  await expect(
    f.repo.addItem(saved.id, {
      operationId: randomUUID(),
      itemId: randomUUID(),
      family: "P1",
      title: "Late",
      startDate: "2027-01-16",
    }),
  ).rejects.toThrow("Account changed");
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_core_pending_intents").get()?.n,
  ).toBe(0);
});
it("calendar validation preserves nullable Trip dates and rejects invalid/reversed pending Item dates", async () => {
  const f = local();
  await expect(
    f.repo.createTrip({ ...input(), startDate: "2027-02-30" }),
  ).rejects.toThrow("DAY_DATE_INVALID");
  await expect(
    f.repo.createTrip({ ...input(), startDate: "2027-01-18", endDate: "2027-01-15" }),
  ).rejects.toThrow("TRIP_DATE_RANGE_INVALID");
  const saved = await f.repo.createTrip({ ...input(), startDate: null, endDate: null });
  expect(saved).toMatchObject({ startDate: null, endDate: null, baseCurrency: null });
  await expect(
    f.repo.addItem(saved.id, {
      operationId: randomUUID(),
      itemId: randomUUID(),
      family: "P3",
      title: "Bad stay",
      startDate: "2027-01-18",
      endDate: "2027-01-15",
    }),
  ).rejects.toThrow("STAY_DATE_RANGE_INVALID");
  await expect(
    f.repo.addItem(saved.id, {
      operationId: randomUUID(),
      itemId: randomUUID(),
      family: "P3",
      title: "Missing checkout",
      startDate: "2027-01-18",
    }),
  ).rejects.toThrow("STAY_DATE_RANGE_INVALID");
  await f.repo.addItem(saved.id, {
    operationId: randomUUID(),
    itemId: randomUUID(),
    family: "P3",
    title: "Zero night",
    startDate: "2027-01-18",
    endDate: "2027-01-18",
  });
  expect((await f.repo.pendingItems(saved.id))[0].payload.schedule.end?.local_date).toBe(
    "2027-01-18",
  );
});

it("an Account ABA during Trip transaction rolls back local metadata and the durable queue together", async () => {
  const f = local(),
    create = input();
  f.abaNextWrite();
  await expect(f.repo.createTrip(create)).rejects.toThrow("Account changed");
  expect(await f.repo.getTrip(create.tripId)).toBeNull();
  expect(await f.repo.listTrips()).toEqual([]);
  expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()?.n).toBe(0);
});

it("applies an owning receipt and queue completion atomically, including exact replay after reopen", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-trip-accept-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const create = input();
  await f.repo.createTrip(create);
  const result = {
    operationId: create.operationId,
    tripId: create.tripId,
    actorAccountId: accountA,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
    name: "Local trip",
    destination: create.destination,
    startDate: create.startDate,
    endDate: create.endDate,
  };
  f.abaNextAccept();
  await expect(f.repo.acceptCreate(result)).rejects.toThrow("Account changed");
  expect((await f.repo.getTrip(create.tripId))?.syncStatus).toBe("PENDING_CREATE");
  expect(
    f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(create.operationId)
      ?.status,
  ).toBe("DEPENDENCY_BLOCKED");
  await expect(
    f.repo.acceptCreate({ ...result, actorAccountId: accountB }),
  ).rejects.toThrow("TRIP_CREATE_ACCOUNT_MISMATCH");
  await expect(f.repo.acceptCreate({ ...result, name: "Changed" })).rejects.toThrow(
    "TRIP_CREATE_RECEIPT_MISMATCH",
  );
  const accepted = await f.repo.acceptCreate(result);
  expect(accepted).toMatchObject({
    serverId: create.tripId,
    syncStatus: "SYNCED",
    ownerPersonId: result.ownerPersonId,
    baseCurrency: null,
  });
  expect(
    f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(create.operationId)
      ?.status,
  ).toBe("COMPLETED");
  expect(await f.repo.acceptCreate(result)).toEqual(accepted);
  f.sql.close();
  f = local(path, false);
  expect(await f.repo.getTrip(create.tripId)).toEqual(accepted);
});
