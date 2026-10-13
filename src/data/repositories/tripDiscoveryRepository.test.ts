import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { captureAccountScope } from "../auth/accountRequestContext";
import { createTripDiscoveryRepository } from "./tripDiscoveryRepository";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));

const accountA = randomUUID();
const accountB = randomUUID();
const idA = randomUUID();
const idB = randomUUID();
const created = "2026-10-13T10:00:00Z";
const remote = (id: string, name: string) => ({
  id,
  name,
  destination: null,
  startDate: null,
  endDate: null,
  createdAt: null,
});

it("caches a complete actor snapshot without inventing a local CREATE, and merges stable pending UUIDs", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-trip-discovery-"));
  const path = join(folder, "data.db");
  let sql = new DatabaseSync(path);
  let account = accountA;
  const identity = async () => account;
  const database = () => ({
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
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
    sql.exec("PRAGMA foreign_keys=ON");
    for (const migration of migrations) sql.exec(migration.sql);
    sql
      .prepare(
        "INSERT INTO local_trip_containers(account_id,id,create_operation_id,name,created_at,updated_at,selected_cover_asset_id) VALUES(?,?,?,?,?,?,?)",
      )
      .run(accountA, idA, randomUUID(), "Local pending", created, created, "city");
    const repo = createTripDiscoveryRepository(database(), identity, () => created);
    const scope = await captureAccountScope(identity);
    await repo.replaceSnapshot(scope, [
      remote(idA, "Remote stale"),
      remote(idB, "Shared Trip"),
    ]);
    expect(await repo.readMerged()).toEqual({
      cachedAt: created,
      trips: [
        {
          id: idA,
          name: "Local pending",
          destination: null,
          startDate: null,
          endDate: null,
          createdAt: created,
          localStatus: "PENDING_CREATE",
          selectedCoverAssetId: "city",
          remoteListed: true,
        },
        {
          ...remote(idB, "Shared Trip"),
          localStatus: null,
          selectedCoverAssetId: null,
          remoteListed: true,
        },
      ],
    });
    expect(sql.prepare("SELECT count(*) AS n FROM sync_operations").get()).toEqual({
      n: 0,
    });
    expect(sql.prepare("SELECT count(*) AS n FROM local_trip_containers").get()).toEqual({
      n: 1,
    });
    account = accountB;
    advanceAccountGeneration();
    expect(await repo.readMerged()).toEqual({ cachedAt: null, trips: [] });
    account = accountA;
    advanceAccountGeneration();
    await expect(repo.replaceSnapshot(scope, [])).rejects.toThrow("Account changed");
    const fresh = await captureAccountScope(identity);
    await expect(
      repo.replaceSnapshot(fresh, [remote(idB, "A"), remote(idB, "B")]),
    ).rejects.toThrow("TRIP_DISCOVERY_DUPLICATE");
    sql.close();
    sql = new DatabaseSync(path);
    expect(
      await createTripDiscoveryRepository(database(), identity).readMerged(),
    ).toMatchObject({
      trips: [
        { id: idA, name: "Local pending", localStatus: "PENDING_CREATE" },
        { id: idB, name: "Shared Trip", localStatus: null },
      ],
    });
    await repo.replaceSnapshot(fresh, []);
    expect(await repo.readMerged()).toMatchObject({
      trips: [{ id: idA, name: "Local pending", remoteListed: false }],
    });
  } finally {
    sql.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
