import { expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { readTripPreparation } from "./tripPreparationRepository";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import { applyCoreCommand, emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
it("Preparation normal Repository uses local creator empty state, installed canonical certificates, cold reopen and tap authority", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-journey-snapshot-")),
    path = join(folder, "owned.sqlite");
  let sql = new DatabaseSync(path),
    active = randomUUID();
  const accountId = active,
    tripId = randomUUID(),
    itemId = randomUUID();
  const actor = {
    accountId,
    tripId,
    active: true,
    canManageShared: false,
    personId: null,
    personIds: [],
  };
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const database = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...params: unknown[]) {
      return (sql.prepare(query).get(...(params as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...params: unknown[]) {
      return sql.prepare(query).all(...(params as never[])) as T[];
    },
    async runAsync(query: string, ...params: unknown[]) {
      return sql.prepare(query).run(...(params as never[])) as never;
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
  try {
    sql.exec("PRAGMA foreign_keys=ON");
    for (const migration of migrations) sql.exec(migration.sql);
    vi.mocked(requireActiveUserId).mockImplementation(async () => active);
    vi.mocked(readInitializedDatabase).mockResolvedValue(database as never);
    const core = createTripCoreV2Repository(
      database,
      async () => active,
      hash,
      () => "2027-02-01T00:00:00Z",
    );
    const trips = createTripRepository(database, async () => active, core);
    await trips.createTrip({
      operationId: randomUUID(),
      tripId,
      name: "Contract Past Trip",
      startDate: "2027-01-01",
      endDate: "2027-01-28",
    });
    const reader = await readTripPreparation();
    expect((await reader.read(tripId))?.canPlan).toBe(true);
    expect((await reader.read(tripId))?.preparation).toEqual({
      itemCount: 0,
      counts: [],
      recent: [],
    });
    sql
      .prepare("DELETE FROM local_trip_ledger_bindings WHERE account_id=? AND trip_id=?")
      .run(accountId, tripId);
    expect((await reader.read(tripId))?.canPlan).toBe(false);
    expect(await reader.read(randomUUID())).toBeNull();
    let graph = emptyCoreGraph();
    for (let index = 0; index < 28; index++) {
      const id = index === 0 ? itemId : randomUUID();
      graph = applyCoreCommand(
        graph,
        {
          contractVersion: 2,
          intentVersion: 2,
          operationId: randomUUID(),
          tripId,
          command: "CREATE_ITEM",
          target: { kind: "ITEM", id },
          baseVector: [{ kind: "ITEM", id, revision: null }],
          admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
          payload: {
            family: index % 2 ? "P6" : "P1",
            core: { title: `Contract Activity ${index}` },
            schedule: {
              start: coreDateBoundary(`2027-01-${String(index + 1).padStart(2, "0")}`),
            },
            ...coreDefaults("member"),
          },
        },
        actor,
        "2027-01-01T00:00:00Z",
      ).graph;
    }
    const foreignAccount = randomUUID(),
      foreignId = randomUUID();
    graph = applyCoreCommand(
      graph,
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id: foreignId },
        baseVector: [{ kind: "ITEM", id: foreignId, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          family: "P1",
          core: { title: "Other Account private activity" },
          schedule: { start: coreDateBoundary("2027-01-01") },
          ...coreDefaults("member"),
        },
      },
      { ...actor, accountId: foreignAccount },
      "2027-01-01T00:00:00Z",
    ).graph;
    const epoch = randomUUID(),
      bundle = await buildCoreActorCollection(
        graph,
        actor,
        { epoch, revision: 1, accessRevision: 1, generatedAt: "2027-01-01T00:00:00Z" },
        [],
        hash,
      ),
      ctx = await core.captureContext(tripId);
    await core.install(await core.beginRefresh(ctx, 1), bundle.manifest, bundle.pages);
    sql.close();
    sql = new DatabaseSync(path);
    sql.exec("PRAGMA foreign_keys=ON");
    const read = await reader.read(tripId);
    expect(read?.canPlan).toBe(false);
    expect(read?.preparation.itemCount).toBe(28);
    expect(read?.preparation.counts).toEqual([
      { family: "P1", count: 14 },
      { family: "P6", count: 14 },
    ]);
    expect(read?.preparation.recent).toHaveLength(3);
    const recentId = read!.preparation.recent[0].item.itemId;
    expect((await reader.resolveItem(tripId, recentId, epoch))?.item.itemId).toBe(
      recentId,
    );

    const pendingId = randomUUID();
    await core.enqueue(ctx, {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: pendingId },
      baseVector: [{ kind: "ITEM", id: pendingId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P1",
        core: { title: "Pending alongside accepted" },
        schedule: { start: coreDateBoundary("2027-01-01") },
        ...coreDefaults("member"),
      },
    });
    const mixed = (await reader.read(tripId))!;
    expect(mixed.sourceToken?.kind).toBe("MIXED");
    expect(mixed.epoch).toBe(epoch);
    expect(mixed.preparation.itemCount).toBe(29);
    expect(mixed.preparation.recent[0].item.itemId).toBe(pendingId);
    expect(await reader.resolveItem(tripId, pendingId, epoch)).toBeNull();
    expect(
      (await reader.resolveItemFromSource(tripId, pendingId, mixed.sourceToken!))?.item
        .localState,
    ).toBe("PENDING");
    expect(
      await reader.resolveItemFromSource(tripId, foreignId, mixed.sourceToken!),
    ).toBeNull();
    await core.enqueue(ctx, {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId,
      command: "SET_ITEM_STATUS",
      target: { kind: "ITEM", id: recentId },
      baseVector: [{ kind: "ITEM", id: recentId, revision: 1 }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: { status: "skipped" },
    });
    const cancelled = (await reader.read(tripId))!;
    expect(cancelled.preparation.itemCount).toBe(28);
    expect(
      cancelled.preparation.recent.some(({ item }) => item.itemId === recentId),
    ).toBe(false);
    expect(
      await reader.resolveItemFromSource(tripId, pendingId, mixed.sourceToken!),
    ).toBeNull();

    expect(await reader.resolveItem(tripId, foreignId, epoch)).toBeNull();
    expect(
      read?.preparation.recent.some((entry) => entry.item.itemId === foreignId),
    ).toBe(false);
    expect(await reader.resolveItem(tripId, randomUUID(), epoch)).toBeNull();
    expect(await reader.resolveItem(tripId, itemId, randomUUID())).toBeNull();
    active = randomUUID();
    expect(await reader.read(tripId)).toBeNull();
    expect(await reader.resolveItem(tripId, itemId, epoch)).toBeNull();
    active = accountId;
    await core.revoke(await core.captureContext(tripId), 2);
    await expect(reader.read(tripId)).rejects.toThrow("CORE_ACCESS_REVOKED");
    await expect(reader.resolveItem(tripId, itemId, epoch)).rejects.toThrow(
      "CORE_ACCESS_REVOKED",
    );
  } finally {
    sql.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

it("normal pending P1 Preparation survives cold read and fences tap by its real manual source", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-preparation-pending-"));
  const path = join(folder, "owned.sqlite");
  let sql = new DatabaseSync(path);
  const accountId = randomUUID();
  let account = accountId;
  let aba = false;
  const tripId = randomUUID(),
    itemId = randomUUID();
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const database = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      const row = sql.prepare(query).get(...(args as never[])) ?? null;
      if (aba && query.includes("FROM local_trip_containers")) {
        aba = false;
        advanceAccountGeneration();
        advanceAccountGeneration();
      }
      return row as T | null;
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
  try {
    for (const migration of migrations) sql.exec(migration.sql);
    vi.mocked(requireActiveUserId).mockImplementation(async () => account);
    vi.mocked(readInitializedDatabase).mockResolvedValue(database as never);
    const core = createTripCoreV2Repository(database, async () => account, hash);
    const trips = createTripRepository(database, async () => account, core);
    await trips.createTrip({
      operationId: randomUUID(),
      tripId,
      name: "Pending plan",
      startDate: "2026-12-30",
      endDate: "2027-01-03",
    });
    await trips.addItem(tripId, {
      operationId: randomUUID(),
      itemId,
      family: "P1",
      title: "Saved walk",
      startDate: "2026-10-20",
    });
    let reader = await readTripPreparation();
    const first = (await reader.read(tripId))!;
    expect(first.epoch).toBeNull();
    expect(first.sourceToken?.kind).toBe("LOCAL_MANUAL");
    expect(first.preparation).toMatchObject({
      itemCount: 1,
      counts: [{ family: "P1", count: 1 }],
      recent: [{ item: { itemId, localState: "PENDING", title: "Saved walk" } }],
    });
    expect(first.preparation.recent[0].createdAt).toBeTruthy();
    const source = first.sourceToken!;
    expect(await reader.resolveItem(tripId, itemId, "not-an-epoch")).toBeNull();
    expect(
      (await reader.resolveItemFromSource(tripId, itemId, source))?.item.itemId,
    ).toBe(itemId);
    const before = sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
    sql.close();
    sql = new DatabaseSync(path);
    reader = await readTripPreparation();
    expect((await reader.read(tripId))?.sourceToken).toEqual(source);
    expect(
      (await reader.resolveItemFromSource(tripId, itemId, source))?.item.localState,
    ).toBe("PENDING");
    expect(sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
      before,
    );
    expect((await trips.getTrip(tripId))?.startDate).toBe("2026-12-30");
    expect(
      sql.prepare("SELECT COUNT(*) n FROM trip_core_read_certificates").get()!.n,
    ).toBe(0);
    await trips.addItem(tripId, {
      operationId: randomUUID(),
      itemId: randomUUID(),
      family: "P3",
      title: "Stay",
      startDate: "2026-12-30",
      endDate: "2027-01-03",
    });
    expect((await reader.read(tripId))?.preparation.itemCount).toBe(2);
    expect(await reader.resolveItemFromSource(tripId, itemId, source)).toBeNull();
    const current = (await reader.read(tripId))!.sourceToken!;
    account = randomUUID();
    advanceAccountGeneration();
    expect(await reader.read(tripId)).toBeNull();
    account = accountId;
    advanceAccountGeneration();
    expect(await reader.resolveItemFromSource(tripId, itemId, current)).toBeNull();
    aba = true;
    await expect(reader.read(tripId)).rejects.toThrow();
    await core.revoke(await core.captureContext(tripId), 1);
    await expect(reader.read(tripId)).rejects.toThrow("CORE_ACCESS_REVOKED");
  } finally {
    sql.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
