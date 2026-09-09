import type * as SQLite from "expo-sqlite";

import { createLocalId } from "@/domain/localId";
import type {
  CreateExpenseInput,
  Expense,
  ExpenseSyncStatus,
} from "@/domain/expense/types";

export type ExpenseDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export type ExpenseRepository = {
  createExpense(input: CreateExpenseInput): Promise<Expense>;
  listExpensesForTrip(tripId: string): Promise<Expense[]>;
  getExpense(id: string): Promise<Expense | null>;
  markExpenseSyncing(id: string): Promise<void>;
  markExpenseSynced(id: string, serverId: string): Promise<void>;
  markExpenseFailed(id: string): Promise<void>;
};

const createOperationType = "CREATE_EXPENSE";

function validateInput(input: CreateExpenseInput) {
  if (!input.tripId.trim()) throw new Error("An expense needs a trip.");
  if (!input.title.trim()) throw new Error("An expense needs a title.");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Expense amount must be a positive integer in minor units.");
  }
  if (!/^[A-Z]{3}$/.test(input.currencyCode)) {
    throw new Error("Expense currency must be a three-letter uppercase code.");
  }
}

export function createExpenseRepository(database: ExpenseDatabase): ExpenseRepository {
  return {
    async createExpense(input) {
      validateInput(input);

      const now = new Date().toISOString();
      const expense: Expense = {
        id: createLocalId("expense"),
        serverId: null,
        tripId: input.tripId,
        title: input.title.trim(),
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        paidByMemberId: input.paidByMemberId ?? null,
        occurredAt: input.occurredAt ?? now,
        createdAt: now,
        updatedAt: now,
        syncStatus: "PENDING_CREATE",
        syncVersion: 0,
      };
      const operationId = createLocalId("operation");

      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `INSERT INTO expenses (
            id, server_id, trip_id, title, amount_minor, currency_code,
            paid_by_member_id, occurred_at, created_at, updated_at, sync_status, sync_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          expense.id,
          expense.serverId,
          expense.tripId,
          expense.title,
          expense.amountMinor,
          expense.currencyCode,
          expense.paidByMemberId,
          expense.occurredAt,
          expense.createdAt,
          expense.updatedAt,
          expense.syncStatus,
          expense.syncVersion,
        );

        await database.runAsync(
          `INSERT INTO sync_operations (
            id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
            base_version, payload_json, status, attempt_count, next_attempt_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          operationId,
          expense.tripId,
          "expense",
          expense.id,
          createOperationType,
          operationId,
          null,
          JSON.stringify({ expenseId: expense.id }),
          "PENDING",
          0,
          null,
          now,
          now,
        );
      });

      return expense;
    },

    async listExpensesForTrip(tripId) {
      return database.getAllAsync<Expense>(
        `SELECT
          id,
          server_id AS serverId,
          trip_id AS tripId,
          title,
          amount_minor AS amountMinor,
          currency_code AS currencyCode,
          paid_by_member_id AS paidByMemberId,
          occurred_at AS occurredAt,
          created_at AS createdAt,
          updated_at AS updatedAt,
          sync_status AS syncStatus,
          sync_version AS syncVersion
        FROM expenses
        WHERE trip_id = ?
        ORDER BY created_at DESC`,
        tripId,
      );
    },

    async getExpense(id) {
      return database.getFirstAsync<Expense>(
        `SELECT
          id,
          server_id AS serverId,
          trip_id AS tripId,
          title,
          amount_minor AS amountMinor,
          currency_code AS currencyCode,
          paid_by_member_id AS paidByMemberId,
          occurred_at AS occurredAt,
          created_at AS createdAt,
          updated_at AS updatedAt,
          sync_status AS syncStatus,
          sync_version AS syncVersion
        FROM expenses
        WHERE id = ?`,
        id,
      );
    },

    async markExpenseSyncing(id) {
      await updateSyncStatus(database, id, "SYNCING");
    },

    async markExpenseSynced(id, serverId) {
      await database.runAsync(
        `UPDATE expenses
         SET server_id = ?, sync_status = ?, sync_version = sync_version + 1, updated_at = ?
         WHERE id = ?`,
        serverId,
        "SYNCED",
        new Date().toISOString(),
        id,
      );
    },

    async markExpenseFailed(id) {
      await updateSyncStatus(database, id, "FAILED");
    },
  };
}

async function updateSyncStatus(
  database: ExpenseDatabase,
  id: string,
  status: ExpenseSyncStatus,
) {
  await database.runAsync(
    "UPDATE expenses SET sync_status = ?, updated_at = ? WHERE id = ?",
    status,
    new Date().toISOString(),
    id,
  );
}
