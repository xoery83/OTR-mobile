import { describe, expect, it } from "vitest";

import type { LedgerExpenseConflictResponse } from "@/data/api/ledgerMutationContracts";
import type { LedgerCollaborationDatabase } from "./ledgerCollaborationRepository";
import { createLedgerCollaborationRepository } from "./ledgerCollaborationRepository";
import type { SyncOperation } from "../sync/syncOperationRepository";

const editable = {
  title: "Dinner",
  description: null,
  category: "food",
  occurredAt: "2026-09-12T00:00:00.000Z",
  payerMemberId: "30000000-0000-4000-8000-000000000001",
  original: { minor: 1200, currency: "NZD", scale: 2 },
  businessStatus: "ACCEPTED" as const,
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
  valuation: null,
};

const current = {
  id: "40000000-0000-4000-8000-000000000001",
  journeyId: "10000000-0000-4000-8000-000000000001",
  creatorMemberId: "30000000-0000-4000-8000-000000000001",
  ...editable,
  revision: 2,
  deletedAt: null,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:01:00.000Z",
  paymentRecords: [],
  auditEvents: [],
};

function fixture() {
  const writes: { sql: string; params: unknown[] }[] = [];
  let transactions = 0;
  const db: LedgerCollaborationDatabase = {
    async withTransactionAsync(task) {
      transactions += 1;
      await task();
    },
    async runAsync(sql, ...params) {
      writes.push({ sql, params });
      return {} as never;
    },
    async getFirstAsync() {
      return null;
    },
    async getAllAsync() {
      return [];
    },
  };
  return { db, writes, transactions: () => transactions };
}

const operation: SyncOperation = {
  id: "operation-1",
  tripId: current.journeyId,
  entityType: "ledger_expense",
  entityId: "local-expense",
  operationType: "LEDGER_UPDATE_EXPENSE",
  idempotencyKey: "key-1",
  baseVersion: 1,
  payloadJson: JSON.stringify({ baseExpense: editable, expense: editable }),
  status: "PROCESSING",
  attemptCount: 0,
  nextAttemptAt: null,
  createdAt: current.createdAt,
  updatedAt: current.createdAt,
};

function conflict(id: string): LedgerExpenseConflictResponse {
  return {
    error: {
      code: "REVISION_CONFLICT",
      conflictId: id,
      expenseId: current.id,
      baseRevision: 1,
      currentRevision: 2,
      submitted: { ...editable, original: { ...editable.original, minor: 1300 } },
      current,
      changedGroups: ["FINANCIAL_CORE"],
      auditSummaries: [],
    },
  };
}

describe("Ledger collaboration repository", () => {
  it("stores immutable conflict snapshots and supersedes instead of rewriting", async () => {
    const { db, writes, transactions } = fixture();
    const repository = createLedgerCollaborationRepository(db);

    await repository.recordConflict(
      "local-expense",
      operation,
      conflict("70000000-0000-4000-8000-000000000001"),
    );
    await repository.recordConflict(
      "local-expense",
      operation,
      conflict("70000000-0000-4000-8000-000000000002"),
    );

    expect(transactions()).toBe(2);
    expect(
      writes.filter((write) => write.sql.includes("SET status = 'SUPERSEDED'")),
    ).toHaveLength(2);
    const inserts = writes.filter((write) =>
      write.sql.includes("INSERT OR IGNORE INTO ledger_expense_conflicts"),
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params[6]).toBe(JSON.stringify(editable));
    expect(inserts[1].params[6]).toBe(JSON.stringify(editable));
  });

  it("persists a correction proposal and its separate durable operation atomically", async () => {
    const { db, writes, transactions } = fixture();
    await createLedgerCollaborationRepository(db).createCorrection({
      journeyId: current.journeyId,
      expenseId: "local-expense",
      expenseServerId: current.id,
      baseRevision: 2,
      proposedExpense: editable,
      reason: "Wrong payer",
      requestedByMemberId: "30000000-0000-4000-8000-000000000002",
    });

    expect(transactions()).toBe(1);
    expect(
      writes.some((write) =>
        write.sql.includes("INSERT INTO ledger_correction_requests"),
      ),
    ).toBe(true);
    const queued = writes.find((write) =>
      write.sql.includes("INSERT INTO sync_operations"),
    );
    expect(queued?.params).toContain("LEDGER_PROPOSE_EXPENSE_CORRECTION");
    expect(String(queued?.params[7])).toContain(current.id);
  });
});
