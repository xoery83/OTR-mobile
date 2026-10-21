import { resolveRetainedTripPhoto } from "../files/tripPhotoFileStore";
import { tripCoverAssetIds, tripPhotoCoverRef } from "@/domain/trip/tripCoverAssets";
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
import {
  createTripCreateSyncCoordinator,
  createTripCreateSyncWorker,
} from "../sync/tripCreateSyncWorker";
import {
  createCoreV2SyncCoordinator,
  createCoreV2SyncWorker,
} from "../sync/tripCoreV2SyncWorker";
import { coreClosedCapabilities } from "@/domain/trip/tripCoreV2Commands";
import type { TripCreateTransport } from "../sync/tripCreateTransport";
import type { CoreSyncTransport } from "../sync/tripCoreV2SyncWorker";
import { createTripRepository } from "./tripRepository";
import { createLedgerExpenseRepository } from "./ledgerExpenseRepository";
import { createLedgerReportingRepository } from "./ledgerReportingRepository";
import { createLedgerReadRepository } from "./ledgerReadRepository";
import { createLedgerExpenseSyncWorker } from "../sync/ledgerExpenseSyncWorker";
import { createSyncEngine } from "../sync/syncEngine";
import { captureAccountScope } from "../auth/accountRequestContext";
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(),
  resolveRetainedTripPhoto: vi.fn(),
  discardRetainedTripPhoto: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
const connections: DatabaseSync[] = [],
  folders: string[] = [];
afterEach(() => {
  vi.useRealTimers();
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
function local(path = ":memory:", initialize = true, clock?: () => string) {
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
  const core = createTripCoreV2Repository(
    database,
    identity,
    async (bytes) => createHash("sha256").update(bytes).digest("hex"),
    clock,
  );
  return {
    sql,
    database,
    core,
    queue: createSyncOperationRepository(database, identity),
    repo: createTripRepository(database, identity, core, clock ?? (() => stamp)),
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
it("keeps a built-in cover choice on disk and fences reads and writes to its account", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-trip-cover-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const saved = await f.repo.createTrip(input());
  await f.repo.selectBuiltInCover(saved.id, "cultural-oldtown");
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("cultural-oldtown");
  expect((await f.repo.listTrips())[0]?.selectedCoverAssetId).toBe("cultural-oldtown");
  await expect(
    f.repo.selectBuiltInCover(saved.id, "unknown" as "cultural-oldtown"),
  ).rejects.toThrow("TRIP_COVER_INVALID");
  f.sql.close();
  f = local(path, false);
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("cultural-oldtown");
  f.switchTo(accountB);
  expect(await f.repo.getTrip(saved.id)).toBeNull();
  await expect(f.repo.selectBuiltInCover(saved.id, "coast")).rejects.toThrow(
    "TRIP_LOCAL_RECORD_MISSING",
  );
  f.switchTo(accountA);
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("cultural-oldtown");
  f.abaNextAccept();
  await expect(f.repo.selectBuiltInCover(saved.id, "mountain")).rejects.toThrow(
    "Account changed",
  );
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("cultural-oldtown");
  await f.repo.selectBuiltInCover(saved.id, null);
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBeNull();
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
it("wakes an exact pending Trip receipt into Core eligibility while CLOSED Core capability blocks dispatch", async () => {
  const f = local();
  const create = input();
  await f.repo.createTrip(create);
  for (const family of ["P1", "P3"] as const)
    await f.repo.addItem(create.tripId, {
      operationId: randomUUID(),
      itemId: randomUUID(),
      family,
      title: family === "P1" ? "Ridge walk" : "Lodge",
      startDate: "2027-01-16",
      ...(family === "P3" ? { endDate: "2027-01-18" } : {}),
    });
  const original = await f.repo.pendingItems(create.tripId);
  expect(original).toHaveLength(2);
  expect(await f.queue.listPending()).toEqual([]);
  const receipt = {
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
  const createTransport = {
    receipt: vi.fn(async () => receipt),
    create: vi.fn(),
  } as unknown as TripCreateTransport;
  const createCoordinator = createTripCreateSyncCoordinator(
    f.queue,
    createTripCreateSyncWorker(f.repo, createTransport, async () => accountA),
    f.repo,
    () => true,
  );
  expect((await createCoordinator.run("AUTHENTICATED_ONLINE")).processedCount).toBe(1);
  expect(createTransport.create).not.toHaveBeenCalled();
  expect((await f.repo.getTrip(create.tripId))?.ownerPersonId).toBe(
    receipt.ownerPersonId,
  );
  expect((await f.repo.getTrip(create.tripId))?.syncStatus).toBe("SYNCED");
  expect((await f.queue.listPending()).length).toBe(0);
  expect(
    f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(create.operationId)
      ?.status,
  ).toBe("COMPLETED");
  const coreTransport = {
    capabilities: vi.fn(async () => coreClosedCapabilities),
    receipt: vi.fn(async () => null),
    submit: vi.fn(),
  } as unknown as CoreSyncTransport;
  const coreCoordinator = createCoreV2SyncCoordinator(
    f.queue,
    createCoreV2SyncWorker(
      f.core,
      coreTransport,
      async () => accountA,
      async (bytes) => createHash("sha256").update(bytes).digest("hex"),
    ),
    f.core,
    create.tripId,
  );
  expect((await coreCoordinator.run("AUTHENTICATED_ONLINE")).processedCount).toBe(2);
  expect(coreTransport.capabilities).toHaveBeenCalledTimes(2);
  expect(coreTransport.submit).not.toHaveBeenCalled();
  const after = await f.repo.pendingItems(create.tripId);
  expect(after.map((item) => item.command.operationId)).toEqual(
    original.map((item) => item.command.operationId),
  );
  expect(after.map((item) => item.state)).toEqual(["BLOCKED", "BLOCKED"]);
  expect(
    f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='CORE_V2_COMMAND' AND status='DEPENDENCY_BLOCKED'",
      )
      .get()?.n,
  ).toBe(2);
  expect(
    await f.core.acceptedSnapshot(await f.core.captureContext(create.tripId)),
  ).toBeNull();
});

it("Reference Trip v1 uses normal repositories and survives SQLite reopen/replay with only blocked pending work", async () => {
  const { referenceTripV1: fixture, seedReferenceTripV1 } =
    await import("./__fixtures__/referenceTripV1");
  const folder = mkdtempSync(join(tmpdir(), "otr-reference-trip-v1-"));
  folders.push(folder);
  const path = join(folder, "owned-reference-trip.db");
  let activeAccount = accountA;
  const identity = async () => activeAccount;
  const clock = () => fixture.createdAt;
  function referenceRepository(f: ReturnType<typeof local>) {
    // Reuse the existing migrated file/cleanup fixture; only the owning clocks differ.
    const database: CoreDatabase = serializeDatabaseTransactions({
      async getFirstAsync<T>(query: string, ...args: unknown[]) {
        return (f.sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
      },
      async getAllAsync<T>(query: string, ...args: unknown[]) {
        return f.sql.prepare(query).all(...(args as never[])) as T[];
      },
      async runAsync(query: string, ...args: unknown[]) {
        return f.sql.prepare(query).run(...(args as never[])) as never;
      },
      async withTransactionAsync(work: () => Promise<void>) {
        f.sql.exec("BEGIN");
        try {
          await work();
          f.sql.exec("COMMIT");
        } catch (error) {
          f.sql.exec("ROLLBACK");
          throw error;
        }
      },
    });
    const core = createTripCoreV2Repository(
      database,
      identity,
      async (bytes) => createHash("sha256").update(bytes).digest("hex"),
      clock,
    );
    return {
      core,
      repo: createTripRepository(database, identity, core, clock),
      queue: createSyncOperationRepository(database, identity, clock),
    };
  }
  let f = local(path),
    r = referenceRepository(f);
  const saved = await seedReferenceTripV1(r.repo);
  expect(saved).toMatchObject({
    id: fixture.trip.tripId,
    createdAt: fixture.createdAt,
    syncStatus: "PENDING_CREATE",
    serverId: null,
    ownerPersonId: null,
    baseCurrency: null,
  });
  const pending = await r.repo.pendingItems(saved.id);
  expect(pending).toHaveLength(5);
  expect(pending.map((entry) => entry.command.target.id).sort()).toEqual(
    fixture.items.map((item) => item.itemId).sort(),
  );
  expect(pending.every((entry) => entry.created_at === fixture.createdAt)).toBe(true);
  expect(pending.every((entry) => entry.state === "BLOCKED")).toBe(true);
  expect(
    pending.every(
      (entry) =>
        entry.payload.schedule.start.instant === null &&
        entry.payload.schedule.start.local_time === null &&
        entry.payload.participation.selfPersonId === null,
    ),
  ).toBe(true);
  expect(await seedReferenceTripV1(r.repo)).toEqual(saved);
  expect(await r.repo.pendingItems(saved.id)).toEqual(pending);
  f.sql.close();
  f = local(path, false);
  r = referenceRepository(f);
  expect(await r.repo.listTrips()).toEqual([saved]);
  expect(await r.repo.getTrip(saved.id)).toEqual(saved);
  expect(await r.repo.pendingItems(saved.id)).toEqual(pending);
  expect(await seedReferenceTripV1(r.repo)).toEqual(saved);
  await expect(
    r.repo.addItem(saved.id, { ...fixture.items[0], title: "Different intent" }),
  ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
  const queue = f.sql
    .prepare("SELECT operation_type,status,attempt_count,created_at FROM sync_operations")
    .all();
  expect(queue).toHaveLength(6);
  expect(queue.filter((row) => row.operation_type === "CREATE_TRIP")).toHaveLength(1);
  expect(queue.filter((row) => row.operation_type === "CORE_V2_COMMAND")).toHaveLength(5);
  expect(
    queue.every(
      (row) =>
        row.status === "DEPENDENCY_BLOCKED" &&
        row.attempt_count === 0 &&
        row.created_at === fixture.createdAt,
    ),
  ).toBe(true);
  expect(await r.queue.listPending()).toEqual([]);
  expect(await r.core.acceptedSnapshot(await r.core.captureContext(saved.id))).toBeNull();
  for (const table of [
    "trip_core_itinerary_events",
    "trip_core_read_certificates",
    "trip_core_person_bindings",
  ])
    expect(f.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
  activeAccount = accountB;
  advanceAccountGeneration();
  expect(await r.repo.listTrips()).toEqual([]);
  expect(await r.repo.getTrip(saved.id)).toBeNull();
  await expect(r.repo.pendingItems(saved.id)).rejects.toThrow(
    "TRIP_LOCAL_RECORD_MISSING",
  );
  activeAccount = accountA;
  advanceAccountGeneration();
  expect(await r.repo.pendingItems(saved.id)).toEqual(pending);
});

it("Reference-local Backend receipts and collection admit five P1/P3 through normal Day read after cold reopen, without Trip acceptance", async () => {
  const {
    referenceTripV1: scenario,
    seedReferenceTripV1,
    createReferenceTripV1LocalProducer,
  } = await import("./__fixtures__/referenceTripV1");
  const { createCoreP1P3DayFeedReader } =
    await import("./tripCoreV2P1P3DayFeedRepository");
  const { createTripDayFeedReader } = await import("./tripDayFeedRepository");
  const { composeDayStream } = await import("@/features/day-feed/composition");
  const folder = mkdtempSync(join(tmpdir(), "otr-reference-local-accepted-"));
  folders.push(folder);
  const path = join(folder, "owned-reference.db");
  let f = local(path, true, () => scenario.createdAt);
  const saved = await seedReferenceTripV1(f.repo);
  expect(saved.createdAt).toBe(scenario.createdAt);
  const intents = await f.repo.pendingItems(saved.id);
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const producer = await createReferenceTripV1LocalProducer(accountA, hash);
  expect(producer.evidenceLevel).toBe("REFERENCE_LOCAL_SYNTHETIC");
  const context = await f.core.captureContext(saved.id);
  const receipts = [];
  for (const intent of intents) {
    const result = await producer.execute(intent.command);
    expect(result.receipt.outcome).toBe("APPLIED");
    await f.core.applyReceipt(context, result.receipt);
    expect(await producer.execute(intent.command)).toEqual(result);
    receipts.push(result.receipt.receiptSha256);
  }
  expect(new Set(receipts).size).toBe(5);
  const bundle = await producer.collection();
  expect(await producer.collection()).toEqual(bundle);
  await f.core.install(
    await f.core.beginRefresh(context, 1),
    bundle.manifest,
    bundle.pages,
  );
  let readerAccount = accountA;
  const normalReader = () =>
    createTripDayFeedReader({
      account: async () => readerAccount,
      candidates: async () => [],
      projection: async () => null,
      services: async () => ({}),
      coreProjection: createCoreP1P3DayFeedReader(f.core),
    });
  let observed = (await normalReader().trip(saved.id)).observed;
  expect(observed?.projection.version).toBe(2);
  expect(observed?.projection.events.map((event) => event.id).sort()).toEqual(
    scenario.items.map((item) => item.itemId).sort(),
  );
  expect(
    observed?.projection.events.every((event) =>
      event.boundaries.every(
        (boundary) => boundary.instant === null && boundary.local_time === null,
      ),
    ),
  ).toBe(true);
  if (observed?.projection.version !== 2) throw new Error("REFERENCE_NORMAL_DAY_MISSING");
  expect(
    observed.projection
      .query("2027-02-02", "Asia/Tokyo")
      .nonComparable.some((row) => row.event.id === scenario.items[0].itemId),
  ).toBe(true);
  const acceptedQuery = observed.projection.query("2027-02-02", "Asia/Tokyo");
  expect(
    composeDayStream(acceptedQuery, scenario.qaViewClock.instant, {
      focus: scenario.items[0].itemId,
    }).focus,
  ).toBe(scenario.items[0].itemId);
  expect(
    composeDayStream(acceptedQuery, scenario.qaViewClock.instant, {
      immersive: scenario.items[0].itemId,
    }).immersive,
  ).toBe(scenario.items[0].itemId);
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    syncStatus: "PENDING_CREATE",
    serverId: null,
    ownerPersonId: null,
  });
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(scenario.trip.operationId)?.status,
  ).toBe("DEPENDENCY_BLOCKED");
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_core_read_certificates").get()?.n,
  ).toBe(1);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM ledger_members WHERE status='local'").get()
      ?.n,
  ).toBe(1);
  f.sql.close();
  f = local(path, false, () => scenario.createdAt);
  observed = (await normalReader().trip(saved.id)).observed;
  expect(observed?.projection.events).toHaveLength(5);
  expect(
    await f.core.acceptedSnapshot(await f.core.captureContext(saved.id)),
  ).not.toBeNull();
  expect((await f.repo.getTrip(saved.id))?.syncStatus).toBe("PENDING_CREATE");
  for (const intent of intents) {
    const replay = await producer.execute(intent.command);
    await f.core.applyReceipt(await f.core.captureContext(saved.id), replay.receipt);
  }
  const oldContext = await f.core.captureContext(saved.id);
  f.switchTo(accountB);
  readerAccount = accountB;
  expect(await f.repo.getTrip(saved.id)).toBeNull();
  expect(await f.core.acceptedSnapshot(await f.core.captureContext(saved.id))).toBeNull();
  expect((await normalReader().trip(saved.id)).observed).toBeNull();
  await expect(f.core.acceptedSnapshot(oldContext)).rejects.toThrow("Account changed");
  const other = local(":memory:", true, () => scenario.createdAt);
  const otherContext = await other.core.captureContext(saved.id);
  const corrupt = structuredClone(bundle.pages);
  corrupt[0].pageSha256 = "0".repeat(64);
  await expect(
    other.core.install(
      await other.core.beginRefresh(otherContext, 1),
      bundle.manifest,
      corrupt,
    ),
  ).rejects.toThrow();
  expect(
    await other.core.acceptedSnapshot(await other.core.captureContext(saved.id)),
  ).toBeNull();
  await expect(
    producer.execute({ ...intents[0].command, tripId: randomUUID() }),
  ).rejects.toThrow("REFERENCE_LOCAL_FINITE_COMMAND");
  await expect(
    producer.execute({
      ...intents[0].command,
      payload: {
        ...(intents[0].command.payload as Record<string, unknown>),
        core: { title: "Changed replay" },
      },
    }),
  ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
});

it("Reference full sixteen normal commands/receipts and owning cold collection preserve sparse/TNS/overnight facts without Trip or Ticket authority", async () => {
  const {
    referenceTripV1Full: scenario,
    seedReferenceTripV1Full,
    createReferenceTripV1LocalProducer,
  } = await import("./__fixtures__/referenceTripV1");
  const { createCoreP6DayFeedReader } = await import("./tripCoreV2P6DayFeedRepository");
  const folder = mkdtempSync(join(tmpdir(), "otr-reference-full16-"));
  folders.push(folder);
  const path = join(folder, "owned-reference.db");
  let f = local(path, true, () => scenario.createdAt);
  const saved = await seedReferenceTripV1Full(f.repo, f.core);
  const context = await f.core.captureContext(saved.id);
  const intents = await f.core.pending(context);
  expect(intents).toHaveLength(16);
  expect(await seedReferenceTripV1Full(f.repo, f.core)).toEqual(saved);
  expect(await f.core.pending(context)).toEqual(intents);
  expect(intents.every((row) => row.created_at === scenario.createdAt)).toBe(true);
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const producer = await createReferenceTripV1LocalProducer(accountA, hash, true);
  const receipts = [];
  for (const intent of intents) {
    const result = await producer.execute(intent.command);
    expect(result.receipt.outcome).toBe("APPLIED");
    await f.core.applyReceipt(context, result.receipt);
    expect(await producer.execute(intent.command)).toEqual(result);
    receipts.push(result.receipt.receiptSha256);
  }
  expect(new Set(receipts).size).toBe(16);
  const bundle = await producer.collection();
  await f.core.install(
    await f.core.beginRefresh(context, 1),
    bundle.manifest,
    bundle.pages,
  );
  f.sql.close();
  f = local(path, false, () => scenario.createdAt);
  const coldScope = await f.core.captureContext(saved.id);
  const snapshot = await f.core.acceptedSnapshot(coldScope);
  expect(snapshot?.graph.itinerary_events).toHaveLength(16);
  if (!snapshot) throw new Error("REFERENCE_COLD_COLLECTION_MISSING");
  expect(snapshot.graph.itinerary_events.map((row) => row.id).sort()).toEqual(
    scenario.items.map((row) => row.itemId).sort(),
  );
  expect(snapshot.graph.trip_flight_intents).toHaveLength(2);
  expect(
    snapshot.graph.trip_flight_intents.every((row) => row.qualification === "SPARSE"),
  ).toBe(true);
  expect(
    snapshot.graph.itinerary_transport_services.filter(
      (row) => row.transport_subtype === "FLIGHT",
    ),
  ).toHaveLength(0);
  expect(snapshot.graph.trip_rental_details).toHaveLength(3);
  const sameDay = snapshot.graph.itinerary_events.find(
    (row) => row.title === "Reference same-day rental",
  )!;
  expect(sameDay).toMatchObject({
    start_local_date: "2027-02-09",
    end_local_date: "2027-02-09",
    start_local_time: "09:00:00",
    end_local_time: "17:00:00",
    planned_start: null,
    planned_end: null,
  });
  const overnight = scenario.items.find((row) => row.key === 13)!;
  expect(
    snapshot.graph.itinerary_transport_endpoints.filter(
      (row) => row.event_id === overnight.itemId,
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "ORIGIN",
        local_date: "2027-02-10",
        instant: null,
        local_time: null,
      }),
      expect.objectContaining({
        role: "DESTINATION",
        local_date: "2027-02-11",
        instant: null,
        local_time: null,
      }),
    ]),
  );
  const dayTicket = scenario.items.find((row) => row.key === 15)!;
  expect(
    snapshot.graph.itinerary_events.find((row) => row.id === dayTicket.itemId),
  ).toMatchObject({
    start_local_date: "2027-02-04",
    start_local_time: "14:00:00",
    start_quality: "ESTIMATED",
    planned_start: null,
  });
  expect(snapshot.graph.trip_entitlements).toHaveLength(0);
  expect(snapshot.graph.trip_booking_item_links).toHaveLength(0);
  const observed = await createCoreP6DayFeedReader(f.core)(saved.id);
  expect(observed?.projection.items).toHaveLength(16);
  if (!observed) throw new Error("REFERENCE_READER_MISSING");
  const activity = observed.projection.query("2027-02-04", "Asia/Tokyo");
  expect(
    activity.coreRows?.find((row) => row.rowKey.itemId === dayTicket.itemId),
  ).toMatchObject({
    family: "P6",
    position: "TNS",
    displayTime: { localTime: "14:00:00", comparable: false },
  });
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    syncStatus: "PENDING_CREATE",
    serverId: null,
    ownerPersonId: null,
  });
  expect(
    f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='CREATE_TRIP' AND status='DEPENDENCY_BLOCKED'",
      )
      .get()?.n,
  ).toBe(1);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM ledger_members WHERE status='local'").get()
      ?.n,
  ).toBe(1);
  f.switchTo(accountB);
  expect(await f.repo.getTrip(saved.id)).toBeNull();
  expect(await createCoreP6DayFeedReader(f.core)(saved.id)).toBeNull();
  f.switchTo(accountA);
  expect(
    (await createCoreP6DayFeedReader(f.core)(saved.id))?.projection.items,
  ).toHaveLength(16);
  const other = local(":memory:", true, () => scenario.createdAt);
  const broken = structuredClone(bundle.pages);
  broken[0].pageSha256 = "0".repeat(64);
  const otherScope = await other.core.captureContext(saved.id);
  await expect(
    other.core.install(
      await other.core.beginRefresh(otherScope, 1),
      bundle.manifest,
      broken,
    ),
  ).rejects.toThrow();
  expect(await other.core.acceptedSnapshot(otherScope)).toBeNull();
  expect(
    (await createCoreP6DayFeedReader(f.core)(saved.id))?.projection.items,
  ).toHaveLength(16);
});

it("Reference fixture optional bootstrap keeps supplied normal actor/person/epoch/access identity rather than synthetic defaults", async () => {
  const { referenceTripV1, createReferenceTripV1LocalProducer, seedReferenceTripV1 } =
    await import("./__fixtures__/referenceTripV1");
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const actor = {
    accountId: accountA,
    tripId: referenceTripV1.trip.tripId,
    active: true,
    canManageShared: true,
    personId: randomUUID(),
    personIds: [] as string[],
  };
  actor.personIds = [actor.personId];
  const epoch = randomUUID();
  const producer = await createReferenceTripV1LocalProducer(accountA, hash, false, {
    actor,
    epoch,
    accessRevision: 7,
  });
  const f = local();
  await seedReferenceTripV1(f.repo);
  const pending = await f.core.pending(await f.core.captureContext(actor.tripId));
  for (const row of pending) await producer.execute(row.command);
  const bundle = await producer.collection();
  expect(producer.evidenceLevel).toBe("REFERENCE_LOCAL_PG_BOOTSTRAP_MEMORY_ITEMS");
  expect(bundle.manifest).toMatchObject({ epoch, accessRevision: 7 });
  const bindings = bundle.pages
    .flatMap((page) => page.records)
    .filter((row) => row.kind === "PERSON_BINDING");
  expect(JSON.stringify(bindings)).toContain(actor.personId);
  expect(JSON.stringify(bindings)).not.toContain(referenceTripV1.persons[0].personId);
  await expect(
    createReferenceTripV1LocalProducer(accountA, hash, false, {
      actor: { ...actor, accountId: accountB },
      epoch,
      accessRevision: 7,
    }),
  ).rejects.toThrow("BOOTSTRAP_MISMATCH");
});

it("TCL01 offline Trip→Ledger→Expense→cold reopen retains local authority and the original queue dependency", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-tcl01-offline-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const create = input();
  const saved = await f.repo.createTrip(create);
  const reporting = createLedgerReportingRepository(f.database, async () => accountA);
  const reads = createLedgerReadRepository(f.database, async () => accountA);
  const journey = (await reporting.listJourneys())[0];
  const actor = await reporting.getActorMemberId(saved.id);
  const members = await reads.listMembers(saved.id);
  expect(journey).toMatchObject({
    journeyId: saved.id,
    hasActor: true,
    settlementCurrency: "NZD",
    memberCount: 1,
  });
  expect(members).toHaveLength(1);
  expect(members[0]).toMatchObject({
    id: actor?.memberId,
    role: "owner",
    status: "local",
  });
  const memberId = members[0].id;
  const expenses = createLedgerExpenseRepository(f.database, async () => accountA);
  const expense = await expenses.createExpense({
    journeyId: saved.id,
    creatorMemberId: memberId,
    payerMemberId: memberId,
    title: "Summer lunch",
    category: "food",
    occurredAt: stamp,
    economicDate: "2026-10-13",
    original: { minor: 1200, currency: "NZD", scale: 2 },
    participants: [
      {
        memberId,
        displayNameSnapshot: members[0].displayName,
        householdIdSnapshot: null,
      },
    ],
    splits: [
      {
        memberId,
        method: "EQUAL_PERSON",
        originalMinor: 1200,
        settlementMinor: null,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: null,
    status: "DRAFT",
  });
  const before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  expect(before).toHaveLength(2);
  expect(before.find((row) => row.entity_id === expense.id)).toMatchObject({
    status: "DEPENDENCY_BLOCKED",
    dependency_operation_id: create.operationId,
    attempt_count: 0,
    owner_user_id: accountA,
  });
  expect(await f.queue.listPending()).toEqual([]);
  await f.repo.initializeLocalLedger(saved.id);
  expect(await f.repo.createTrip(create)).toEqual(saved);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM local_trip_ledger_bindings").get()?.n,
  ).toBe(1);
  expect(await f.core.acceptedSnapshot(await f.core.captureContext(saved.id))).toBeNull();
  expect(
    f.sql.prepare("SELECT owner_person_id,accepted_at FROM local_trip_containers").get(),
  ).toMatchObject({ owner_person_id: null, accepted_at: null });
  expect(
    f.sql
      .prepare("SELECT participation_revision,participation_active FROM ledger_members")
      .get(),
  ).toMatchObject({ participation_revision: null, participation_active: null });
  f.sql.close();
  f = local(path, false);
  await f.repo.initializeLocalLedger(saved.id);
  expect(await f.repo.getTrip(saved.id)).toEqual(saved);
  expect(
    await createLedgerExpenseRepository(f.database, async () => accountA).getExpense(
      expense.id,
    ),
  ).toMatchObject({
    id: expense.id,
    journeyId: saved.id,
    creatorMemberId: memberId,
    syncStatus: "PENDING_CREATE",
  });
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
  );
  f.switchTo(accountB);
  await f.repo.initializeLocalLedger(saved.id);
  expect(await f.repo.getTrip(saved.id)).toBeNull();
  expect(
    await createLedgerReportingRepository(
      f.database,
      async () => accountB,
    ).listJourneys(),
  ).toEqual([]);
  expect(
    await createLedgerExpenseRepository(f.database, async () => accountB).getExpense(
      expense.id,
    ),
  ).toBeNull();
});

it("TCL01 repairs an existing pre-initialization creator intent without replacing Trip, operation or timestamps", async () => {
  const f = local();
  const create = input();
  // Synthetic pre-TCL01 state, using the historical normal repository SQL contract.
  const payload = JSON.stringify({
    tripId: create.tripId,
    name: create.name.trim(),
    destination: create.destination,
    startDate: create.startDate,
    endDate: create.endDate,
  });
  f.sql
    .prepare(
      `INSERT INTO local_trip_containers(account_id,id,create_operation_id,name,destination,start_date,end_date,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      accountA,
      create.tripId,
      create.operationId,
      create.name.trim(),
      create.destination,
      create.startDate,
      create.endDate,
      stamp,
      stamp,
    );
  f.sql
    .prepare(
      `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,last_error_code,created_at,updated_at)
    VALUES(?,?,'TRIP',?,'CREATE_TRIP',?,?,?,'DEPENDENCY_BLOCKED',0,'TRIP_INITIALIZATION_REQUIRED',?,?)`,
    )
    .run(
      create.operationId,
      create.tripId,
      create.tripId,
      create.operationId,
      payload,
      accountA,
      stamp,
      stamp,
    );
  const beforeTrip = f.sql.prepare("SELECT * FROM local_trip_containers").get();
  const beforeQueue = f.sql.prepare("SELECT * FROM sync_operations").get();
  f.abaNextRead();
  await expect(f.repo.initializeLocalLedger(create.tripId)).rejects.toThrow(
    "Account changed",
  );
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM local_trip_ledger_bindings").get()?.n,
  ).toBe(0);
  f.sql
    .prepare("UPDATE sync_operations SET payload_json=?")
    .run(JSON.stringify({ ...JSON.parse(payload), name: "Different intent" }));
  await expect(f.repo.initializeLocalLedger(create.tripId)).rejects.toThrow(
    "TRIP_CREATE_LOCAL_MISMATCH",
  );
  f.sql
    .prepare("UPDATE sync_operations SET payload_json=?,status='COMPLETED'")
    .run(payload);
  await expect(f.repo.initializeLocalLedger(create.tripId)).rejects.toThrow(
    "TRIP_CREATE_LOCAL_MISMATCH",
  );
  f.sql.prepare("UPDATE local_trip_containers SET accepted_at=?").run(stamp);
  await f.repo.initializeLocalLedger(create.tripId);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM local_trip_ledger_bindings").get()?.n,
  ).toBe(0);
  f.sql.prepare("UPDATE local_trip_containers SET accepted_at=NULL").run();
  f.sql.prepare("UPDATE sync_operations SET status='DEPENDENCY_BLOCKED'").run();
  await f.repo.initializeLocalLedger(create.tripId);
  await f.repo.initializeLocalLedger(create.tripId);
  expect(f.sql.prepare("SELECT * FROM local_trip_containers").get()).toEqual(beforeTrip);
  expect(f.sql.prepare("SELECT * FROM sync_operations").get()).toEqual(beforeQueue);
  expect(
    await createLedgerReportingRepository(
      f.database,
      async () => accountA,
    ).getActorMemberId(create.tripId),
  ).toMatchObject({ memberId: expect.any(String) });
});

it("TCL01 rolls back Trip, creator binding and Ledger together if initialization fails", async () => {
  const f = local();
  f.sql.exec(
    `CREATE TRIGGER fail_local_actor BEFORE INSERT ON ledger_actor_context BEGIN SELECT RAISE(ABORT,'ACTOR_WRITE_FAILED'); END;`,
  );
  await expect(f.repo.createTrip(input())).rejects.toThrow("ACTOR_WRITE_FAILED");
  for (const table of [
    "local_trip_containers",
    "local_trip_ledger_bindings",
    "ledger_journeys",
    "ledger_members",
    "ledger_actor_context",
    "sync_operations",
  ])
    expect(f.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
});

it("TCL01 retains approved fresh Journey financial defaults regardless of display currency", async () => {
  const f = local();
  const reporting = createLedgerReportingRepository(f.database, async () => accountA);
  await reporting.setDefaultCurrency("JPY");
  const saved = await f.repo.createTrip(input());
  expect((await reporting.listJourneys())[0]).toMatchObject({
    journeyId: saved.id,
    settlementCurrency: "NZD",
    settlementScale: 2,
  });
  f.switchTo(accountB);
  const other = await f.repo.createTrip(input());
  expect(
    (
      await createLedgerReportingRepository(
        f.database,
        async () => accountB,
      ).listJourneys()
    )[0],
  ).toMatchObject({ journeyId: other.id, settlementCurrency: "NZD", settlementScale: 2 });
});

async function tripExpense(f: ReturnType<typeof local>) {
  const create = input();
  const trip = await f.repo.createTrip(create);
  const memberId = (await createLedgerReportingRepository(
    f.database,
    async () => accountA,
  ).getActorMemberId(trip.id))!.memberId!;
  const command = {
    journeyId: trip.id,
    creatorMemberId: memberId,
    payerMemberId: memberId,
    title: memberId,
    category: "food",
    occurredAt: stamp,
    economicDate: "2026-10-13",
    original: { minor: 1200, currency: "NZD", scale: 2 },
    participants: [
      { memberId, displayNameSnapshot: "Traveller", householdIdSnapshot: null },
    ],
    splits: [
      {
        memberId,
        method: "EQUAL_PERSON" as const,
        originalMinor: 1200,
        settlementMinor: null,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: null,
    status: "DRAFT" as const,
  };
  const repository = createLedgerExpenseRepository(f.database, async () => accountA);
  const expense = await repository.createExpense(command);
  const receipt = {
    operationId: create.operationId,
    tripId: trip.id,
    actorAccountId: accountA,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
  };
  return { create, trip, memberId, command, repository, expense, receipt };
}

it("TCL02 receipt maps local Person atomically before existing workers release Expense CREATE→DELETE, and cold replay creates no duplicates", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-tcl02-order-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const saved = await tripExpense(f);
  await saved.repository.tombstoneExpense(saved.expense.id, "Local correction");
  const queueBefore = f.sql
    .prepare("SELECT id,idempotency_key,created_at FROM sync_operations ORDER BY rowid")
    .all();
  const auditBefore = f.sql
    .prepare("SELECT * FROM ledger_expense_audit_events ORDER BY id")
    .all();
  expect(await f.queue.listPending()).toEqual([]);
  const transport = {
    receipt: vi.fn(async () => saved.receipt),
    create: vi.fn(),
  } as unknown as TripCreateTransport;
  const runTrip = () =>
    createTripCreateSyncCoordinator(
      f.queue,
      createTripCreateSyncWorker(f.repo, transport, async () => accountA),
      f.repo,
      () => true,
    ).run("AUTHENTICATED_ONLINE");
  expect((await runTrip()).processedCount).toBe(1);
  expect(transport.create).not.toHaveBeenCalled();
  expect(f.sql.prepare("SELECT count(*) n FROM ledger_members").get()?.n).toBe(1);
  expect(
    f.sql.prepare("SELECT id,status,participation_revision FROM ledger_members").get(),
  ).toMatchObject({
    id: saved.receipt.ownerPersonId,
    status: "local",
    participation_revision: null,
  });
  expect(
    f.sql.prepare("SELECT person_id,authority FROM local_trip_ledger_bindings").get(),
  ).toMatchObject({ person_id: saved.memberId, authority: "LOCAL_CREATOR" });
  expect(
    f.sql.prepare("SELECT * FROM ledger_expense_audit_events ORDER BY id").all(),
  ).toEqual(auditBefore);
  expect(
    f.sql
      .prepare("SELECT id,idempotency_key,created_at FROM sync_operations ORDER BY rowid")
      .all(),
  ).toEqual(queueBefore);
  const pending = await f.queue.listPending();
  expect(pending).toHaveLength(1);
  expect(pending[0].operationType).toBe("LEDGER_CREATE_EXPENSE");
  const payload = JSON.parse(pending[0].payloadJson);
  expect(payload.expense).toMatchObject({
    title: saved.memberId,
    payerMemberId: saved.receipt.ownerPersonId,
    original: saved.command.original,
    participants: [{ memberId: saved.receipt.ownerPersonId }],
  });
  const commands = f.sql
    .prepare(
      "SELECT intent_json,projection_json FROM ledger_expense_commands ORDER BY intent_sequence",
    )
    .all();
  expect(JSON.parse(String(commands[0].intent_json)).expense.payerMemberId).toBe(
    saved.receipt.ownerPersonId,
  );
  f.sql.close();
  f = local(path, false);
  const beforeReplay = f.sql
    .prepare("SELECT * FROM ledger_expense_commands ORDER BY intent_sequence")
    .all();
  await f.repo.acceptCreate(saved.receipt);
  expect(
    f.sql.prepare("SELECT * FROM ledger_expense_commands ORDER BY intent_sequence").all(),
  ).toEqual(beforeReplay);
  const serverId = randomUUID();
  const canonical = (deleted = false) => ({
    ...saved.command,
    creatorMemberId: saved.receipt.ownerPersonId,
    payerMemberId: saved.receipt.ownerPersonId,
    participants: [
      { ...saved.command.participants[0], memberId: saved.receipt.ownerPersonId },
    ],
    splits: [{ ...saved.command.splits[0], memberId: saved.receipt.ownerPersonId }],
    id: serverId,
    description: null,
    businessStatus: deleted ? ("DELETED" as const) : ("DRAFT" as const),
    settlementParticipation: "INCLUDED" as const,
    revision: deleted ? 2 : 1,
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: deleted ? stamp : null,
    paymentRecords: [],
    auditEvents: [],
  });
  const createExpense = vi.fn(async () => ({
    serverId,
    revision: 1,
    entity: canonical(),
  }));
  const deleteExpense = vi.fn(async () => ({
    serverId,
    revision: 2,
    entity: canonical(true),
  }));
  const runExpenses = () =>
    createSyncEngine(
      f.queue,
      createLedgerExpenseSyncWorker(
        createLedgerExpenseRepository(f.database, async () => accountA),
        { createExpense, deleteExpense } as never,
      ),
      undefined,
      (op) => op.entityType === "ledger_expense",
    ).run("AUTHENTICATED_ONLINE");
  expect((await runExpenses()).processedCount).toBe(2);
  expect(createExpense).toHaveBeenCalledOnce();
  expect(deleteExpense).toHaveBeenCalledOnce();
  expect(createExpense.mock.invocationCallOrder[0]).toBeLessThan(
    deleteExpense.mock.invocationCallOrder[0],
  );
  f.sql.close();
  f = local(path, false);
  expect((await runTrip()).processedCount).toBe(0);
  expect((await runExpenses()).processedCount).toBe(0);
  expect(
    f.sql
      .prepare("SELECT id,idempotency_key,created_at FROM sync_operations ORDER BY rowid")
      .all(),
  ).toEqual(queueBefore);
  expect(f.sql.prepare("SELECT count(*) n FROM ledger_expenses").get()?.n).toBe(1);
  expect(
    await createLedgerReportingRepository(
      f.database,
      async () => accountA,
    ).getActorMemberId(saved.trip.id),
  ).toMatchObject({ memberId: saved.receipt.ownerPersonId });
  expect(
    await f.core.acceptedSnapshot(await f.core.captureContext(saved.trip.id)),
  ).toBeNull();
});

it("TCL02 failed Person mapping rolls back current Expense references, receipt ownership and dependency release together", async () => {
  const f = local();
  const saved = await tripExpense(f);
  const tables = [
    "local_trip_containers",
    "local_trip_ledger_bindings",
    "ledger_members",
    "ledger_actor_context",
    "ledger_expenses",
    "ledger_expense_participants",
    "ledger_expense_splits",
    "ledger_expense_commands",
    "sync_operations",
  ];
  const snapshot = () =>
    tables.map((table) => [table, f.sql.prepare(`SELECT * FROM ${table}`).all()]);
  const before = snapshot();
  f.sql.exec(
    "CREATE TRIGGER fail_mapping BEFORE UPDATE OF member_id ON ledger_actor_context BEGIN SELECT RAISE(ABORT,'MAPPING_FAILED'); END",
  );
  await expect(f.repo.acceptCreate(saved.receipt)).rejects.toThrow("MAPPING_FAILED");
  expect(snapshot()).toEqual(before);
  expect(await f.queue.listPending()).toEqual([]);
});

it("TCL02 original Account scope fences an owning receipt after same-account ABA", async () => {
  const f = local();
  const saved = await tripExpense(f);
  const scope = await captureAccountScope(async () => accountA);
  f.switchTo(accountB);
  f.switchTo(accountA);
  await expect(f.repo.acceptCreate(saved.receipt, scope)).rejects.toThrow(
    "Account changed",
  );
  expect((await f.repo.getTrip(saved.trip.id))?.serverId).toBeNull();
  expect(await f.queue.listPending()).toEqual([]);
});

it("TCL02 never rewrites an attempted Expense or releases a Trip blocked for another reason", async () => {
  const f = local();
  const saved = await tripExpense(f);
  await f.queue.markFailed(saved.create.operationId, new Error("Terminal rejection"));
  await f.queue.markDependencyBlocked(saved.create.operationId);
  await f.repo.resumeCreateTrips();
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(saved.create.operationId)?.status,
  ).toBe("DEPENDENCY_BLOCKED");
  await f.queue.markProcessing(saved.expense.operationResult!.operationId!);
  await expect(f.repo.acceptCreate(saved.receipt)).rejects.toThrow(
    "TRIP_LEDGER_MAPPING_REQUIRES_REVIEW",
  );
  expect((await f.repo.getTrip(saved.trip.id))?.serverId).toBeNull();
});

it("TCL02 lost Trip-create response recovers the formal receipt after cold reopen without a second create", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T00:00:00Z"));
  const folder = mkdtempSync(join(tmpdir(), "otr-tcl02-response-loss-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const saved = await tripExpense(f);
  let retained = false;
  const transport = {
    receipt: vi.fn(async () => (retained ? saved.receipt : null)),
    create: vi.fn(async () => {
      retained = true;
      throw new Error("CREATE_RESPONSE_LOST");
    }),
  } as unknown as TripCreateTransport;
  const run = () =>
    createTripCreateSyncCoordinator(
      f.queue,
      createTripCreateSyncWorker(f.repo, transport, async () => accountA),
      f.repo,
      () => true,
    ).run("AUTHENTICATED_ONLINE");
  expect((await run()).processedCount).toBe(1);
  expect((await f.repo.getTrip(saved.trip.id))?.serverId).toBeNull();
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(saved.create.operationId)?.status,
  ).toBe("RETRYABLE");
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(saved.expense.operationResult!.operationId!)?.status,
  ).toBe("DEPENDENCY_BLOCKED");
  f.sql.close();
  vi.setSystemTime(new Date("2026-10-16T01:00:00Z"));
  f = local(path, false);
  expect((await run()).processedCount).toBe(1);
  expect(transport.create).toHaveBeenCalledOnce();
  expect(transport.receipt).toHaveBeenCalledTimes(2);
  expect((await f.repo.getTrip(saved.trip.id))?.ownerPersonId).toBe(
    saved.receipt.ownerPersonId,
  );
  expect(f.sql.prepare("SELECT count(*) n FROM local_trip_containers").get()?.n).toBe(1);
  expect(f.sql.prepare("SELECT count(*) n FROM ledger_members").get()?.n).toBe(1);
  expect((await f.queue.listPending()).map((op) => op.id)).toEqual([
    saved.expense.operationResult!.operationId!,
  ]);
});

it("TCL02 retains an authoritative Ledger bootstrap that arrives before the Trip receipt", async () => {
  const f = local();
  const saved = await tripExpense(f);
  const capabilities = {
    canRead: true,
    canCreateExpense: true,
    canEditOwnExpense: true,
    canCorrectAnyExpense: false,
    canSuggestCorrection: false,
    canResolveOwnExpenseConflict: true,
    canAddOwnPaymentEvidence: false,
    canManageExpenseValuation: false,
    canManageLedgerValuationPolicy: false,
  };
  await createLedgerReadRepository(f.database, async () => accountA).applyBootstrap({
    journey: {
      id: saved.trip.id,
      title: saved.trip.name,
      startDate: saved.trip.startDate,
      endDate: saved.trip.endDate,
      settlementCurrency: "NZD",
      settlementScale: 2,
      valuationPolicy: "REFERENCE_RATE",
      updatedAt: stamp,
    },
    members: [
      {
        id: saved.receipt.ownerPersonId,
        displayName: "Formal owner",
        role: "owner",
        status: "linked",
        capabilities,
        updatedAt: stamp,
      },
    ],
    households: [],
    expenses: [],
    corrections: [],
    rateQuotes: [],
    actor: { memberId: saved.receipt.ownerPersonId, role: "owner", capabilities },
    cursor: "accepted",
    serverTime: stamp,
  });
  const actor = f.sql.prepare("SELECT * FROM ledger_actor_context").get();
  const official = f.sql
    .prepare("SELECT * FROM ledger_members WHERE id=?")
    .get(saved.receipt.ownerPersonId);
  await f.repo.acceptCreate(saved.receipt);
  expect(f.sql.prepare("SELECT * FROM ledger_actor_context").get()).toEqual(actor);
  expect(
    f.sql
      .prepare("SELECT * FROM ledger_members WHERE id=?")
      .get(saved.receipt.ownerPersonId),
  ).toEqual(official);
  expect(f.sql.prepare("SELECT count(*) n FROM ledger_members").get()?.n).toBe(1);
  expect((await saved.repository.getExpense(saved.expense.id))?.payerMemberId).toBe(
    saved.receipt.ownerPersonId,
  );
  expect((await f.queue.listPending()).map((op) => op.id)).toEqual([
    saved.expense.operationResult!.operationId!,
  ]);
});

it("TCL02 explicit Native target leaves another pending local Reference-style Trip untouched", async () => {
  const f = local();
  const saved = await tripExpense(f);
  const other = await f.repo.createTrip({
    ...input(),
    name: "Other local Reference-style trip",
  });
  const before = f.sql
    .prepare("SELECT * FROM sync_operations WHERE trip_id=?")
    .all(other.id);
  const transport = {
    receipt: vi.fn(async () => saved.receipt),
    create: vi.fn(),
  } as unknown as TripCreateTransport;
  const target = {
    accountId: accountA,
    tripId: saved.trip.id,
    operationId: saved.create.operationId,
  };
  const coordinator = createTripCreateSyncCoordinator(
    f.queue,
    createTripCreateSyncWorker(f.repo, transport, async () => accountA),
    f.repo,
    () => true,
    target,
  );
  expect((await coordinator.run("AUTHENTICATED_ONLINE")).processedCount).toBe(1);
  expect(transport.receipt).toHaveBeenCalledTimes(1);
  expect(transport.receipt).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: accountA }),
    target.operationId,
  );
  expect(
    f.sql.prepare("SELECT * FROM sync_operations WHERE trip_id=?").all(other.id),
  ).toEqual(before);
  expect((await f.repo.getTrip(other.id))?.serverId).toBeNull();
});

it("TCL02 rejects a receipt Person collision with a different Journey without changing either", async () => {
  const f = local();
  const saved = await tripExpense(f);
  const other = await tripExpense(f);
  const before = f.sql.prepare("SELECT * FROM ledger_members ORDER BY id").all();
  await expect(
    f.repo.acceptCreate({ ...saved.receipt, ownerPersonId: other.memberId }),
  ).rejects.toThrow("TRIP_LEDGER_PERSON_MAPPING_MISMATCH");
  expect(f.sql.prepare("SELECT * FROM ledger_members ORDER BY id").all()).toEqual(before);
  expect((await f.repo.getTrip(saved.trip.id))?.serverId).toBeNull();
  expect((await f.repo.getTrip(other.trip.id))?.serverId).toBeNull();
  expect(await f.queue.listPending()).toEqual([]);
});

it("TCL02 does not release Expenses when a newer cached actor no longer has a member", async () => {
  const f = local();
  const saved = await tripExpense(f);
  f.sql.prepare("UPDATE ledger_actor_context SET member_id=NULL").run();
  await expect(f.repo.acceptCreate(saved.receipt)).rejects.toThrow(
    "TRIP_LEDGER_MAPPING_REQUIRES_REVIEW",
  );
  expect((await f.repo.getTrip(saved.trip.id))?.serverId).toBeNull();
  expect(await f.queue.listPending()).toEqual([]);
});

it("saves metadata offline with ordered intents, unchanged create proof and durable dirty values", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-trip-metadata-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const create = input(),
    saved = await f.repo.createTrip(create);
  const original = f.sql
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(create.operationId)!.payload_json;
  const before = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  const first = {
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "First edit", startDate: null, endDate: null },
  };
  expect(await f.repo.canUpdateMetadata(saved.id)).toBe(true);
  await f.repo.updateMetadata(first);
  await f.repo.updateMetadata(first);
  const second = {
    operationId: randomUUID(),
    tripId: saved.id,
    before: first.after,
    after: { ...first.after, name: "Second edit", destination: "Auckland" },
  };
  await f.repo.updateMetadata(second);
  expect(
    f.sql
      .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
      .get(create.operationId)!.payload_json,
  ).toBe(original);
  expect(
    f.sql
      .prepare(
        "SELECT id,dependency_operation_id FROM sync_operations WHERE operation_type='UPDATE_TRIP_METADATA' ORDER BY rowid",
      )
      .all(),
  ).toEqual([
    { id: first.operationId, dependency_operation_id: create.operationId },
    { id: second.operationId, dependency_operation_id: first.operationId },
  ]);
  await expect(
    f.repo.updateMetadata({ ...first, operationId: randomUUID() }),
  ).rejects.toThrow("TRIP_METADATA_LOCAL_CONFLICT");
  await expect(
    f.repo.updateMetadata({ ...first, after: { ...first.after, name: "reuse" } }),
  ).rejects.toThrow("TRIP_METADATA_OPERATION_REUSE_MISMATCH");
  f.sql.close();
  f = local(path, false);
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    ...second.after,
    syncStatus: "PENDING_CREATE",
  });
  const { createTripDiscoveryRepository } = await import("./tripDiscoveryRepository");
  const identity = async () => accountA;
  const discovery = createTripDiscoveryRepository(f.database, identity);
  await discovery.replaceSnapshot(await captureAccountScope(identity), [
    { id: saved.id, ...before, createdAt: stamp },
  ]);
  expect(
    (await discovery.readMerged()).trips.find((t) => t.id === saved.id),
  ).toMatchObject(second.after);
  f.failNextQueue();
  await expect(
    f.repo.updateMetadata({
      operationId: randomUUID(),
      tripId: saved.id,
      before: second.after,
      after: before,
    }),
  ).rejects.toThrow("QUEUE_WRITE_FAILED");
  expect(await f.repo.getTrip(saved.id)).toMatchObject(second.after);
  f.switchTo(accountB);
  expect(await f.repo.canUpdateMetadata(saved.id)).toBe(false);
  await expect(
    f.repo.updateMetadata({
      operationId: randomUUID(),
      tripId: saved.id,
      before: second.after,
      after: before,
    }),
  ).rejects.toThrow("TRIP_METADATA_LOCAL_CREATOR_REQUIRED");
});
it("metadata validates undated calendar semantics and refuses account changes atomically", async () => {
  const f = local(),
    saved = await f.repo.createTrip(input());
  const before = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  const request = {
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "Changed" },
  };
  await expect(
    f.repo.updateMetadata({
      ...request,
      after: { ...request.after, startDate: "2027-02-30" },
    }),
  ).rejects.toThrow();
  await expect(
    f.repo.updateMetadata({
      ...request,
      after: { ...request.after, startDate: "2027-02-01", endDate: "2027-01-01" },
    }),
  ).rejects.toThrow();
  f.abaNextRead();
  await expect(f.repo.updateMetadata(request)).rejects.toThrow("Account changed");
  expect(await f.repo.getTrip(saved.id)).toMatchObject(before);
});
it("keeps later dirty edits when earlier metadata receipts arrive and resumes dependencies in order", async () => {
  const f = local(),
    create = input(),
    saved = await f.repo.createTrip(create);
  const before = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  const first = {
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "First" },
  };
  const second = {
    operationId: randomUUID(),
    tripId: saved.id,
    before: first.after,
    after: { ...before, name: "Second" },
  };
  await f.repo.updateMetadata(first);
  await f.repo.updateMetadata(second);
  const accepted = await f.repo.acceptCreate({
    ...create,
    name: saved.name,
    actorAccountId: accountA,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
  });
  expect(accepted.syncStatus).toBe("PENDING_UPDATE");
  expect((await f.repo.getTrip(saved.id))?.syncStatus).toBe("PENDING_UPDATE");
  const { createTripMetadataSyncCoordinator, createTripMetadataSyncWorker } =
    await import("../sync/tripMetadataSyncWorker");
  const receipts = new Map<string, typeof first & { actorAccountId: string }>();
  const transport = {
    receipt: vi.fn(async (_: unknown, id: string) => receipts.get(id) ?? null),
    update: vi.fn(async (_: unknown, request: typeof first) => {
      const receipt = { ...request, actorAccountId: accountA };
      receipts.set(request.operationId, receipt);
      return receipt;
    }),
  };
  const runner = createTripMetadataSyncCoordinator(
    f.queue,
    createTripMetadataSyncWorker(f.repo, transport, async () => accountA),
    f.repo,
    () => true,
  );
  expect((await runner.run("AUTHENTICATED_OFFLINE")).processedCount).toBe(0);
  expect((await runner.run("AUTHENTICATED_ONLINE")).processedCount).toBe(2);
  expect(transport.update.mock.calls.map((call) => call[1].operationId)).toEqual([
    first.operationId,
    second.operationId,
  ]);
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    name: "Second",
    syncStatus: "SYNCED",
  });
  await f.repo.acceptMetadataUpdate({ ...first, actorAccountId: accountA });
  expect((await f.repo.getTrip(saved.id))?.name).toBe("Second");
  await expect(
    f.repo.acceptMetadataUpdate({ ...first, after: before, actorAccountId: accountA }),
  ).rejects.toThrow("TRIP_METADATA_RECEIPT_MISMATCH");
  expect((await runner.run("AUTHENTICATED_ONLINE")).processedCount).toBe(0);
});

it("atomically creates Trip/owner/named Persons and preserves names across cold replay", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-trip-travelers-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const names = [" Tina ", "", "旅行者", " ", "Tina", "", ""];
  const command = {
    ...input(),
    travelers: names.map((displayName) => ({
      operationId: randomUUID(),
      personId: randomUUID(),
      displayName,
    })),
  };
  await f.repo.createTrip(command);
  expect(f.sql.prepare("SELECT count(*) n FROM ledger_members").get()?.n).toBe(4);
  const before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const proof = JSON.parse(
    String(
      f.sql
        .prepare("SELECT payload_json p FROM sync_operations WHERE id=?")
        .get(command.operationId)?.p,
    ),
  );
  expect(proof).not.toHaveProperty("travelers");
  f.sql.close();
  f = local(path, false);
  expect((await f.repo.createTrip(command)).id).toBe(command.tripId);
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
  );
});

it("rolls the new Trip and owner back if a named Person intent cannot persist", async () => {
  const f = local();
  const operationId = randomUUID();
  f.sql.exec(`CREATE TRIGGER fail_named_person BEFORE INSERT ON sync_operations
    WHEN NEW.id='${operationId}' BEGIN SELECT RAISE(ABORT,'NAMED_PERSON_QUEUE_FAILURE'); END`);
  await expect(
    f.repo.createTrip({
      ...input(),
      travelers: [{ operationId, personId: randomUUID(), displayName: "Tina" }],
    }),
  ).rejects.toThrow("NAMED_PERSON_QUEUE_FAILURE");
  for (const table of [
    "local_trip_containers",
    "local_trip_ledger_bindings",
    "ledger_members",
    "ledger_actor_context",
    "ledger_journeys",
    "sync_operations",
  ])
    expect(f.sql.prepare(`SELECT count(*) n FROM ${table}`).get()?.n).toBe(0);
});

it("atomically saves metadata and built-in cover, with durable cold recovery and original create proof", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-trip-editor-atomic-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const create = input();
  const saved = await f.repo.createTrip(create);
  const before = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  const request = {
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "Atomic edit", startDate: null, endDate: null },
  };
  const proof = f.sql
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(create.operationId);
  await f.repo.updateMetadata(request, { before: null, after: "coast" });
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("coast");
  expect(
    f.sql
      .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
      .get(create.operationId),
  ).toEqual(proof);
  expect(
    JSON.parse(
      String(
        f.sql
          .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
          .get(request.operationId)!.payload_json,
      ),
    ),
  ).toEqual(request);
  f.sql.close();
  connections.splice(connections.indexOf(f.sql), 1);
  f = local(path, false);
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    name: "Atomic edit",
    startDate: null,
    endDate: null,
    selectedCoverAssetId: "coast",
  });
  await f.repo.selectBuiltInCover(saved.id, "mountain");
  await f.repo.updateMetadata(request, { before: null, after: "coast" });
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("mountain");
});

it("saves cover-only without a Hosted metadata intent and permits unchanged replay", async () => {
  const f = local();
  const saved = await f.repo.createTrip(input());
  const metadata = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  const request = {
    operationId: randomUUID(),
    tripId: saved.id,
    before: metadata,
    after: metadata,
  };
  await f.repo.updateMetadata(request, { before: null, after: "city" });
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("city");
  expect(
    f.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM sync_operations WHERE operation_type='UPDATE_TRIP_METADATA'",
      )
      .get()!.n,
  ).toBe(0);
  await f.repo.updateMetadata(request, { before: null, after: "city" });
  await expect(
    f.repo.updateMetadata(request, { before: "city", after: "city" }),
  ).rejects.toThrow("TRIP_METADATA_OPERATION_REUSE_MISMATCH");
});

it("rolls back the cover when metadata queue insertion fails", async () => {
  const f = local();
  const saved = await f.repo.createTrip(input());
  const before = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  f.failNextQueue();
  await expect(
    f.repo.updateMetadata(
      {
        operationId: randomUUID(),
        tripId: saved.id,
        before,
        after: { ...before, name: "Must roll back" },
      },
      { before: null, after: "coast" },
    ),
  ).rejects.toThrow("QUEUE_WRITE_FAILED");
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    name: saved.name,
    selectedCoverAssetId: null,
  });
});

it("rejects stale cover drafts, invalid built-ins and account changes without partial metadata changes", async () => {
  const f = local();
  const saved = await f.repo.createTrip(input());
  const before = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  const request = {
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "Must roll back" },
  };
  await f.repo.selectBuiltInCover(saved.id, "city");
  await expect(
    f.repo.updateMetadata(request, { before: null, after: "coast" }),
  ).rejects.toThrow("TRIP_COVER_LOCAL_CONFLICT");
  await expect(
    f.repo.updateMetadata(request, { before: "city", after: "unknown" as never }),
  ).rejects.toThrow("TRIP_COVER_INVALID");
  f.abaNextAccept();
  await expect(
    f.repo.updateMetadata(request, { before: "city", after: "coast" }),
  ).rejects.toThrow("Account changed");
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    name: saved.name,
    selectedCoverAssetId: "city",
  });
  expect(
    f.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM sync_operations WHERE operation_type='UPDATE_TRIP_METADATA'",
      )
      .get()!.n,
  ).toBe(0);
  f.switchTo(accountB);
  await expect(
    f.repo.updateMetadata(request, { before: "city", after: "coast" }),
  ).rejects.toThrow("TRIP_METADATA_LOCAL_CREATOR_REQUIRED");
});

it("consumes cover-only operation identities durably across ABA and cold reopen without network eligibility", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-trip-cover-aba-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const saved = await f.repo.createTrip(input());
  const metadata = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  const first = {
    operationId: randomUUID(),
    tripId: saved.id,
    before: metadata,
    after: metadata,
  };
  await f.repo.updateMetadata(first, { before: null, after: "city" });
  await f.repo.updateMetadata(
    { ...first, operationId: randomUUID() },
    { before: "city", after: null },
  );
  f.sql.close();
  connections.splice(connections.indexOf(f.sql), 1);
  f = local(path, false);
  await f.repo.updateMetadata(first, { before: null, after: "city" });
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBeNull();
  expect(
    f.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM sync_operations WHERE operation_type='TRIP_COVER_LOCAL_SAVE' AND status='COMPLETED'",
      )
      .get()!.n,
  ).toBe(2);
  await expect(
    f.repo.updateMetadata(first, { before: null, after: "coast" }),
  ).rejects.toThrow("TRIP_METADATA_OPERATION_REUSE_MISMATCH");
  // Even an accidentally reactivated consumed action must never become network work.
  f.sql
    .prepare("UPDATE sync_operations SET status='PENDING' WHERE id=?")
    .run(first.operationId);
  expect((await f.queue.listPending()).some((row) => row.id === first.operationId)).toBe(
    false,
  );
  expect(await f.queue.claim(first.operationId)).toBe(false);
});

it("rolls back cover-only consumed identity on receipt write and account fence failures", async () => {
  const f = local();
  const saved = await f.repo.createTrip(input());
  const metadata = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  const request = {
    operationId: randomUUID(),
    tripId: saved.id,
    before: metadata,
    after: metadata,
  };
  f.failNextQueue();
  await expect(
    f.repo.updateMetadata(request, { before: null, after: "city" }),
  ).rejects.toThrow("QUEUE_WRITE_FAILED");
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBeNull();
  expect(
    f.sql.prepare("SELECT id FROM sync_operations WHERE id=?").get(request.operationId),
  ).toBeUndefined();
  f.abaNextAccept();
  await expect(
    f.repo.updateMetadata(request, { before: null, after: "city" }),
  ).rejects.toThrow("Account changed");
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBeNull();
  expect(
    f.sql.prepare("SELECT id FROM sync_operations WHERE id=?").get(request.operationId),
  ).toBeUndefined();
  await f.repo.updateMetadata(request, { before: null, after: "city" });
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("city");
});

it("accepts every registered cover in both direct selection and atomic metadata saves with cold recovery", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-cover52-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const command = input();
  const saved = await f.repo.createTrip(command);
  let metadata = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  const original = f.sql
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(command.operationId);
  for (const id of tripCoverAssetIds) {
    await f.repo.selectBuiltInCover(saved.id, id);
    expect(await f.repo.getTrip(saved.id)).toMatchObject({
      selectedCoverAssetId: id,
      selectedCoverAssetIdRaw: id,
    });
    await f.repo.selectBuiltInCover(saved.id, null);
    const after = { ...metadata, name: `Cover ${id}` };
    await f.repo.updateMetadata(
      { operationId: randomUUID(), tripId: saved.id, before: metadata, after },
      { before: null, after: id },
    );
    expect(await f.repo.getTrip(saved.id)).toMatchObject({
      ...after,
      selectedCoverAssetId: id,
      selectedCoverAssetIdRaw: id,
    });
    metadata = after;
  }
  expect(
    f.sql
      .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
      .get(command.operationId),
  ).toEqual(original);
  f.sql.close();
  connections.splice(connections.indexOf(f.sql), 1);
  f = local(path, false);
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    selectedCoverAssetId: tripCoverAssetIds.at(-1),
    ...metadata,
  });
  f.switchTo(accountB);
  expect(await f.repo.getTrip(saved.id)).toBeNull();
  await expect(f.repo.selectBuiltInCover(saved.id, "gen-b1-001")).rejects.toThrow(
    "TRIP_LOCAL_RECORD_MISSING",
  );
  f.switchTo(accountA);
  f.abaNextAccept();
  await expect(f.repo.selectBuiltInCover(saved.id, "wc-142191115")).rejects.toThrow(
    "Account changed",
  );
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe(
    tripCoverAssetIds.at(-1),
  );
});

it("distinguishes unknown stored IDs from AUTO and leaves them untouched on metadata-only saves", async () => {
  const f = local();
  const saved = await f.repo.createTrip(input());
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    selectedCoverAssetId: null,
    selectedCoverAssetIdRaw: null,
  });
  f.sql
    .prepare(
      "UPDATE local_trip_containers SET selected_cover_asset_id=? WHERE account_id=? AND id=?",
    )
    .run("future-cover-v3", accountA, saved.id);
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    selectedCoverAssetId: null,
    selectedCoverAssetIdRaw: "future-cover-v3",
  });
  // No cover UPDATE is allowed here, including a legacy caller's null-to-null tuple.
  f.sql.exec(
    "CREATE TRIGGER reject_cover_write BEFORE UPDATE OF selected_cover_asset_id ON local_trip_containers BEGIN SELECT RAISE(ABORT,'UNEXPECTED_COVER_WRITE'); END",
  );
  let metadata = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  for (const cover of [
    undefined,
    { before: null, after: null },
    { before: "city", after: "city" },
  ] as const) {
    const after = { ...metadata, name: `${metadata.name} edited` };
    await f.repo.updateMetadata(
      { operationId: randomUUID(), tripId: saved.id, before: metadata, after },
      cover,
    );
    metadata = after;
    expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetIdRaw).toBe(
      "future-cover-v3",
    );
  }
  f.sql.exec("DROP TRIGGER reject_cover_write");
  const request = {
    operationId: randomUUID(),
    tripId: saved.id,
    before: metadata,
    after: metadata,
  };
  await expect(
    f.repo.updateMetadata(request, { before: null, after: "gen-b1-001" }),
  ).rejects.toThrow("TRIP_COVER_LOCAL_CONFLICT");
  await expect(
    f.repo.updateMetadata(request, {
      before: "future-cover-v3",
      after: "future-cover-v3" as never,
    }),
  ).rejects.toThrow("TRIP_COVER_INVALID");
  await expect(
    f.repo.updateMetadata(request, { before: "../invalid", after: "gen-b1-001" }),
  ).rejects.toThrow("TRIP_COVER_INVALID");
  await f.repo.updateMetadata(request, {
    before: "future-cover-v3",
    after: "gen-b1-001",
  });
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    selectedCoverAssetId: "gen-b1-001",
    selectedCoverAssetIdRaw: "gen-b1-001",
  });
  await f.repo.updateMetadata(request, {
    before: "future-cover-v3",
    after: "gen-b1-001",
  });
  await expect(
    f.repo.updateMetadata(request, { before: "future-cover-v3", after: "wc-142191115" }),
  ).rejects.toThrow("TRIP_METADATA_OPERATION_REUSE_MISMATCH");
});

it("atomically saves a retained same-Trip photo cover and preserves it on metadata-only cold edits", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-photo-cover-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const saved = await f.repo.createTrip(input()),
    photo = randomUUID(),
    ref = tripPhotoCoverRef(photo);
  const before = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  f.sql
    .prepare(
      "INSERT INTO local_trip_photos(account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at) VALUES(?,?,?,'image/jpeg',12,?,'file:///retained/photo.jpg',?)",
    )
    .run(accountA, saved.id, photo, "a".repeat(64), stamp);
  vi.mocked(resolveRetainedTripPhoto).mockReturnValue("file:///retained/photo.jpg");
  const req = {
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "Photo trip" },
  };
  await f.repo.updateMetadata(req, { before: null, after: ref });
  await f.repo.updateMetadata(req, { before: null, after: ref });
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    name: "Photo trip",
    selectedCoverAssetId: null,
    selectedCoverAssetIdRaw: ref,
  });
  expect(
    f.sql
      .prepare(
        "SELECT count(*) n FROM sync_operations WHERE operation_type='UPDATE_TRIP_METADATA'",
      )
      .get(),
  ).toEqual({ n: 1 });
  f.sql.close();
  connections.splice(connections.indexOf(f.sql), 1);
  f = local(path, false);
  const after = { ...req.after, destination: "New destination" };
  vi.mocked(resolveRetainedTripPhoto).mockReturnValue(null);
  await f.repo.updateMetadata({
    operationId: randomUUID(),
    tripId: saved.id,
    before: req.after,
    after,
  });
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    name: "Photo trip",
    destination: "New destination",
    selectedCoverAssetIdRaw: ref,
  });
  // An unchanged preference is also metadata-only; missing bytes do not erase it.
  await f.repo.updateMetadata(
    { operationId: randomUUID(), tripId: saved.id, before: after, after },
    { before: ref, after: ref },
  );
  vi.mocked(resolveRetainedTripPhoto).mockReturnValue("file:///retained/photo.jpg");
  const coverOnly = { operationId: randomUUID(), tripId: saved.id, before: after, after };
  await f.repo.updateMetadata(coverOnly, { before: ref, after: "city" });
  await f.repo.updateMetadata(
    { ...coverOnly, operationId: randomUUID() },
    { before: "city", after: ref },
  );
  await f.repo.updateMetadata(coverOnly, { before: ref, after: "city" });
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetIdRaw).toBe(ref);
});
it("rejects missing, foreign, invalid, revoked or stale photo cover saves without partial metadata", async () => {
  const f = local(),
    saved = await f.repo.createTrip(input()),
    other = await f.repo.createTrip(input());
  const photo = randomUUID(),
    ref = tripPhotoCoverRef(photo),
    before = {
      name: saved.name,
      destination: saved.destination,
      startDate: saved.startDate,
      endDate: saved.endDate,
    };
  const request = () => ({
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "Must not save" },
  });
  f.sql
    .prepare(
      "INSERT INTO local_trip_photos(account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at) VALUES(?,?,?,'image/jpeg',12,?,'file:///retained/photo.jpg',?)",
    )
    .run(accountA, other.id, photo, "a".repeat(64), stamp);
  vi.mocked(resolveRetainedTripPhoto).mockReturnValue("file:///retained/photo.jpg");
  await expect(
    f.repo.updateMetadata(request(), { before: null, after: ref }),
  ).rejects.toThrow("TRIP_COVER_PHOTO_UNAVAILABLE");
  f.sql
    .prepare("UPDATE local_trip_photos SET trip_id=? WHERE account_id=? AND asset_id=?")
    .run(saved.id, accountA, photo);
  vi.mocked(resolveRetainedTripPhoto).mockReturnValue(null);
  await expect(
    f.repo.updateMetadata(request(), { before: null, after: ref }),
  ).rejects.toThrow("TRIP_COVER_PHOTO_UNAVAILABLE");
  await expect(
    f.repo.updateMetadata(request(), { before: null, after: ref.toUpperCase() as never }),
  ).rejects.toThrow("TRIP_COVER_INVALID");
  vi.mocked(resolveRetainedTripPhoto).mockReturnValue("file:///retained/photo.jpg");
  await f.repo.selectBuiltInCover(saved.id, "coast");
  await expect(
    f.repo.updateMetadata(request(), { before: null, after: ref }),
  ).rejects.toThrow("TRIP_COVER_LOCAL_CONFLICT");
  f.sql
    .prepare(
      "INSERT INTO trip_core_scopes(account_id,trip_id,refresh_generation,access_revision,revoked) VALUES(?,?,1,1,1)",
    )
    .run(accountA, saved.id);
  await expect(
    f.repo.updateMetadata(request(), { before: "coast", after: ref }),
  ).rejects.toThrow("TRIP_COVER_PHOTO_UNAVAILABLE");
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    ...before,
    selectedCoverAssetIdRaw: "coast",
  });
  expect(
    f.sql
      .prepare(
        "SELECT count(*) n FROM sync_operations WHERE operation_type='UPDATE_TRIP_METADATA'",
      )
      .get(),
  ).toEqual({ n: 0 });
  f.switchTo(accountB);
  await expect(
    f.repo.updateMetadata(request(), { before: "coast", after: ref }),
  ).rejects.toThrow("TRIP_METADATA_LOCAL_CREATOR_REQUIRED");
});
it("rolls photo cover and metadata back on queue failure or Account ABA during verification", async () => {
  const f = local(),
    saved = await f.repo.createTrip(input()),
    photo = randomUUID(),
    ref = tripPhotoCoverRef(photo);
  const before = {
    name: saved.name,
    destination: saved.destination,
    startDate: saved.startDate,
    endDate: saved.endDate,
  };
  f.sql
    .prepare(
      "INSERT INTO local_trip_photos(account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at) VALUES(?,?,?,'image/jpeg',12,?,'file:///retained/photo.jpg',?)",
    )
    .run(accountA, saved.id, photo, "a".repeat(64), stamp);
  const req = () => ({
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "Must not save" },
  });
  vi.mocked(resolveRetainedTripPhoto).mockReturnValue("file:///retained/photo.jpg");
  f.failNextQueue();
  await expect(
    f.repo.updateMetadata(req(), { before: null, after: ref }),
  ).rejects.toThrow("QUEUE_WRITE_FAILED");
  vi.mocked(resolveRetainedTripPhoto).mockImplementationOnce(() => {
    f.switchTo(accountB);
    f.switchTo(accountA);
    return "file:///retained/photo.jpg";
  });
  await expect(
    f.repo.updateMetadata(req(), { before: null, after: ref }),
  ).rejects.toThrow("Account changed");
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    ...before,
    selectedCoverAssetIdRaw: null,
  });
});

it("local creator nickname preserves independent identity, strict proof and cold exact replay", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-creator-nickname-"));
  folders.push(folder);
  const path = join(folder, "trip.db");
  let f = local(path);
  const command = { ...input(), creatorDisplayName: "  Kiwi  " };
  await f.repo.createTrip(command);
  const before = f.sql.prepare("SELECT * FROM ledger_members").get();
  expect(before).toMatchObject({ display_name: "Kiwi", role: "owner", status: "local" });
  expect(before?.id).not.toBe(accountA);
  expect(
    f.sql.prepare("SELECT user_id,member_id FROM ledger_actor_context").get(),
  ).toEqual({ user_id: accountA, member_id: before?.id });
  const proof = JSON.parse(
    String(
      f.sql
        .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
        .get(command.operationId)?.payload_json,
    ),
  );
  expect(proof).not.toHaveProperty("creatorDisplayName");
  f.sql.close();
  f = local(path, false);
  await f.repo.createTrip(command);
  await f.repo.createTrip({ ...command, creatorDisplayName: undefined });
  expect(f.sql.prepare("SELECT * FROM ledger_members").get()).toEqual(before);
  await expect(
    f.repo.createTrip({ ...command, creatorDisplayName: "Changed" }),
  ).rejects.toThrow("TRIP_CREATOR_NAME_REPLAY_MISMATCH");
  expect(f.sql.prepare("SELECT * FROM ledger_members").get()).toEqual(before);
});
it("blank nickname uses the existing known name, invalid names and queue errors leave no partial creator", async () => {
  const f = local();
  const repo = createTripRepository(
    f.database,
    async () => accountA,
    f.core,
    () => stamp,
    async () => "Known profile name",
  );
  await repo.createTrip({ ...input(), creatorDisplayName: "  " });
  expect(f.sql.prepare("SELECT display_name FROM ledger_members").get()).toEqual({
    display_name: "Known profile name",
  });
  const bad = local();
  await expect(
    bad.repo.createTrip({ ...input(), creatorDisplayName: "x".repeat(257) }),
  ).rejects.toThrow("TRIP_CREATOR_NAME_INVALID");
  bad.failNextQueue();
  await expect(
    bad.repo.createTrip({ ...input(), creatorDisplayName: "Kiwi" }),
  ).rejects.toThrow();
  for (const table of [
    "local_trip_containers",
    "local_trip_ledger_bindings",
    "ledger_members",
    "ledger_actor_context",
    "sync_operations",
  ])
    expect(bad.sql.prepare(`SELECT count(*) n FROM ${table}`).get()?.n).toBe(0);
  const missing = local();
  const unknown = createTripRepository(
    missing.database,
    async () => accountA,
    missing.core,
    () => stamp,
    async () => "",
  );
  const anonymous = await unknown.createTrip(input());
  expect(anonymous.id).toBeTruthy();
  expect(missing.sql.prepare("SELECT display_name FROM ledger_members").get()).toEqual({
    display_name: "",
  });
  expect(missing.sql.prepare("SELECT count(*) n FROM ledger_members").get()?.n).toBe(1);
});
it("a late profile result after Account change cannot create even an explicitly nicknamed creator", async () => {
  const f = local();
  let active = accountA;
  const repo = createTripRepository(
    f.database,
    async () => active,
    f.core,
    () => stamp,
    async () => {
      active = accountB;
      advanceAccountGeneration();
      return "Known";
    },
  );
  await expect(
    repo.createTrip({ ...input(), creatorDisplayName: "Kiwi" }),
  ).rejects.toThrow("Account changed");
  expect(f.sql.prepare("SELECT count(*) n FROM local_trip_containers").get()?.n).toBe(0);
  expect(f.sql.prepare("SELECT count(*) n FROM ledger_members").get()?.n).toBe(0);
});

it("ordered destinations save atomically, cold read and exact replay without Hosted claims", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-destinations-"));
  folders.push(folder);
  const path = join(folder, "trip.sqlite"),
    f = local(path),
    request = {
      ...input(),
      destinations: [
        {
          destinationId: randomUUID(),
          displayLabel: "Tokyo",
          source: "APPLE_PLACE_ID" as const,
          provider: "apple" as const,
          providerPlaceId: "apple.real.tokyo",
        },
        {
          destinationId: randomUUID(),
          displayLabel: "  ".trim() + "Kyoto custom",
          source: "MANUAL" as const,
        },
      ],
    };
  const created = await f.repo.createTrip(request);
  expect(created.destinations?.map((x) => x.ordinal)).toEqual([0, 1]);
  expect(created.destinations?.map((x) => x.destinationId)).toEqual(
    request.destinations.map((x) => x.destinationId),
  );
  expect(
    JSON.parse(
      String(
        f.sql
          .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
          .get(request.operationId)!.payload_json,
      ),
    ),
  ).not.toHaveProperty("destinations");
  const cold = local(path, false);
  expect((await cold.repo.getTrip(request.tripId))?.destinations).toEqual(
    created.destinations,
  );
  expect((await cold.repo.listTrips())[0].destinations).toEqual(created.destinations);
  await expect(cold.repo.createTrip(request)).resolves.toMatchObject({
    destinations: created.destinations,
  });
  const { destinations: _destinations, ...omitted } = request;
  await expect(cold.repo.createTrip(omitted)).resolves.toMatchObject({
    destinations: created.destinations,
  });
  await expect(
    cold.repo.createTrip({
      ...request,
      destinations: [...request.destinations].reverse(),
    }),
  ).rejects.toThrow("TRIP_DESTINATIONS_REPLAY_MISMATCH");
  await expect(cold.repo.createTrip({ ...request, destinations: [] })).rejects.toThrow(
    "TRIP_DESTINATIONS_REPLAY_MISMATCH",
  );
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM local_trip_destinations").get()!.n,
  ).toBe(2);
  cold.switchTo(accountB);
  expect(await cold.repo.getTrip(request.tripId)).toBeNull();
  expect(await cold.repo.listTrips()).toEqual([]);
});

it("destinations reject false identity, duplicates and unapproved MapData before writes", async () => {
  const f = local(),
    manual = {
      destinationId: randomUUID(),
      displayLabel: "Kyoto",
      source: "MANUAL" as const,
    };
  for (const destinations of [
    [manual, { ...manual, destinationId: randomUUID(), displayLabel: "ＫＹＯＴＯ" }],
    [manual, { ...manual, displayLabel: "Tokyo" }],
    Array.from({ length: 21 }, (_, n) => ({
      ...manual,
      destinationId: randomUUID(),
      displayLabel: String(n),
    })),
    [{ ...manual, address: "provider snapshot" }],
    [
      {
        destinationId: randomUUID(),
        displayLabel: "Tokyo",
        source: "APPLE_PLACE_ID",
        provider: "apple",
        providerPlaceId: "",
      },
    ],
  ])
    await expect(
      f.repo.createTrip({ ...input(), destinations } as never),
    ).rejects.toThrow();
  expect(f.sql.prepare("SELECT count(*) AS n FROM local_trip_containers").get()!.n).toBe(
    0,
  );
  const request = {
    ...input(),
    destinations: [
      manual,
      {
        destinationId: randomUUID(),
        displayLabel: "Kyoto",
        source: "APPLE_PLACE_ID" as const,
        provider: "apple" as const,
        providerPlaceId: "real-1",
      },
      {
        destinationId: randomUUID(),
        displayLabel: "Kyoto",
        source: "APPLE_PLACE_ID" as const,
        provider: "apple" as const,
        providerPlaceId: "real-2",
      },
    ],
  };
  await expect(f.repo.createTrip(request)).resolves.toMatchObject({
    destinations: expect.any(Array),
  });
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM local_trip_destinations").get()!.n,
  ).toBe(3);
});

it("destination failure rolls back Trip, creator, persons and queue without changing existing data", async () => {
  const f = local(),
    existing = await f.repo.createTrip(input());
  const before = f.sql.prepare("SELECT count(*) AS n FROM ledger_members").get()!.n;
  f.sql.exec(
    "CREATE TRIGGER destination_fault BEFORE INSERT ON local_trip_destinations BEGIN SELECT RAISE(ABORT,'DESTINATION_FAULT'); END",
  );
  await expect(
    f.repo.createTrip({
      ...input(),
      creatorDisplayName: "Me",
      destinations: [
        { destinationId: randomUUID(), displayLabel: "Tokyo", source: "MANUAL" },
      ],
    }),
  ).rejects.toThrow("DESTINATION_FAULT");
  expect(f.sql.prepare("SELECT count(*) AS n FROM local_trip_containers").get()!.n).toBe(
    1,
  );
  expect(f.sql.prepare("SELECT count(*) AS n FROM ledger_members").get()!.n).toBe(before);
  expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()!.n).toBe(1);
  expect(await f.repo.getTrip(existing.id)).toMatchObject({
    id: existing.id,
    destinations: [],
  });
});

it("destinations reject create replay retrofit and malformed stored claims", async () => {
  const f = local(),
    request = input();
  await f.repo.createTrip(request);
  await expect(
    f.repo.createTrip({
      ...request,
      destinations: [
        { destinationId: randomUUID(), displayLabel: "Tokyo", source: "MANUAL" },
      ],
    }),
  ).rejects.toThrow("TRIP_DESTINATIONS_REPLAY_MISMATCH");
  const other = {
    ...input(),
    destinations: [
      { destinationId: randomUUID(), displayLabel: "Kyoto", source: "MANUAL" as const },
    ],
  };
  await f.repo.createTrip(other);
  f.sql
    .prepare(
      "UPDATE local_trip_destinations SET manual_claim='incorrect' WHERE trip_id=?",
    )
    .run(other.tripId);
  await expect(f.repo.getTrip(other.tripId)).rejects.toThrow(
    "TRIP_DESTINATIONS_STORED_INVALID",
  );
  await expect(f.repo.listTrips()).rejects.toThrow("TRIP_DESTINATIONS_STORED_INVALID");
});

const manualDestination = (label: string) => ({
  destinationId: randomUUID(),
  displayLabel: label,
  source: "MANUAL" as const,
});
const metadataOf = (trip: {
  name: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
}) => ({
  name: trip.name,
  destination: trip.destination,
  startDate: trip.startDate,
  endDate: trip.endDate,
});
it("local destination edits preserve ordered identity/timestamps, cold reads and original Create replay", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-destination-edit-"));
  folders.push(folder);
  const path = join(folder, "trip.sqlite");
  let f = local(path);
  const original = {
    ...input(),
    destinations: [
      manualDestination("Tokyo"),
      {
        destinationId: randomUUID(),
        displayLabel: "Sydney",
        source: "APPLE_PLACE_ID" as const,
        provider: "apple" as const,
        providerPlaceId: "real-sydney",
      },
    ],
  };
  const saved = await f.repo.createTrip(original),
    before = metadataOf(saved);
  const initialTimestamp = f.sql
    .prepare("SELECT created_at FROM local_trip_destinations WHERE destination_id=?")
    .get(original.destinations[1].destinationId)!.created_at;
  const change = {
    operationId: randomUUID(),
    before: original.destinations,
    after: [original.destinations[1], manualDestination("Kyoto")],
  };
  const request = {
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "Edited", destination: null },
  };
  await f.repo.updateMetadata(request, { before: null, after: "city" }, change);
  const edited = await f.repo.getTrip(saved.id);
  expect(edited).toMatchObject({
    name: "Edited",
    destination: null,
    selectedCoverAssetId: "city",
    destinations: change.after.map((item, ordinal) => ({ ...item, ordinal })),
  });
  expect(
    f.sql
      .prepare("SELECT created_at FROM local_trip_destinations WHERE destination_id=?")
      .get(original.destinations[1].destinationId)!.created_at,
  ).toBe(initialTimestamp);
  const hosted = JSON.parse(
    f.sql
      .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
      .get(request.operationId)!.payload_json as string,
  );
  expect(hosted).toEqual(request);
  expect(hosted).not.toHaveProperty("destinations");
  const receipt = f.sql
    .prepare("SELECT * FROM sync_operations WHERE id=?")
    .get(change.operationId)!;
  expect(receipt).toMatchObject({
    status: "COMPLETED",
    entity_type: "TRIP_LOCAL_PREFERENCE",
    operation_type: "TRIP_DESTINATIONS_LOCAL_SAVE",
  });
  f.sql.close();
  connections.splice(connections.indexOf(f.sql), 1);
  f = local(path, false);
  await f.repo.updateMetadata(request, { before: null, after: "city" }, change);
  expect(await f.repo.getTrip(saved.id)).toEqual(edited);
  expect(await f.repo.createTrip(original)).toMatchObject({
    destinations: edited!.destinations,
  });
  expect(
    f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='TRIP_DESTINATIONS_LOCAL_SAVE'",
      )
      .get()!.n,
  ).toBe(1);
  await expect(
    f.repo.updateMetadata(request, undefined, { ...change, after: [] }),
  ).rejects.toThrow("REUSE_MISMATCH");
});
it("destination CAS, identity, permissions and queue errors roll back metadata, cover, tags and receipt", async () => {
  const f = local(),
    original = { ...input(), destinations: [manualDestination("Tokyo")] };
  const saved = await f.repo.createTrip(original),
    before = metadataOf(saved);
  const req = () => ({
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "Should rollback", destination: null },
  });
  const change = () => ({
    operationId: randomUUID(),
    before: original.destinations,
    after: [manualDestination("Kyoto")],
  });
  await expect(
    f.repo.updateMetadata(req(), undefined, { ...change(), before: [] }),
  ).rejects.toThrow("LOCAL_CONFLICT");
  await expect(
    f.repo.updateMetadata(req(), undefined, {
      ...change(),
      after: [
        {
          destinationId: original.destinations[0].destinationId,
          displayLabel: "Tokyo",
          source: "APPLE_PLACE_ID",
          provider: "apple",
          providerPlaceId: "real",
        },
      ],
    }),
  ).rejects.toThrow("IDENTITY_MISMATCH");
  f.failNextQueue();
  await expect(
    f.repo.updateMetadata(req(), { before: null, after: "city" }, change()),
  ).rejects.toThrow("QUEUE_WRITE_FAILED");
  expect(await f.repo.getTrip(saved.id)).toEqual(saved);
  expect(
    f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='TRIP_DESTINATIONS_LOCAL_SAVE'",
      )
      .get()!.n,
  ).toBe(0);
  f.switchTo(accountB);
  await expect(f.repo.updateMetadata(req(), undefined, change())).rejects.toThrow(
    "LOCAL_CREATOR_REQUIRED",
  );
});
it("destination-only receipts survive requeue and original Create replay rejects broken/tampered history", async () => {
  const f = local(),
    original = {
      ...input(),
      destination: null,
      destinations: [manualDestination("Tokyo")],
    };
  const saved = await f.repo.createTrip(original),
    before = metadataOf(saved);
  const first = {
    operationId: randomUUID(),
    before: original.destinations,
    after: [manualDestination("Kyoto")],
  };
  await f.repo.updateMetadata(
    { operationId: randomUUID(), tripId: saved.id, before, after: before },
    undefined,
    first,
  );
  const second = {
    operationId: randomUUID(),
    before: first.after,
    after: [manualDestination("Nelson")],
  };
  await f.repo.updateMetadata(
    { operationId: randomUUID(), tripId: saved.id, before, after: before },
    undefined,
    second,
  );
  expect(await f.repo.createTrip(original)).toMatchObject({
    destinations: second.after.map((item, ordinal) => ({ ...item, ordinal })),
  });
  await f.queue.markPending(second.operationId);
  await f.queue.markRetryable(second.operationId, new Error("network"), stamp);
  await f.queue.markFailed(second.operationId, new Error("bad"));
  await f.queue.markProcessing(second.operationId);
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(second.operationId)!.status,
  ).toBe("COMPLETED");
  f.sql
    .prepare("UPDATE sync_operations SET status='PENDING' WHERE id=?")
    .run(second.operationId);
  expect((await f.queue.listPending()).some((x) => x.id === second.operationId)).toBe(
    false,
  );
  expect(await f.queue.claim(second.operationId)).toBe(false);
  await expect(f.repo.createTrip(original)).rejects.toThrow("REPLAY_MISMATCH");
  f.sql
    .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
    .run(second.operationId);
  f.sql.prepare("DELETE FROM sync_operations WHERE id=?").run(first.operationId);
  await expect(f.repo.createTrip(original)).rejects.toThrow("REPLAY_MISMATCH");
});
it("destination edits fail closed after receipt tampering and rollback later metadata/cover failures", async () => {
  const f = local(),
    original = { ...input(), destinations: [manualDestination("Tokyo")] };
  const saved = await f.repo.createTrip(original),
    before = metadataOf(saved);
  const change = {
    operationId: randomUUID(),
    before: original.destinations,
    after: [manualDestination("Kyoto")],
  };
  const request = {
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "Changed", destination: null },
  };
  // Failure after all three draft fields have entered the transaction must preserve all old objects.
  f.sql.exec(
    "CREATE TRIGGER edit_failure BEFORE UPDATE OF name ON local_trip_containers BEGIN SELECT RAISE(ABORT,'EDIT_FAILED'); END",
  );
  await expect(
    f.repo.updateMetadata(request, { before: null, after: "city" }, change),
  ).rejects.toThrow("EDIT_FAILED");
  expect(await f.repo.getTrip(saved.id)).toEqual(saved);
  expect(
    f.sql
      .prepare("SELECT count(*) AS n FROM sync_operations WHERE id=? OR id=?")
      .get(request.operationId, change.operationId)!.n,
  ).toBe(0);
  f.sql.exec("DROP TRIGGER edit_failure");
  await f.repo.updateMetadata(request, { before: null, after: "city" }, change);
  const row = f.sql
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(change.operationId)!;
  const payload = JSON.parse(row.payload_json as string);
  payload.destinations.after[0].displayLabel = "Tampered";
  f.sql
    .prepare("UPDATE sync_operations SET payload_json=? WHERE id=?")
    .run(JSON.stringify(payload), change.operationId);
  await expect(f.repo.createTrip(original)).rejects.toThrow("REPLAY_MISMATCH");
  const current = metadataOf((await f.repo.getTrip(saved.id))!);
  await expect(
    f.repo.updateMetadata(
      { operationId: randomUUID(), tripId: saved.id, before: current, after: current },
      undefined,
      { operationId: randomUUID(), before: change.after, after: [] },
    ),
  ).rejects.toThrow("REPLAY_MISMATCH");
});
it("removing all Tags clears legacy fallback only when explicitly submitted, and rejects stale concurrent lists", async () => {
  const f = local(),
    original = { ...input(), destination: "Legacy Nelson" };
  const saved = await f.repo.createTrip(original),
    before = metadataOf(saved);
  await f.repo.updateMetadata({
    operationId: randomUUID(),
    tripId: saved.id,
    before,
    after: { ...before, name: "Name only" },
  });
  let current = (await f.repo.getTrip(saved.id))!;
  expect(current.destination).toBe("Legacy Nelson");
  expect(current.destinations).toEqual([]);
  const metadata = metadataOf(current),
    first = {
      operationId: randomUUID(),
      before: [],
      after: [manualDestination("Sydney")],
    };
  await f.repo.updateMetadata(
    {
      operationId: randomUUID(),
      tripId: saved.id,
      before: metadata,
      after: { ...metadata, destination: null },
    },
    undefined,
    first,
  );
  current = (await f.repo.getTrip(saved.id))!;
  const next = metadataOf(current);
  await expect(
    f.repo.updateMetadata(
      { operationId: randomUUID(), tripId: saved.id, before: next, after: next },
      undefined,
      {
        operationId: randomUUID(),
        before: [],
        after: [manualDestination("Wrong stale")],
      },
    ),
  ).rejects.toThrow("LOCAL_CONFLICT");
  await f.repo.updateMetadata(
    { operationId: randomUUID(), tripId: saved.id, before: next, after: next },
    undefined,
    { operationId: randomUUID(), before: first.after, after: [] },
  );
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    destination: null,
    destinations: [],
  });
  expect(await f.repo.createTrip(original)).toMatchObject({
    destination: null,
    destinations: [],
  });
});

it("explicit removal of the only legacy scalar Tag persists an empty list and cannot resurrect on Create replay", async () => {
  const f = local(),
    original = { ...input(), destination: "Nelson" };
  const saved = await f.repo.createTrip(original),
    before = metadataOf(saved);
  await f.repo.updateMetadata(
    {
      operationId: randomUUID(),
      tripId: saved.id,
      before,
      after: { ...before, destination: null },
    },
    undefined,
    { operationId: randomUUID(), before: [], after: [] },
  );
  expect(await f.repo.getTrip(saved.id)).toMatchObject({
    destination: null,
    destinations: [],
  });
  expect(await f.repo.createTrip(original)).toMatchObject({
    destination: null,
    destinations: [],
  });
});
