import { describe, expect, it, vi } from "vitest";

import type { Expense } from "@/domain/expense/types";

import { createExpenseSyncWorker } from "./expenseSyncWorker";
import { createSyncEngine } from "./syncEngine";
import type { SyncOperation } from "./syncOperationRepository";

const expense: Expense = {
  id: "expense-1",
  serverId: null,
  tripId: "trip-1",
  title: "Museum",
  amountMinor: 2400,
  currencyCode: "EUR",
  paidByMemberId: null,
  occurredAt: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  syncStatus: "PENDING_CREATE",
  syncVersion: 0,
};

const operation: SyncOperation = {
  id: "operation-1",
  tripId: "trip-1",
  entityType: "expense",
  entityId: expense.id,
  operationType: "CREATE_EXPENSE",
  idempotencyKey: "operation-1",
  baseVersion: null,
  payloadJson: JSON.stringify({ expenseId: expense.id }),
  status: "PENDING",
  attemptCount: 0,
  nextAttemptAt: null,
  createdAt: expense.createdAt,
  updatedAt: expense.updatedAt,
};

function createRepository() {
  return {
    getExpense: vi.fn().mockResolvedValue(expense),
    markExpenseSyncing: vi.fn().mockResolvedValue(undefined),
    markExpenseSynced: vi.fn().mockResolvedValue(undefined),
    markExpenseFailed: vi.fn().mockResolvedValue(undefined),
    createExpense: vi.fn(),
    listExpensesForTrip: vi.fn(),
  };
}

describe("expense sync worker", () => {
  it("stores the returned server id and marks the local expense synced", async () => {
    const repository = createRepository();
    const worker = createExpenseSyncWorker(repository, {
      createExpense: vi.fn().mockResolvedValue({ serverId: "server-1", version: 1 }),
    });

    await worker.push(operation);

    expect(repository.markExpenseSyncing).toHaveBeenCalledWith(expense.id);
    expect(repository.markExpenseSynced).toHaveBeenCalledWith(expense.id, "server-1", 1);
    expect(repository.markExpenseFailed).not.toHaveBeenCalled();
  });

  it("keeps the local expense and creates retry metadata after a transport failure", async () => {
    const repository = createRepository();
    const worker = createExpenseSyncWorker(repository, {
      createExpense: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const queue = {
      listPending: vi.fn().mockResolvedValue([operation]),
      markProcessing: vi.fn().mockResolvedValue(undefined),
      markCompleted: vi.fn().mockResolvedValue(undefined),
      markRetryable: vi.fn().mockResolvedValue(undefined),
    };
    const engine = createSyncEngine(queue, worker, () => "2026-09-09T00:01:00.000Z");

    await engine.run("AUTHENTICATED_ONLINE");

    expect(repository.markExpenseFailed).toHaveBeenCalledWith(expense.id);
    expect(repository.createExpense).not.toHaveBeenCalled();
    expect(queue.markRetryable).toHaveBeenCalledWith(
      operation.id,
      expect.objectContaining({ message: "offline" }),
      "2026-09-09T00:01:00.000Z",
    );
  });
});
