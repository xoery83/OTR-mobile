import { describe, expect, it } from "vitest";

import type { Expense } from "@/domain/expense/types";

import { createExpenseRepository, type ExpenseDatabase } from "./expenseRepository";

type OperationRow = {
  entityId: string;
  operationType: string;
  status: string;
};

function createInMemoryExpenseDatabase() {
  const expenses: Expense[] = [];
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
      }

      if (sql.includes("INSERT INTO sync_operations")) {
        operations.push({
          entityId: params[3] as string,
          operationType: params[4] as string,
          status: params[8] as string,
        });
      }

      if (sql.includes("SET sync_status = ?")) {
        const [status, , id] = params;
        const expense = expenses.find((entry) => entry.id === id);
        if (expense) expense.syncStatus = status as Expense["syncStatus"];
      }

      if (sql.includes("SET server_id = ?")) {
        const [serverId, status, , id] = params;
        const expense = expenses.find((entry) => entry.id === id);
        if (expense) {
          expense.serverId = serverId as string;
          expense.syncStatus = status as Expense["syncStatus"];
          expense.syncVersion += 1;
        }
      }

      return {} as never;
    },
    async getAllAsync<T>(_sql: string, tripId: unknown) {
      return expenses.filter((expense) => expense.tripId === tripId) as T[];
    },
    async getFirstAsync<T>(_sql: string, id: unknown) {
      return (expenses.find((expense) => expense.id === id) ?? null) as T | null;
    },
  };

  return { database, expenses, operations };
}

describe("expense repository", () => {
  it("persists an integer-minor-unit expense and exactly one global create operation", async () => {
    const { database, expenses, operations } = createInMemoryExpenseDatabase();
    const repository = createExpenseRepository(database);

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
      { entityId: expense.id, operationType: "CREATE_EXPENSE", status: "PENDING" },
    ]);
  });

  it("rehydrates an expense and its pending operation with a new repository instance", async () => {
    const { database, operations } = createInMemoryExpenseDatabase();
    const writer = createExpenseRepository(database);
    const created = await writer.createExpense({
      tripId: "trip-1",
      title: "Hotel",
      amountMinor: 25000,
      currencyCode: "NZD",
    });

    const restartedReader = createExpenseRepository(database);

    await expect(restartedReader.listExpensesForTrip("trip-1")).resolves.toMatchObject([
      { id: created.id, title: "Hotel", syncStatus: "PENDING_CREATE" },
    ]);
    expect(operations).toHaveLength(1);
  });

  it("does not create another local row when an existing expense is retried", async () => {
    const { database, expenses } = createInMemoryExpenseDatabase();
    const repository = createExpenseRepository(database);
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
});
