import type { Expense } from "@/domain/expense/types";

import type { ExpenseRepository } from "@/data/repositories/expenseRepository";

import type { SyncWorker } from "./syncEngine";
import type { SyncOperation } from "./syncOperationRepository";

export type ExpenseCreateTransport = {
  createExpense(input: {
    expense: Expense;
    idempotencyKey: string;
  }): Promise<{ serverId: string }>;
};

const createExpenseOperationType = "CREATE_EXPENSE";

export function createExpenseSyncWorker(
  expenseRepository: ExpenseRepository,
  transport: ExpenseCreateTransport,
): SyncWorker {
  return {
    async push(operation: SyncOperation) {
      if (
        operation.entityType !== "expense" ||
        operation.operationType !== createExpenseOperationType
      ) {
        throw new Error("Expense worker received an unsupported sync operation.");
      }

      const expense = await expenseRepository.getExpense(operation.entityId);
      if (!expense) throw new Error("Expense is missing from local storage.");

      await expenseRepository.markExpenseSyncing(expense.id);

      try {
        const response = await transport.createExpense({
          expense,
          idempotencyKey: operation.idempotencyKey,
        });
        await expenseRepository.markExpenseSynced(expense.id, response.serverId);
      } catch (error) {
        await expenseRepository.markExpenseFailed(expense.id);
        throw error;
      }
    },
  };
}
