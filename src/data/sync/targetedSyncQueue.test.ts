import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ApiClientError } from "../api/client";
import { createSyncEngine } from "./syncEngine";
import {
  createSyncOperationRepository,
  type SyncQueueDatabase,
} from "./syncOperationRepository";

vi.mock("./ledgerQueueActivity", () => ({ announceLedgerQueueWorkAvailable: vi.fn() }));
const target = { accountId: "qa", tripId: "new-trip", operationId: "new-op", lastAttemptAt: null };
let directory: string;
let db: DatabaseSync;
let now = "2026-10-23T06:00:00.000Z";
const open = () => {
  db = new DatabaseSync(join(directory, "queue.db"));
  const adapter: SyncQueueDatabase = {
    runAsync: async (sql, ...params) => db.prepare(sql).run(...(params as SQLInputValue[])) as never,
    getAllAsync: async <T>(sql: string, ...params: unknown[]) =>
      db.prepare(sql).all(...(params as SQLInputValue[])) as T[],
  };
  return createSyncOperationRepository(adapter, async () => "qa", () => now, target);
};
function fixture() {
  directory = mkdtempSync(join(tmpdir(), "otr-exact-queue-"));
  now = "2026-10-23T06:00:00.000Z";
  const queue = open();
  db.exec(`CREATE TABLE sync_operations (
    id TEXT PRIMARY KEY,trip_id TEXT,entity_type TEXT,entity_id TEXT,operation_type TEXT,
    idempotency_key TEXT,base_version INTEGER,payload_json TEXT,owner_user_id TEXT,
    status TEXT,attempt_count INTEGER DEFAULT 0,next_attempt_at TEXT,
    last_error_code TEXT,last_error_message TEXT,created_at TEXT,updated_at TEXT,
    claim_owner TEXT,lease_expires_at TEXT,failure_category TEXT,last_attempt_at TEXT,
    first_failed_at TEXT,dependency_operation_id TEXT,last_request_id TEXT
  );`);
  const insert = db.prepare(`INSERT INTO sync_operations
    (id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,created_at,updated_at,dependency_operation_id)
    VALUES (?,?,'TRIP',?,'CREATE_TRIP',?,'{}','qa',?,'before','before',?)`);
  insert.run("new-op", "new-trip", "new-trip", "new-op", "PENDING", null);
  insert.run("old-processing", "old-trip", "old-trip", "old-processing", "PROCESSING", null);
  insert.run("old-parent", "old-trip", "old-trip", "old-parent", "COMPLETED", null);
  insert.run("old-dependent", "old-trip", "old-trip", "old-dependent", "DEPENDENCY_BLOCKED", "old-parent");
  insert.run("other-dependent", "old-trip", "old-trip", "other-dependent", "DEPENDENCY_BLOCKED", "new-op");
  return queue;
}
const history = () => JSON.stringify(db.prepare("SELECT * FROM sync_operations WHERE id<>'new-op' ORDER BY id").all());
afterEach(() => {
  db?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});
it("allows one claimed push and preserves history across retry and actual SQLite reopen", async () => {
  const queue = fixture(), before = history();
  const push = vi.fn().mockRejectedValue(new ApiClientError("Unavailable", "http", 503));
  const engine = createSyncEngine(queue, { push }, () => now, (op) => op.id === target.operationId);
  await engine.run("AUTHENTICATED_ONLINE");
  await engine.run("AUTHENTICATED_ONLINE");
  expect(push).toHaveBeenCalledTimes(1);
  expect(history()).toBe(before);
  expect(db.prepare("SELECT last_attempt_at,attempt_count FROM sync_operations WHERE id='new-op'").get()).toMatchObject({ last_attempt_at: now, attempt_count: 1 });
  db.close();
  const reopened = open();
  await createSyncEngine(reopened, { push }, () => now, (op) => op.id === target.operationId).run("AUTHENTICATED_ONLINE");
  expect(push).toHaveBeenCalledTimes(1);
  expect(history()).toBe(before);
});
it("does not repeat an interrupted claim after cold reopen or touch another operation", async () => {
  const queue = fixture(), before = history();
  expect(await queue.claim("new-op")).toBe(true);
  db.close();
  now = "2026-10-23T06:06:00.000Z";
  const reopened = open();
  await reopened.recoverInterrupted();
  expect(await reopened.listPending()).toEqual([]);
  expect(await reopened.claim("new-op")).toBe(false);
  await expect(reopened.markPending("old-processing")).rejects.toThrow("SYNC_TARGET_MISMATCH");
  expect(history()).toBe(before);
});
it("completes only its selected operation without waking historical dependent rows", async () => {
  const queue = fixture(), before = history();
  const push = vi.fn().mockResolvedValue(undefined);
  await createSyncEngine(queue, { push }, () => now, (op) => op.id === target.operationId).run("AUTHENTICATED_ONLINE");
  expect(push).toHaveBeenCalledTimes(1);
  expect(db.prepare("SELECT status FROM sync_operations WHERE id='new-op'").get()).toMatchObject({ status: "COMPLETED" });
  expect(history()).toBe(before);
});
