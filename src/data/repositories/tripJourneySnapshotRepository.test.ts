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
import { readTripJourneySnapshot } from "./tripJourneySnapshotRepository";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import { applyCoreCommand, emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
it("normal reader requires installed certificates, counts whole Trip, and rechecks cold/stale/revoked/Account authority at tap", async () => {
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
    const core = createTripCoreV2Repository(database, async () => active, hash);
    const trips = createTripRepository(database, async () => active, core);
    await trips.createTrip({
      operationId: randomUUID(),
      tripId,
      name: "Contract Past Trip",
      startDate: "2027-01-01",
      endDate: "2027-01-28",
    });
    const reader = await readTripJourneySnapshot();
    expect(await reader.read(tripId)).toBeNull();
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
    expect(read?.snapshot).toMatchObject({
      days: 28,
      activities: 28,
      itemCount: 28,
      places: null,
    });
    expect(read?.snapshot.tags).toHaveLength(20);
    expect(read?.candidateDays).toHaveLength(28);
    expect(read?.candidateDays).toContain("2027-01-27");
    const day = await reader.resolveDayContext(tripId, epoch, "2027-01-27", "UTC");
    expect(day?.date).toBe("2027-01-27");
    expect(day?.projection.version).toBe(2);
    expect(day?.projection.query("2027-01-27", "UTC").coreRows).toHaveLength(1);
    expect(
      await reader.resolveDayContext(tripId, randomUUID(), "2027-01-27", "UTC"),
    ).toBeNull();
    expect(await reader.resolveDayContext(tripId, epoch, "2028-01-27", "UTC")).toBeNull();
    await expect(
      reader.resolveDayContext(tripId, epoch, "2027-01-27", ""),
    ).rejects.toThrow("DAY_ZONE_INVALID");

    expect((await reader.resolveItem(tripId, itemId, epoch))?.item.itemId).toBe(itemId);
    expect(await reader.resolveItem(tripId, foreignId, epoch)).toBeNull();
    expect(read?.snapshot.tags.some((tag) => tag.itemId === foreignId)).toBe(false);
    expect(await reader.resolveItem(tripId, randomUUID(), epoch)).toBeNull();
    expect(await reader.resolveItem(tripId, itemId, randomUUID())).toBeNull();
    active = randomUUID();
    expect(await reader.read(tripId)).toBeNull();
    expect(await reader.resolveDayContext(tripId, epoch, "2027-01-27", "UTC")).toBeNull();
    expect(await reader.resolveItem(tripId, itemId, epoch)).toBeNull();
    active = accountId;
    await core.revoke(await core.captureContext(tripId), 2);
    await expect(reader.read(tripId)).rejects.toThrow("CORE_ACCESS_REVOKED");
    await expect(
      reader.resolveDayContext(tripId, epoch, "2027-01-27", "UTC"),
    ).rejects.toThrow("CORE_ACCESS_REVOKED");
    await expect(reader.resolveItem(tripId, itemId, epoch)).rejects.toThrow(
      "CORE_ACCESS_REVOKED",
    );
  } finally {
    sql.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
