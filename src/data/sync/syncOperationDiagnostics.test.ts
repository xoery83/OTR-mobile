import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { readSyncOperationDiagnostics } from "./syncOperationRepository";
vi.mock("./ledgerQueueActivity", () => ({ announceLedgerQueueWorkAvailable: vi.fn() }));
it("exact Activity reads cover old UNKNOWN beyond 51 rows without leaking another account or mutating", async () => {
  const sql = new DatabaseSync(":memory:");
  try {
    sql.exec(
      "CREATE TABLE sync_operations (id TEXT,entity_type TEXT,operation_type TEXT,status TEXT,failure_category TEXT,updated_at TEXT,owner_user_id TEXT,payload_json TEXT)",
    );
    const insert = sql.prepare("INSERT INTO sync_operations VALUES (?,?,?,?,?,?,?,?)");
    for (let i = 0; i < 120; i++)
      insert.run(
        `op-${i}`,
        "TRIP_CORE_V2",
        "CORE_V2_COMMAND",
        "RETRYABLE",
        "UNKNOWN",
        "2026-11-13",
        i % 2 ? "other-account" : "owner",
        "private",
      );
    const database = {
      getAllAsync: async (query: string, ...args: string[]) =>
        sql.prepare(query).all(...args),
    } as Parameters<typeof readSyncOperationDiagnostics>[0];
    const before = sql.prepare("SELECT total_changes() AS count").get();
    const rows = await readSyncOperationDiagnostics(database, "owner", ["op-0", "op-1"]);
    expect(rows.map((row) => row.id)).toEqual(["op-0"]);
    expect(rows[0].failureCategory).toBe("UNKNOWN");
    expect(JSON.stringify(rows)).not.toContain("private");
    expect(sql.prepare("SELECT total_changes() AS count").get()).toEqual(before);
    expect(await readSyncOperationDiagnostics(database, "owner", [])).toEqual([]);
    expect(await readSyncOperationDiagnostics(database, "owner")).toHaveLength(51);
    await expect(
      readSyncOperationDiagnostics(database, "owner", Array(97).fill("id")),
    ).rejects.toThrow("SYNC_DIAGNOSTIC_SCOPE_LIMIT");
  } finally {
    sql.close();
  }
});
