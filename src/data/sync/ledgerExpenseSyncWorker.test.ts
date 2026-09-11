import { describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/data/api/client";
import type { LedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";

import { createLedgerExpenseSyncWorker } from "./ledgerExpenseSyncWorker";
import type { SyncOperation } from "./syncOperationRepository";

const expense = {
  id: "ledger-expense-local-1",
  serverId: null,
  serverRevision: 0,
  journeyId: "10000000-0000-4000-8000-000000000001",
  creatorMemberId: "30000000-0000-4000-8000-000000000001",
  payerMemberId: "30000000-0000-4000-8000-000000000001",
  title: "Dinner",
  description: null,
  category: "food",
  occurredAt: "2026-09-11T19:00:00.000Z",
  original: { minor: 1200, currency: "NZD", scale: 2 },
  participants: [
    {
      memberId: "30000000-0000-4000-8000-000000000001",
      displayNameSnapshot: "Alex",
      householdIdSnapshot: null,
    },
  ],
  splits: [
    {
      memberId: "30000000-0000-4000-8000-000000000001",
      method: "EQUAL_PERSON" as const,
      originalMinor: 1200,
      settlementMinor: 1200,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: {
    id: "valuation-local-1",
    policy: "SAME_CURRENCY" as const,
    original: { minor: 1200, currency: "NZD", scale: 2 },
    settlement: { minor: 1200, currency: "NZD", scale: 2 },
    rateSnapshotId: null,
    paymentRecordId: null,
    reason: null,
  },
  paymentRecords: [],
  status: "ACCEPTED" as const,
  revision: 1,
  deletedAt: null,
  syncStatus: "PENDING_CREATE" as const,
  createdAt: "2026-09-11T19:00:00.000Z",
  updatedAt: "2026-09-11T19:00:00.000Z",
};

const operation: SyncOperation = {
  id: "operation-1",
  tripId: expense.journeyId,
  entityType: "ledger_expense",
  entityId: expense.id,
  operationType: "LEDGER_CREATE_EXPENSE",
  idempotencyKey: "stable-key-1",
  baseVersion: null,
  payloadJson: JSON.stringify({ expenseId: expense.id, revision: 1 }),
  status: "PENDING",
  attemptCount: 0,
  nextAttemptAt: null,
  createdAt: "2026-09-11T19:00:00.000Z",
  updatedAt: "2026-09-11T19:00:00.000Z",
};

function repository(): LedgerExpenseRepository {
  return {
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
    listExpensesForJourney: vi.fn(),
    getExpense: vi.fn(async () => expense),
    tombstoneExpense: vi.fn(),
    restoreExpense: vi.fn(),
    markExpenseSyncing: vi.fn(),
    markExpenseSynced: vi.fn(),
    reconcileCanonicalExpense: vi.fn(),
    markExpenseConflict: vi.fn(),
    markExpenseFailed: vi.fn(),
  };
}

describe("Ledger Expense sync worker", () => {
  it("pushes create with the durable idempotency key and reconciles canonical id", async () => {
    const repo = repository();
    const transport = {
      createExpense: vi.fn(async () => ({
        serverId: "40000000-0000-4000-8000-000000000001",
        revision: 1,
      })),
      updateExpense: vi.fn(),
      deleteExpense: vi.fn(),
      restoreExpense: vi.fn(),
    };

    await createLedgerExpenseSyncWorker(repo, transport).push(operation);

    expect(transport.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "stable-key-1",
        journeyId: expense.journeyId,
      }),
    );
    expect(repo.markExpenseSynced).toHaveBeenCalledWith(
      expense.id,
      "40000000-0000-4000-8000-000000000001",
      1,
    );
  });

  it("marks the local aggregate failed when a post-commit response is lost", async () => {
    const repo = repository();
    const worker = createLedgerExpenseSyncWorker(repo, {
      createExpense: vi.fn(async () => {
        throw new Error("ambiguous response loss");
      }),
      updateExpense: vi.fn(),
      deleteExpense: vi.fn(),
      restoreExpense: vi.fn(),
    });

    await expect(worker.push(operation)).rejects.toThrow(/ambiguous/);
    expect(repo.markExpenseFailed).toHaveBeenCalledWith(expense.id);
  });

  it("uses the queued create payload even when the local aggregate was edited later", async () => {
    const repo = repository();
    vi.mocked(repo.getExpense).mockResolvedValue({
      ...expense,
      title: "Later offline edit",
      revision: 2,
      syncStatus: "PENDING_UPDATE",
    });
    const transport = {
      createExpense: vi.fn(async () => ({
        serverId: "40000000-0000-4000-8000-000000000001",
        revision: 1,
      })),
      updateExpense: vi.fn(),
      deleteExpense: vi.fn(),
      restoreExpense: vi.fn(),
    };
    const queuedCreate = {
      ...operation,
      payloadJson: JSON.stringify({
        expense: {
          title: "Original queued create",
          description: null,
          category: "food",
          occurredAt: expense.occurredAt,
          payerMemberId: expense.payerMemberId,
          original: expense.original,
          businessStatus: "ACCEPTED",
          participants: expense.participants,
          splits: expense.splits,
          valuation: null,
        },
      }),
    };

    await createLedgerExpenseSyncWorker(repo, transport).push(queuedCreate);

    const [input] = transport.createExpense.mock.calls[0] as unknown as [
      { expense: { title: string } },
    ];
    expect(input.expense.title).toBe("Original queued create");
  });

  it("marks stale update conflicts without treating them as retryable failures", async () => {
    const repo = repository();
    vi.mocked(repo.getExpense).mockResolvedValue({
      ...expense,
      serverId: "40000000-0000-4000-8000-000000000001",
      serverRevision: 1,
      syncStatus: "PENDING_UPDATE",
    });
    const transport = {
      createExpense: vi.fn(),
      updateExpense: vi.fn(async () => {
        throw new ApiClientError("conflict", "http", 409, "REVISION_CONFLICT");
      }),
      deleteExpense: vi.fn(),
      restoreExpense: vi.fn(),
    };

    await expect(
      createLedgerExpenseSyncWorker(repo, transport).push({
        ...operation,
        operationType: "LEDGER_UPDATE_EXPENSE",
        baseVersion: 1,
        payloadJson: JSON.stringify({ reason: null, expense: null }),
      }),
    ).rejects.toThrow(/conflict/i);

    expect(repo.markExpenseConflict).toHaveBeenCalledWith(expense.id);
    expect(repo.markExpenseFailed).not.toHaveBeenCalled();
  });
});
