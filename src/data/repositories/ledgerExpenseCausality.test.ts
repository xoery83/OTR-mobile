import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

import { migrations } from "@/data/db/migrations";
import { createLedgerExpenseSyncWorker } from "@/data/sync/ledgerExpenseSyncWorker";
import { createSyncEngine } from "@/data/sync/syncEngine";
import { createSyncOperationRepository } from "@/data/sync/syncOperationRepository";

import {
  createLedgerExpenseRepository,
  type LedgerExpenseCommand,
  type LedgerExpenseDatabase,
} from "./ledgerExpenseRepository";

const journeyId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations) sqlite.exec(migration.sql);
  sqlite
    .prepare(
      `INSERT INTO ledger_actor_context
       (user_id, journey_id, member_id, role, capabilities_json, updated_at)
       VALUES (?, ?, ?, 'owner', '{}', '2026-09-24T00:00:00Z')`,
    )
    .run(userId, journeyId, memberId);
  const api = {
    async withTransactionAsync(task: () => Promise<void>) {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async runAsync(sql: string, ...args: unknown[]) {
      const result = sqlite.prepare(sql).run(...(args as never[]));
      return { changes: Number(result.changes) } as never;
    },
    async getFirstAsync<T>(sql: string, ...args: unknown[]) {
      return (sqlite.prepare(sql).get(...(args as never[])) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...args: unknown[]) {
      return sqlite.prepare(sql).all(...(args as never[])) as T[];
    },
  } satisfies LedgerExpenseDatabase;
  return { sqlite, api };
}

function command(title: string): LedgerExpenseCommand {
  return {
    journeyId,
    creatorMemberId: memberId,
    payerMemberId: memberId,
    title,
    category: "food",
    occurredAt: "2026-09-24T10:00:00Z",
    economicDate: "2026-09-24",
    original: { minor: 100, currency: "NZD", scale: 2 },
    participants: [{ memberId, displayNameSnapshot: "A", householdIdSnapshot: null }],
    splits: [
      {
        memberId,
        method: "EQUAL_PERSON",
        originalMinor: 100,
        settlementMinor: 100,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: {
      id: "40000000-0000-4000-8000-000000000001",
      policy: "SAME_CURRENCY",
      original: { minor: 100, currency: "NZD", scale: 2 },
      settlement: { minor: 100, currency: "NZD", scale: 2 },
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
    },
    status: "ACCEPTED",
  };
}

describe("Ledger Expense causal queue", () => {
  it("coalesces multiple edits into an unattempted CREATE", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const created = await repository.createExpense(command("original"));
    await repository.updateExpense(created.id, command("edit one"), "edit");
    await repository.updateExpense(created.id, command("edit two"), "edit");

    const rows = sqlite
      .prepare(
        `SELECT operation_type, status, attempt_count, payload_json
         FROM sync_operations WHERE entity_id = ? AND status <> 'COMPLETED'`,
      )
      .all(created.id) as Record<string, string | number>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operation_type: "LEDGER_CREATE_EXPENSE",
      status: "PENDING",
      attempt_count: 0,
    });
    expect(JSON.parse(String(rows[0]!.payload_json)).expense.title).toBe("edit two");
    expect((await repository.getExpense(created.id))?.syncStatus).toBe("PENDING_CREATE");
    sqlite.close();
  });

  it("replays an attempted CREATE unchanged then sends one compacted UPDATE", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const created = await repository.createExpense(command("original"));
    const original = sqlite
      .prepare(
        "SELECT id, idempotency_key, payload_json FROM sync_operations WHERE entity_id = ?",
      )
      .get(created.id) as { id: string; idempotency_key: string; payload_json: string };
    sqlite
      .prepare(
        `UPDATE sync_operations SET status = 'RETRYABLE', attempt_count = 1,
         next_attempt_at = NULL WHERE id = ?`,
      )
      .run(original.id);
    await repository.updateExpense(created.id, command("edit one"), "edit");
    await repository.updateExpense(created.id, command("edit two"), "edit");

    const queued = sqlite
      .prepare(
        `SELECT id, operation_type, idempotency_key, status, attempt_count,
          dependency_operation_id, payload_json
         FROM sync_operations WHERE entity_id = ? ORDER BY rowid`,
      )
      .all(created.id) as Record<string, string | number | null>[];
    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({
      id: original.id,
      idempotency_key: original.idempotency_key,
      status: "RETRYABLE",
      attempt_count: 1,
    });
    expect(queued[0]!.payload_json).toBe(original.payload_json);
    expect(queued[1]).toMatchObject({
      operation_type: "LEDGER_UPDATE_EXPENSE",
      status: "DEPENDENCY_BLOCKED",
      attempt_count: 0,
      dependency_operation_id: original.id,
    });
    expect(JSON.parse(String(queued[1]!.payload_json)).expense.title).toBe("edit two");

    const createExpense = vi.fn(async () => ({
      serverId: "50000000-0000-4000-8000-000000000001",
      revision: 1,
    }));
    const updateExpense = vi.fn(async () => ({
      serverId: "50000000-0000-4000-8000-000000000001",
      revision: 2,
    }));
    await createSyncEngine(
      createSyncOperationRepository(api, async () => userId),
      createLedgerExpenseSyncWorker(repository, {
        createExpense,
        updateExpense,
        deleteExpense: vi.fn(),
        restoreExpense: vi.fn(),
      }),
    ).run("AUTHENTICATED_ONLINE");

    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: original.idempotency_key,
        expense: expect.objectContaining({ title: "original" }),
      }),
    );
    expect(updateExpense).toHaveBeenCalledOnce();
    expect(updateExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        baseRevision: 1,
        expense: expect.objectContaining({ title: "edit two" }),
      }),
    );
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM sync_operations WHERE entity_id = ? AND status <> 'COMPLETED'",
        )
        .get(created.id),
    ).toEqual({ count: 0 });
    expect(await repository.getExpense(created.id)).toMatchObject({
      title: "edit two",
      serverRevision: 2,
      syncStatus: "SYNCED",
    });
    sqlite.close();
  });

  it("does not send or burn attempts for a dependency-blocked edit after restart", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const created = await repository.createExpense(command("original"));
    sqlite
      .prepare(
        `UPDATE sync_operations SET status = 'RETRYABLE', attempt_count = 1,
         next_attempt_at = '2099-01-01T00:00:00Z' WHERE entity_id = ?`,
      )
      .run(created.id);
    await repository.updateExpense(created.id, command("offline edit"), "edit");
    const createExpense = vi.fn();
    const updateExpense = vi.fn();

    await createSyncEngine(
      createSyncOperationRepository(api, async () => userId),
      createLedgerExpenseSyncWorker(
        createLedgerExpenseRepository(api, async () => userId),
        {
          createExpense,
          updateExpense,
          deleteExpense: vi.fn(),
          restoreExpense: vi.fn(),
        },
      ),
    ).run("AUTHENTICATED_ONLINE");

    expect(createExpense).not.toHaveBeenCalled();
    expect(updateExpense).not.toHaveBeenCalled();
    expect(
      sqlite
        .prepare(
          `SELECT status, attempt_count FROM sync_operations
           WHERE entity_id = ? AND operation_type = 'LEDGER_UPDATE_EXPENSE'`,
        )
        .get(created.id),
    ).toEqual({ status: "DEPENDENCY_BLOCKED", attempt_count: 0 });
    sqlite.close();
  });

  it("blocks delete and restore behind an unfinished CREATE", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const created = await repository.createExpense(command("delete restore"));
    sqlite
      .prepare(
        `UPDATE sync_operations SET status = 'RETRYABLE', attempt_count = 1,
         next_attempt_at = '2099-01-01T00:00:00Z' WHERE entity_id = ?`,
      )
      .run(created.id);
    await repository.tombstoneExpense(created.id, "delete");
    await repository.restoreExpense(created.id, "ACCEPTED", "restore");

    expect(
      sqlite
        .prepare(
          `SELECT operation_type, status, attempt_count, dependency_operation_id
           FROM sync_operations WHERE entity_id = ? AND operation_type <> 'LEDGER_CREATE_EXPENSE'
           ORDER BY rowid`,
        )
        .all(created.id),
    ).toEqual([
      {
        operation_type: "LEDGER_DELETE_EXPENSE",
        status: "DEPENDENCY_BLOCKED",
        attempt_count: 0,
        dependency_operation_id: expect.any(String),
      },
      {
        operation_type: "LEDGER_RESTORE_EXPENSE",
        status: "DEPENDENCY_BLOCKED",
        attempt_count: 0,
        dependency_operation_id: expect.any(String),
      },
    ]);
    sqlite.close();
  });

  it("preserves a plain unknown failure as retryable structured diagnostics", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const created = await repository.createExpense(command("unknown failure"));
    await createSyncEngine(
      createSyncOperationRepository(api, async () => userId),
      createLedgerExpenseSyncWorker(repository, {
        createExpense: vi.fn(async () => {
          throw new Error("safe ambiguous response");
        }),
        updateExpense: vi.fn(),
        deleteExpense: vi.fn(),
        restoreExpense: vi.fn(),
      }),
      () => "2099-01-01T00:00:00Z",
    ).run("AUTHENTICATED_ONLINE");

    expect(
      sqlite
        .prepare(
          `SELECT status, attempt_count, failure_category, last_error_code,
            last_error_message, first_failed_at, last_attempt_at
           FROM sync_operations WHERE entity_id = ?`,
        )
        .get(created.id),
    ).toMatchObject({
      status: "RETRYABLE",
      attempt_count: 1,
      failure_category: "UNKNOWN",
      last_error_code: "SYNC_FAILED",
      last_error_message: "safe ambiguous response",
    });
    expect((await repository.getExpense(created.id))?.syncStatus).toBe("PENDING_CREATE");
    sqlite.close();
  });
});
