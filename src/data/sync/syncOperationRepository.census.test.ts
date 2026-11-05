import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { readUnfinishedSyncQueueCensus, type SyncOperationStatus } from "./syncOperationRepository";

vi.mock("./ledgerQueueActivity", () => ({ announceLedgerQueueWorkAvailable: vi.fn() }));
const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture(initialize = true) {
  const sql = new DatabaseSync(":memory:");
  databases.push(sql);
  if (initialize) for (const migration of migrations) sql.exec(migration.sql);
  const getAllAsync = vi.fn(async (query: string) => sql.prepare(query).all());
  const database = { getAllAsync } as Parameters<typeof readUnfinishedSyncQueueCensus>[0];
  return { sql, database, getAllAsync };
}
function add(sql: DatabaseSync, id: number, status: SyncOperationStatus, unknown = false) {
  sql.prepare(`INSERT INTO sync_operations
    (id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at,owner_user_id,failure_category)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    `op-${id}`, "itinerary", `item-${id}`, "CREATE_ITINERARY", `key-${id}`,
    '{"private":"must not be projected"}', status, "2026-11-05", "2026-11-05",
    id % 2 ? "other-account" : "current-account", unknown ? "UNKNOWN" : null,
  );
}

describe("all-account ordinary Queue metadata census", () => {
  it("counts >51 rows, other accounts and all seven actual statuses without reading identities or mutating", async () => {
    const { sql, database, getAllAsync } = fixture();
    for (let i = 0; i < 60; i++) add(sql, i, "PENDING");
    const rest: SyncOperationStatus[] = ["PROCESSING", "RETRYABLE", "DEPENDENCY_BLOCKED", "FAILED", "CONFLICT", "COMPLETED"];
    rest.forEach((status, i) => add(sql, 60 + i, status, true));
    const before = sql.prepare("SELECT total_changes() AS count").get();
    const result = await readUnfinishedSyncQueueCensus(database);
    expect(result).toEqual({
      contractVersion: 1, coverage: "ALL_ACCOUNTS_SYNC_OPERATIONS_ONLY",
      corePendingIntents: "NOT_INCLUDED", sqliteSchemaVersion: "NOT_ASSERTED",
      countsByStatus: { PENDING: 60, PROCESSING: 1, RETRYABLE: 1, DEPENDENCY_BLOCKED: 1, FAILED: 1, CONFLICT: 1, COMPLETED: 1 },
      totalRows: 66, allNonCompletedRows: 65, unknownFailureRows: 6, nonCompletedUnknownFailureRows: 5,
    });
    expect(sql.prepare("SELECT total_changes() AS count").get()).toEqual(before);
    expect(getAllAsync).toHaveBeenCalledTimes(1);
    expect(getAllAsync.mock.calls[0][0]).not.toMatch(/LIMIT|WHERE|payload_json|owner_user_id|\bid\b/i);
    expect(JSON.stringify(result)).not.toMatch(/current-account|other-account|private/);
  });
  it("returns explicit zeros only for a successfully read initialized empty table", async () => {
    const { database } = fixture();
    const result = await readUnfinishedSyncQueueCensus(database);
    expect(result.totalRows).toBe(0);
    expect(Object.values(result.countsByStatus)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(result.corePendingIntents).toBe("NOT_INCLUDED");
  });
  it("does not initialize missing tables or conceal schema/query failures as empty", async () => {
    const { sql, database } = fixture(false);
    await expect(readUnfinishedSyncQueueCensus(database)).rejects.toThrow(/no such table/);
    expect(sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
    sql.exec("CREATE TABLE sync_operations(status TEXT)");
    await expect(readUnfinishedSyncQueueCensus(database)).rejects.toThrow(/no such column/);
    const failure = new Error("driver unavailable");
    await expect(readUnfinishedSyncQueueCensus({ getAllAsync: async () => { throw failure; } })).rejects.toBe(failure);
  });
  it.each([
    [{ status: "UNKNOWN", count: 1, unknownFailures: 0 }],
    [{ status: "PENDING", count: "1", unknownFailures: 0 }],
    [{ status: "PENDING", count: 1, unknownFailures: 2 }],
    [{ status: "PENDING", count: 1, unknownFailures: 0 }, { status: "PENDING", count: 1, unknownFailures: 0 }],
  ])("fails closed on unexpected or malformed driver metadata: %j", async (...rows) => {
    const database = { getAllAsync: async () => rows } as Parameters<typeof readUnfinishedSyncQueueCensus>[0];
    await expect(readUnfinishedSyncQueueCensus(database)).rejects.toThrow("SYNC_QUEUE_CENSUS_INVALID_METADATA");
  });
});
