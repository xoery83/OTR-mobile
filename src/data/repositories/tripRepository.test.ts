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
  await f.repo.selectBuiltInCover(saved.id, "city");
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("city");
  expect((await f.repo.listTrips())[0]?.selectedCoverAssetId).toBe("city");
  await expect(f.repo.selectBuiltInCover(saved.id, "unknown" as "city")).rejects.toThrow(
    "TRIP_COVER_INVALID",
  );
  f.sql.close();
  f = local(path, false);
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("city");
  f.switchTo(accountB);
  expect(await f.repo.getTrip(saved.id)).toBeNull();
  await expect(f.repo.selectBuiltInCover(saved.id, "coast")).rejects.toThrow(
    "TRIP_LOCAL_RECORD_MISSING",
  );
  f.switchTo(accountA);
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("city");
  f.abaNextAccept();
  await expect(f.repo.selectBuiltInCover(saved.id, "mountain")).rejects.toThrow(
    "Account changed",
  );
  expect((await f.repo.getTrip(saved.id))?.selectedCoverAssetId).toBe("city");
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
    "ledger_members",
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
  expect(f.sql.prepare("SELECT count(*) AS n FROM ledger_members").get()?.n).toBe(0);
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
