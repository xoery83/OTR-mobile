import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

import {
  createExpenseRepository,
  type ExpenseDatabase,
} from "@/data/repositories/expenseRepository";
import { createSyncEngine } from "@/data/sync/syncEngine";
import {
  createSyncOperationRepository,
  type SyncQueueDatabase,
} from "@/data/sync/syncOperationRepository";

describe("Account Switching Foundation gate", () => {
  it("isolates A's local row and queue while preserving shared canonical data", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      CREATE TABLE expenses (
        id TEXT PRIMARY KEY, server_id TEXT, trip_id TEXT, title TEXT,
        amount_minor INTEGER, currency_code TEXT, paid_by_member_id TEXT,
        occurred_at TEXT, created_at TEXT, updated_at TEXT, sync_status TEXT,
        sync_version INTEGER, local_owner_user_id TEXT
      );
      CREATE TABLE sync_operations (
        id TEXT PRIMARY KEY, trip_id TEXT, entity_type TEXT, entity_id TEXT,
        operation_type TEXT, idempotency_key TEXT, base_version INTEGER,
        payload_json TEXT, owner_user_id TEXT, status TEXT, attempt_count INTEGER,
        next_attempt_at TEXT, last_error_message TEXT, claim_owner TEXT,
        lease_expires_at TEXT, created_at TEXT, updated_at TEXT
      );
      INSERT INTO expenses VALUES (
        'shared', 'server-shared', 'trip-1', 'Shared', 500, 'NZD', NULL,
        '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z',
        '2026-09-16T00:00:00.000Z', 'SYNCED', 1, NULL
      );
    `);
    const database = {
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
      async runAsync(sql: string, ...params: unknown[]) {
        const result = sqlite.prepare(sql).run(...(params as never[]));
        return { changes: Number(result.changes) } as never;
      },
      async getAllAsync<T>(sql: string, ...params: unknown[]) {
        return sqlite.prepare(sql).all(...(params as never[])) as T[];
      },
      async getFirstAsync<T>(sql: string, ...params: unknown[]) {
        return (sqlite.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
      },
    } satisfies ExpenseDatabase & SyncQueueDatabase;
    const account = { userId: "user-a" };
    const activeUser = async () => account.userId;
    const expenses = createExpenseRepository(database, activeUser);
    const local = await expenses.createExpense({
      tripId: "trip-1",
      title: "A pending",
      amountMinor: 100,
      currencyCode: "NZD",
    });

    account.userId = "user-b";
    await expect(expenses.listExpensesForTrip("trip-1")).resolves.toMatchObject([
      { id: "shared" },
    ]);
    const push = vi.fn();
    await createSyncEngine(createSyncOperationRepository(database, activeUser), {
      push,
    }).run("AUTHENTICATED_ONLINE");
    expect(push).not.toHaveBeenCalled();

    account.userId = "user-a";
    await expect(expenses.listExpensesForTrip("trip-1")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "shared" }),
        expect.objectContaining({ id: local.id }),
      ]),
    );
    await createSyncEngine(createSyncOperationRepository(database, activeUser), {
      push,
    }).run("AUTHENTICATED_ONLINE");
    expect(push).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "user-a" }));
    sqlite.close();
  });
});
