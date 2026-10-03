import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";

import {
  createExpenseRepository,
  type ExpenseDatabase,
} from "@/data/repositories/expenseRepository";
import { createSyncEngine } from "@/data/sync/syncEngine";
import {
  createSyncOperationRepository,
  type SyncQueueDatabase,
} from "@/data/sync/syncOperationRepository";

// Queue notifications import native entry points that this injected SQLite gate
// does not use. Keep the real repositories, notifications and sync engine.
vi.mock("@/data/db/database", () => ({
  openDatabase: () => {
    throw new Error("This gate must use its injected SQLite database.");
  },
}));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: () => {
    throw new Error("This gate must use its injected active account.");
  },
}));

describe("Account Switching Foundation gate", () => {
  it("isolates A's local row and queue while preserving shared canonical data", async () => {
    const sqlite = new DatabaseSync(":memory:");
    for (const migration of migrations) sqlite.exec(migration.sql);
    sqlite.exec(`
      INSERT INTO expenses (
        id, server_id, trip_id, title, amount_minor, currency_code,
        paid_by_member_id, occurred_at, created_at, updated_at, sync_status,
        sync_version, local_owner_user_id
      ) VALUES (
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
