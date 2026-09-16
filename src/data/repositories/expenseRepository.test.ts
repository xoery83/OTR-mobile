import { describe, expect, it } from "vitest";

import type { Expense } from "@/domain/expense/types";

import { createExpenseRepository, type ExpenseDatabase } from "./expenseRepository";

type OperationRow = {
  entityId: string;
  operationType: string;
  ownerUserId: string;
  status: string;
};

function createInMemoryExpenseDatabase() {
  const expenses: Expense[] = [];
  const owners = new Map<string, string>();
  const operations: OperationRow[] = [];

  const database: ExpenseDatabase = {
    async withTransactionAsync(task) {
      await task();
    },
    async runAsync(sql, ...params) {
      if (sql.includes("INSERT INTO expenses")) {
        const [
          id,
          serverId,
          tripId,
          title,
          amountMinor,
          currencyCode,
          paidByMemberId,
          occurredAt,
          createdAt,
          updatedAt,
          syncStatus,
          syncVersion,
          ownerUserId,
        ] = params;
        expenses.push({
          id: id as string,
          serverId: serverId as string | null,
          tripId: tripId as string,
          title: title as string,
          amountMinor: amountMinor as number,
          currencyCode: currencyCode as string,
          paidByMemberId: paidByMemberId as string | null,
          occurredAt: occurredAt as string | null,
          createdAt: createdAt as string,
          updatedAt: updatedAt as string,
          syncStatus: syncStatus as Expense["syncStatus"],
          syncVersion: syncVersion as number,
        });
        owners.set(id as string, ownerUserId as string);
      }

      if (sql.includes("INSERT INTO sync_operations")) {
        operations.push({
          entityId: params[3] as string,
          operationType: params[4] as string,
          ownerUserId: params[8] as string,
          status: params[9] as string,
        });
      }

      if (sql.includes("SET sync_status = ?")) {
        const [status, , id] = params;
        const expense = expenses.find((entry) => entry.id === id);
        if (expense) expense.syncStatus = status as Expense["syncStatus"];
      }

      if (sql.includes("SET server_id = ?")) {
        const [serverId, status, version, , id] = params;
        const expense = expenses.find((entry) => entry.id === id);
        if (expense) {
          expense.serverId = serverId as string;
          expense.syncStatus = status as Expense["syncStatus"];
          expense.syncVersion = version as number;
          owners.delete(expense.id);
        }
      }

      return {} as never;
    },
    async getAllAsync<T>(_sql: string, ...params: unknown[]) {
      const [tripId, userId] = params;
      return expenses.filter(
        (expense) =>
          expense.tripId === tripId &&
          (expense.syncStatus === "SYNCED" || owners.get(expense.id) === userId),
      ) as T[];
    },
    async getFirstAsync<T>(_sql: string, ...params: unknown[]) {
      const [id, userId] = params;
      return (expenses.find(
        (expense) =>
          expense.id === id &&
          (expense.syncStatus === "SYNCED" || owners.get(expense.id) === userId),
      ) ?? null) as T | null;
    },
  };

  return { database, expenses, operations };
}

describe("expense repository", () => {
  const userA = async () => "user-a";

  it("persists an integer-minor-unit expense and exactly one global create operation", async () => {
    const { database, expenses, operations } = createInMemoryExpenseDatabase();
    const repository = createExpenseRepository(database, userA);

    const expense = await repository.createExpense({
      tripId: "trip-1",
      title: "Rail ticket",
      amountMinor: 1234,
      currencyCode: "EUR",
    });

    expect(expenses).toMatchObject([
      { id: expense.id, amountMinor: 1234, currencyCode: "EUR", serverId: null },
    ]);
    expect(operations).toEqual([
      {
        entityId: expense.id,
        operationType: "CREATE_EXPENSE",
        ownerUserId: "user-a",
        status: "PENDING",
      },
    ]);
  });

  it("rehydrates an expense and its pending operation with a new repository instance", async () => {
    const { database, operations } = createInMemoryExpenseDatabase();
    const writer = createExpenseRepository(database, userA);
    const created = await writer.createExpense({
      tripId: "trip-1",
      title: "Hotel",
      amountMinor: 25000,
      currencyCode: "NZD",
    });

    const restartedReader = createExpenseRepository(database, userA);

    await expect(restartedReader.listExpensesForTrip("trip-1")).resolves.toMatchObject([
      { id: created.id, title: "Hotel", syncStatus: "PENDING_CREATE" },
    ]);
    expect(operations).toHaveLength(1);
  });

  it("does not create another local row when an existing expense is retried", async () => {
    const { database, expenses } = createInMemoryExpenseDatabase();
    const repository = createExpenseRepository(database, userA);
    const created = await repository.createExpense({
      tripId: "trip-1",
      title: "Lunch",
      amountMinor: 1800,
      currencyCode: "NZD",
    });

    await repository.markExpenseFailed(created.id);
    await repository.markExpenseSyncing(created.id);

    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ id: created.id, syncStatus: "SYNCING" });
  });

  it("hides another account's unconfirmed local expense", async () => {
    const { database } = createInMemoryExpenseDatabase();
    await createExpenseRepository(database, userA).createExpense({
      tripId: "trip-1",
      title: "A only",
      amountMinor: 100,
      currencyCode: "NZD",
    });

    await expect(
      createExpenseRepository(database, async () => "user-b").listExpensesForTrip(
        "trip-1",
      ),
    ).resolves.toEqual([]);
  });
});
