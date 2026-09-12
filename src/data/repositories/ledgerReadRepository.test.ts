import { describe, expect, it } from "vitest";

import type {
  LedgerBootstrapResponse,
  LedgerChangesResponse,
  MyLedgerResponse,
} from "@/data/api/ledgerReadContracts";

import {
  createLedgerReadRepository,
  type LedgerReadDatabase,
} from "./ledgerReadRepository";

const journeyId = "10000000-0000-4000-8000-000000000001";
const expenseId = "20000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";
const householdId = "40000000-0000-4000-8000-000000000001";
const correctionId = "50000000-0000-4000-8000-000000000001";

function database(
  existingExpenseStatus: string | null = null,
  existingCorrectionStatus: string | null = null,
  linkedExpenseLocalId: string | null = null,
) {
  const writes: { sql: string; params: unknown[] }[] = [];
  let transactions = 0;
  const db: LedgerReadDatabase = {
    async withTransactionAsync(task) {
      transactions += 1;
      await task();
    },
    async runAsync(sql, ...params) {
      writes.push({ sql, params });
      return {} as never;
    },
    async getFirstAsync(sql) {
      if (sql.includes("WHERE journey_id = ? AND server_id = ?")) {
        return linkedExpenseLocalId ? ({ id: linkedExpenseLocalId } as never) : null;
      }
      if (sql.includes("FROM ledger_expenses") && existingExpenseStatus) {
        return { id: "local-expense", syncStatus: existingExpenseStatus } as never;
      }
      if (sql.includes("FROM ledger_correction_requests") && existingCorrectionStatus) {
        return { id: correctionId, syncStatus: existingCorrectionStatus } as never;
      }
      if (sql.includes("ledger_sync_cursors")) return { cursor: "cursor-1" } as never;
      return null;
    },
    async getAllAsync() {
      return [] as never;
    },
  };
  return { db, transactions: () => transactions, writes };
}

const expense = {
  id: expenseId,
  journeyId,
  creatorMemberId: null,
  payerMemberId: memberId,
  title: "Train",
  description: null,
  category: "transport",
  occurredAt: "2026-09-11T00:00:00.000Z",
  original: { minor: 1200, currency: "NZD", scale: 2 },
  businessStatus: "ACCEPTED",
  revision: 1,
  deletedAt: null,
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
  participants: [{ memberId, displayNameSnapshot: "Leon", householdIdSnapshot: null }],
  splits: [
    {
      memberId,
      method: "EQUAL_PERSON",
      originalMinor: 1200,
      settlementMinor: 1200,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: null,
  paymentRecords: [],
  auditEvents: [],
} satisfies LedgerBootstrapResponse["expenses"][number];

const correction = {
  id: correctionId,
  journeyId,
  expenseId,
  baseExpenseRevision: 1,
  proposedExpense: {
    title: "Train corrected",
    description: null,
    category: "transport",
    occurredAt: "2026-09-11T00:00:00.000Z",
    payerMemberId: memberId,
    original: { minor: 1200, currency: "NZD", scale: 2 },
    businessStatus: "ACCEPTED" as const,
    participants: [{ memberId, displayNameSnapshot: "Leon", householdIdSnapshot: null }],
    splits: [
      {
        memberId,
        method: "EQUAL_PERSON" as const,
        originalMinor: 1200,
        settlementMinor: 1200,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: null,
  },
  reason: "Wrong title",
  status: "OPEN" as const,
  requestedByUserId: memberId,
  requestedByMemberId: memberId,
  resolvedByUserId: null,
  resolvedByMemberId: null,
  resolutionReason: null,
  resultingExpenseRevision: null,
  revision: 1,
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
  resolvedAt: null,
} satisfies LedgerBootstrapResponse["corrections"][number];

describe("Ledger read repository", () => {
  it("applies bootstrap data and advances the cursor in one transaction", async () => {
    const { db, transactions, writes } = database();
    const response: LedgerBootstrapResponse = {
      journey: {
        id: journeyId,
        title: "Europe",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        settlementCurrency: "NZD",
        settlementScale: 2,
        valuationPolicy: "REFERENCE_RATE",
        updatedAt: "2026-09-11T00:00:00.000Z",
      },
      members: [],
      households: [],
      expenses: [expense],
      corrections: [],
      rateQuotes: [],
      actor: {
        memberId: null,
        role: null,
        capabilities: {
          canRead: false,
          canCreateExpense: false,
          canEditOwnExpense: false,
          canCorrectAnyExpense: false,
          canSuggestCorrection: false,
          canResolveOwnExpenseConflict: false,
          canAddOwnPaymentEvidence: false,
          canManageExpenseValuation: false,
          canManageLedgerValuationPolicy: false,
        },
      },
      cursor: "cursor-2",
      serverTime: "2026-09-11T01:00:00.000Z",
    };

    await createLedgerReadRepository(db).applyBootstrap(response);

    expect(transactions()).toBe(1);
    expect(writes.some((write) => write.sql.includes("ledger_expenses"))).toBe(true);
    expect(writes.at(-1)?.params.slice(0, 2)).toEqual([journeyId, "cursor-2"]);
  });

  it("defers a server change when the local aggregate is pending", async () => {
    const { db, writes } = database("PENDING_UPDATE");
    const response: LedgerChangesResponse = {
      changes: [
        {
          entityType: "EXPENSE",
          entityId: expenseId,
          revision: 2,
          isTombstone: false,
          aggregate: { ...expense, revision: 2 },
        },
      ],
      cursor: "cursor-3",
      serverTime: "2026-09-11T02:00:00.000Z",
    };

    await createLedgerReadRepository(db).applyChanges(journeyId, response);

    expect(
      writes.some((write) => write.sql.includes("ledger_deferred_server_changes")),
    ).toBe(true);
    expect(writes.some((write) => write.sql.includes("DELETE FROM ledger_expense"))).toBe(
      false,
    );
    expect(writes.at(-1)?.params.slice(0, 2)).toEqual([journeyId, "cursor-3"]);
  });

  it("defers bootstrap expenses when a matching local aggregate is pending", async () => {
    const { db, writes } = database("PENDING_UPDATE");
    const response: LedgerBootstrapResponse = {
      journey: {
        id: journeyId,
        title: "Europe",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        settlementCurrency: "NZD",
        settlementScale: 2,
        valuationPolicy: "REFERENCE_RATE",
        updatedAt: "2026-09-11T00:00:00.000Z",
      },
      members: [],
      households: [],
      expenses: [expense],
      corrections: [],
      rateQuotes: [],
      actor: {
        memberId: null,
        role: null,
        capabilities: {
          canRead: false,
          canCreateExpense: false,
          canEditOwnExpense: false,
          canCorrectAnyExpense: false,
          canSuggestCorrection: false,
          canResolveOwnExpenseConflict: false,
          canAddOwnPaymentEvidence: false,
          canManageExpenseValuation: false,
          canManageLedgerValuationPolicy: false,
        },
      },
      cursor: "cursor-2",
      serverTime: "2026-09-11T01:00:00.000Z",
    };

    await createLedgerReadRepository(db).applyBootstrap(response);

    expect(
      writes.some((write) => write.sql.includes("ledger_deferred_server_changes")),
    ).toBe(true);
    expect(writes.some((write) => write.sql.includes("DELETE FROM ledger_expense"))).toBe(
      false,
    );
  });

  it("preserves a synced local id when bootstrap refreshes its server aggregate", async () => {
    const { db, writes } = database("SYNCED");
    const response: LedgerBootstrapResponse = {
      journey: {
        id: journeyId,
        title: "Europe",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        settlementCurrency: "NZD",
        settlementScale: 2,
        valuationPolicy: "REFERENCE_RATE",
        updatedAt: "2026-09-11T00:00:00.000Z",
      },
      members: [],
      households: [],
      expenses: [expense],
      corrections: [],
      rateQuotes: [],
      actor: {
        memberId: null,
        role: null,
        capabilities: {
          canRead: false,
          canCreateExpense: false,
          canEditOwnExpense: false,
          canCorrectAnyExpense: false,
          canSuggestCorrection: false,
          canResolveOwnExpenseConflict: false,
          canAddOwnPaymentEvidence: false,
          canManageExpenseValuation: false,
          canManageLedgerValuationPolicy: false,
        },
      },
      cursor: "cursor-2",
      serverTime: "2026-09-11T01:00:00.000Z",
    };

    await createLedgerReadRepository(db).applyBootstrap(response);

    const aggregate = writes.find((write) =>
      write.sql.includes("INSERT OR REPLACE INTO ledger_expenses"),
    );
    expect(aggregate?.params.slice(0, 2)).toEqual(["local-expense", expenseId]);
    expect(
      writes
        .filter((write) => write.sql.includes("INSERT INTO ledger_valuation_snapshots"))
        .every((write) => write.params.at(1) === "local-expense"),
    ).toBe(true);
  });

  it("maps a pulled receipt link back to the local Expense id", async () => {
    const { db, writes } = database(null, null, "local-expense");
    const response: LedgerBootstrapResponse = {
      journey: {
        id: journeyId,
        title: "Europe",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        settlementCurrency: "NZD",
        settlementScale: 2,
        valuationPolicy: "REFERENCE_RATE",
        updatedAt: "2026-09-11T00:00:00.000Z",
      },
      members: [],
      households: [],
      expenses: [],
      corrections: [],
      rateQuotes: [],
      receipts: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          localId: "local-receipt",
          journeyId,
          expenseId,
          objectPath: `${journeyId}/receipt/original`,
          mimeType: "image/jpeg",
          sizeBytes: 4,
          sha256: "a".repeat(64),
          uploadStatus: "UPLOADED",
          ocrStatus: "SUCCEEDED",
          ocrSuggestion: null,
          createdAt: "2026-09-11T00:00:00.000Z",
          updatedAt: "2026-09-11T00:00:00.000Z",
        },
      ],
      actor: {
        memberId: null,
        role: null,
        capabilities: {
          canRead: false,
          canCreateExpense: false,
          canEditOwnExpense: false,
          canCorrectAnyExpense: false,
          canSuggestCorrection: false,
          canResolveOwnExpenseConflict: false,
          canAddOwnPaymentEvidence: false,
          canManageExpenseValuation: false,
          canManageLedgerValuationPolicy: false,
        },
      },
      cursor: "cursor-2",
      serverTime: "2026-09-11T01:00:00.000Z",
    };

    await createLedgerReadRepository(db).applyBootstrap(response);

    const receiptWrite = writes.find((write) =>
      write.sql.includes("INSERT OR REPLACE INTO ledger_receipt_assets"),
    );
    expect(receiptWrite?.params[3]).toBe("local-expense");
  });

  it("defers correction changes while a local correction command is pending", async () => {
    const { db, writes } = database(null, "PENDING_UPDATE");
    const response: LedgerChangesResponse = {
      changes: [
        {
          entityType: "CORRECTION",
          entityId: correctionId,
          revision: 2,
          isTombstone: false,
          aggregate: { ...correction, revision: 2 },
        },
      ],
      cursor: "cursor-3",
      serverTime: "2026-09-11T02:00:00.000Z",
    };

    await createLedgerReadRepository(db).applyChanges(journeyId, response);

    expect(
      writes.some((write) => write.sql.includes("ledger_deferred_server_changes")),
    ).toBe(true);
    expect(
      writes.some((write) =>
        write.sql.includes("INSERT OR REPLACE INTO ledger_correction"),
      ),
    ).toBe(false);
  });

  it("applies household changes from incremental pull", async () => {
    const { db, writes } = database();
    const response: LedgerChangesResponse = {
      changes: [
        {
          entityType: "HOUSEHOLD",
          entityId: householdId,
          revision: 2,
          isTombstone: false,
          aggregate: {
            id: householdId,
            name: "Crew",
            displayOrder: 1,
            updatedAt: "2026-09-11T02:00:00.000Z",
            memberIds: [memberId],
          },
        },
      ],
      cursor: "cursor-3",
      serverTime: "2026-09-11T02:00:00.000Z",
    };

    await createLedgerReadRepository(db).applyChanges(journeyId, response);

    expect(writes.some((write) => write.sql.includes("ledger_households"))).toBe(true);
    expect(
      writes.some((write) => write.sql.includes("ledger_deferred_server_changes")),
    ).toBe(false);
    expect(writes.at(-1)?.params.slice(0, 2)).toEqual([journeyId, "cursor-3"]);
  });

  it("caches narrow My Ledger summaries without Journey detail hydration", async () => {
    const { db, writes } = database();
    const response: MyLedgerResponse = {
      period: "YEAR",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-09-12T00:00:00.000Z",
      journeys: [
        {
          journeyId,
          title: "Europe",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          currency: "NZD",
          scale: 2,
          mySpendMinor: 250,
          paidMinor: 1000,
          positionMinor: 750,
          unvaluedCount: 0,
          conflictCount: 0,
          updatedAt: "2026-09-11T00:00:00.000Z",
        },
      ],
      serverTime: "2026-09-11T00:00:00.000Z",
    };

    await createLedgerReadRepository(db).cacheMyLedger(response);

    expect(writes).toHaveLength(2);
    expect(writes[1].sql).toContain("ledger_my_journey_summaries");
  });
});
