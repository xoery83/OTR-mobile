import { describe, expect, it } from "vitest";

import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

import {
  buildEstimatedSettlementCategories,
  buildFinalizedSettlementCategories,
  buildSettlementComparison,
  buildSettlementCategories,
  chronologicalPersonalPayments,
  currentSettlementTransfers,
  localExpensesChangesFromFinal,
  membersWithActorFirst,
  personalPaymentProgress,
  personalStatementChangesFromFinal,
  personalStatementMatchesFinal,
  settlementCacheMessage,
  summarizeSettlementChanges,
  splitLabel,
  visiblePersonalPayments,
  visibleSettlementTransfers,
} from "./settlementSections";

describe("Settlement section selectors", () => {
  it("groups authoritative rows once and retains selected-member split context", () => {
    const rows = [row("hotel", 900, "a"), row("food", 300, "b"), row("hotel", 100, "c")];
    const expenses = rows.map(
      (item, index) =>
        ({
          id: item.id,
          splits: [
            {
              memberId: "member-a",
              method: index === 0 ? "EQUAL_PERSON" : "EXACT",
            },
          ],
        }) as LedgerExpense,
    );

    const categories = buildSettlementCategories(rows, expenses, "member-a");

    expect(categories.map((item) => [item.key, item.totalMinor])).toEqual([
      ["hotel", 1_000],
      ["food", 300],
    ]);
    expect(splitLabel(categories[0].rows[0].splitMethod)).toBe("Equal split");
    expect(splitLabel(categories[0].rows[1].splitMethod)).toBe("Custom split");
  });

  it("builds paid and shares from the same immutable Final inputs", () => {
    const inputs = [
      finalInput("expense-server-a", "member-a", 1_000, 250),
      finalInput("expense-server-b", "member-b", 600, 200),
    ] as Parameters<typeof buildFinalizedSettlementCategories>[0];
    const expenses = [
      {
        id: "expense-local-a",
        serverId: "expense-server-a",
        category: "food",
        splits: [],
      } as unknown as LedgerExpense,
      {
        id: "expense-local-b",
        serverId: "expense-server-b",
        category: "hotel",
        splits: [],
      } as unknown as LedgerExpense,
    ];

    const paid = buildFinalizedSettlementCategories(
      inputs,
      expenses,
      "member-a",
      "SPENDING",
    );
    const shares = buildFinalizedSettlementCategories(
      inputs,
      expenses,
      "member-a",
      "SHARES",
    );

    expect(paid.map((category) => [category.key, category.totalMinor])).toEqual([
      ["food", 1_000],
    ]);
    expect(shares.map((category) => [category.key, category.totalMinor])).toEqual([
      ["food", 250],
      ["hotel", 200],
    ]);
    expect(paid[0].rows[0].id).toBe("expense-local-a");
  });

  it("builds Current paid and shares from the same estimated inputs as Summary", () => {
    const expense = {
      id: "expense-a",
      title: "Estimated meal",
      category: "food",
      occurredAt: "2026-09-24",
      payerMemberId: "member-a",
      original: { minor: 1_000, currency: "EUR", scale: 2 },
      status: "RATE_REQUIRED",
      syncStatus: "PENDING",
      splits: [
        {
          memberId: "member-a",
          originalMinor: 250,
          settlementMinor: 300,
          method: "EXACT",
        },
        {
          memberId: "member-b",
          originalMinor: 750,
          settlementMinor: 700,
          method: "EXACT",
        },
      ],
    } as unknown as LedgerExpense;
    const inputs = [
      {
        expense,
        settlement: { minor: 1_000, currency: "NZD", scale: 2 },
        splits: expense.splits,
      },
    ];
    const members = [
      { id: "member-a", label: "A" },
      { id: "member-b", label: "B" },
    ];

    const paid = buildEstimatedSettlementCategories(
      inputs,
      members,
      "member-a",
      "SPENDING",
    );
    const shares = buildEstimatedSettlementCategories(
      inputs,
      members,
      "member-a",
      "SHARES",
    );

    expect(paid[0].totalMinor).toBe(1_000);
    expect(shares[0].totalMinor).toBe(300);
    expect(paid[0].rows[0]).toMatchObject({
      syncStatus: "PENDING",
      isAuthoritative: false,
    });
  });

  it("keeps Mine scoped while allowing organizer-only Everyone", () => {
    const transfers = [
      { fromMemberId: "member-a", toMemberId: "member-b" },
      { fromMemberId: "member-b", toMemberId: "member-c" },
    ];
    expect(visibleSettlementTransfers(transfers, "member-a", false, false)).toEqual([
      transfers[0],
    ]);
    expect(visibleSettlementTransfers(transfers, "member-a", true, false)).toEqual([
      transfers[0],
    ]);
    expect(visibleSettlementTransfers(transfers, "member-a", true, true)).toEqual(
      transfers,
    );

    const records = [payment("member-a", "member-b"), payment("member-b", "member-c")];
    expect(visiblePersonalPayments(records, "member-a", false, false)).toEqual([
      records[0],
    ]);
    expect(visiblePersonalPayments(records, "member-a", true, true)).toEqual(records);
  });

  it("summarizes only the current member's matching payment records", () => {
    const transfer = {
      fromMemberId: "member-a",
      toMemberId: "member-b",
      amount: { minor: 2_000, currency: "NZD", scale: 2 },
    };
    const records = [
      {
        ...payment("member-a", "member-b"),
        direction: "PAID",
        amountMinor: 400,
        currency: "NZD",
        scale: 2,
      },
      {
        ...payment("member-a", "member-b"),
        direction: "PAID",
        amountMinor: 300,
        currency: "USD",
        scale: 2,
        recordedEquivalentMinor: 500,
        recordedEquivalentCurrency: "NZD",
        recordedEquivalentScale: 2,
      },
      {
        ...payment("member-b", "member-a"),
        direction: "RECEIVED",
        amountMinor: 900,
        currency: "NZD",
        scale: 2,
      },
    ] as LocalPersonalPayment[];

    expect(personalPaymentProgress(records, "member-a", transfer)).toEqual({
      direction: "PAID",
      minor: 900,
      percentage: 45,
    });
    expect(personalPaymentProgress(records, "member-c", transfer)).toBeNull();
  });

  it("orders personal payment records oldest first", () => {
    const newer = {
      ...payment("member-a", "member-b"),
      id: "newer",
      occurredAt: "2026-09-24T12:00:00.000Z",
      createdAt: "2026-09-24T12:00:00.000Z",
    } as LocalPersonalPayment;
    const older = {
      ...payment("member-b", "member-a"),
      id: "older",
      occurredAt: "2026-09-23T12:00:00.000Z",
      createdAt: "2026-09-23T12:00:00.000Z",
    } as LocalPersonalPayment;

    expect(chronologicalPersonalPayments([newer, older])).toEqual([older, newer]);
  });

  it("uses the cached canonical preview without consulting personal records", () => {
    const transfers = currentSettlementTransfers(null, null, {
      transfers: [
        {
          fromMemberId: "member-a",
          toMemberId: "member-b",
          amount: { minor: 1_234, currency: "NZD", scale: 2 },
        },
      ],
    });

    expect(transfers).toEqual([
      expect.objectContaining({
        id: null,
        amount: { minor: 1_234, currency: "NZD", scale: 2 },
        legacyPaymentCount: 0,
      }),
    ]);
  });

  it("puts Me first without changing the other member order", () => {
    const members = [
      { id: "member-b", label: "B" },
      { id: "member-a", label: "A" },
      { id: "member-c", label: "C" },
    ];

    expect(membersWithActorFirst(members, "member-a")).toEqual([
      members[1],
      members[0],
      members[2],
    ]);
  });

  it("does not label saved Settlement data offline while the network is online", () => {
    expect(settlementCacheMessage(false, "data")).toBe(
      "Offline · showing cached Settlement data",
    );
    expect(settlementCacheMessage(true, "details")).toBe(
      "Settlement refresh unavailable · showing saved details",
    );
  });

  it("summarizes removed Expenses without exposing their ids", () => {
    expect(
      summarizeSettlementChanges([
        { expenseId: "removed-a", change: "DELETED" },
        { expenseId: "added-a", change: "NEW" },
        { expenseId: "removed-b", change: "DELETED" },
        { expenseId: "changed-a", change: "CHANGED" },
      ]),
    ).toEqual({
      removedCount: 2,
      visible: [
        { expenseId: "added-a", change: "NEW" },
        { expenseId: "changed-a", change: "CHANGED" },
      ],
    });
  });

  it("selects one Current snapshot when it differs from the confirmed head", () => {
    const comparison = buildSettlementComparison({
      currentDigest: "b".repeat(64),
      currentFingerprint: "c".repeat(64),
      currentFreshness: "CURRENT_SERVER",
      projectionAsOf: "2026-09-23T09:00:00.000Z",
      confirmed: finalized("a".repeat(64)),
      hasPendingFinancialOperations: false,
    });

    expect(comparison).toMatchObject({
      mode: "CONFIRMED_WITH_PENDING_UPDATE",
      freshness: "CURRENT_SERVER",
      currentDigest: "b".repeat(64),
      confirmedDigest: "a".repeat(64),
      usesConfirmedSnapshot: false,
    });
  });

  it("selects the confirmed snapshot only when the digests converge", () => {
    const digest = "a".repeat(64);
    const comparison = buildSettlementComparison({
      currentDigest: digest,
      currentFingerprint: "c".repeat(64),
      currentFreshness: "CURRENT_SERVER",
      projectionAsOf: "2026-09-23T09:00:00.000Z",
      confirmed: finalized(digest),
      hasPendingFinancialOperations: false,
    });

    expect(comparison).toMatchObject({
      mode: "CONFIRMED_ONLY",
      projectionAsOf: "2026-09-14T00:00:00.000Z",
      usesConfirmedSnapshot: true,
    });
  });

  it("trusts an exact Current statement match over a stale preview digest", () => {
    const comparison = buildSettlementComparison({
      currentDigest: "b".repeat(64),
      currentFingerprint: "c".repeat(64),
      currentFreshness: "CURRENT_SERVER",
      projectionAsOf: "2026-09-23T09:00:00.000Z",
      confirmed: finalized("a".repeat(64)),
      hasPendingFinancialOperations: false,
      currentMatchesConfirmed: true,
    });

    expect(comparison).toMatchObject({
      mode: "CONFIRMED_ONLY",
      usesConfirmedSnapshot: true,
    });
  });

  it("marks a local financial write as the active Current projection", () => {
    const digest = "a".repeat(64);
    const comparison = buildSettlementComparison({
      currentDigest: digest,
      currentFingerprint: "c".repeat(64),
      currentFreshness: "CURRENT_CACHED",
      projectionAsOf: "2026-09-23T09:00:00.000Z",
      confirmed: finalized(digest),
      hasPendingFinancialOperations: true,
    });

    expect(comparison).toMatchObject({
      mode: "CONFIRMED_WITH_PENDING_UPDATE",
      freshness: "CURRENT_LOCAL_PENDING",
      usesConfirmedSnapshot: false,
    });
  });

  it("does not treat a Current +9 statement as the confirmed +2 snapshot", () => {
    const confirmed = {
      ...finalized("a".repeat(64)),
      settlementCurrency: "NZD",
      settlementScale: 2,
      inputs: [
        {
          ...finalInput("expense-a", "member-a", 400, 200),
          expenseRevision: 1,
          valuation: { id: "valuation-a" },
        },
      ],
    } as Parameters<typeof personalStatementMatchesFinal>[1];
    const current = {
      journeyId: "journey-a",
      memberId: "member-a",
      currency: "NZD",
      scale: 2,
      settingsRevision: 1,
      algorithmVersion: "ledger-settlement-greedy-v1",
      settlementId: confirmed.id,
      settlementRevision: 1,
      settlementInputDigest: confirmed.inputDigest,
      paidMinor: 1_100,
      shareMinor: 200,
      balanceMinor: 900,
      contributions: [],
    } as Parameters<typeof personalStatementMatchesFinal>[0];

    expect(personalStatementMatchesFinal(current, confirmed, "member-a")).toBe(false);
  });

  it("identifies the exact expenses changed since the confirmed snapshot", () => {
    const confirmed = {
      ...finalized("a".repeat(64)),
      settlementCurrency: "NZD",
      settlementScale: 2,
      inputs: [
        {
          ...finalInput("expense-a", "member-a", 400, 200),
          expenseRevision: 1,
          valuation: { id: "valuation-a" },
        },
      ],
    } as Parameters<typeof personalStatementChangesFromFinal>[1];
    const current = {
      contributions: [
        {
          expenseId: "expense-a",
          sourceRevision: 2,
          valuationSnapshotId: "valuation-b",
          payerMemberId: "member-a",
          expenseSettlementMinor: 500,
          payerCreditMinor: 500,
          shareMinor: 250,
        },
        {
          expenseId: "expense-b",
          sourceRevision: 1,
          valuationSnapshotId: "valuation-c",
          payerMemberId: "member-a",
          expenseSettlementMinor: 300,
          payerCreditMinor: 300,
          shareMinor: 150,
        },
      ],
    } as Parameters<typeof personalStatementChangesFromFinal>[0];

    expect(personalStatementChangesFromFinal(current, confirmed, "member-a")).toEqual([
      { expenseId: "expense-a", change: "CHANGED" },
      { expenseId: "expense-b", change: "NEW" },
    ]);
  });

  it("lists local pending Expense changes before a server preview is available", () => {
    const confirmed = {
      ...finalized("a".repeat(64)),
      settlementCurrency: "NZD",
      settlementScale: 2,
      inputs: [
        {
          ...finalInput("expense-a", "member-a", 400, 200),
          expenseRevision: 1,
          valuation: { id: "valuation-a" },
        },
      ],
    } as Parameters<typeof localExpensesChangesFromFinal>[1];
    const expenses = [
      {
        id: "local-a",
        serverId: "expense-a",
        revision: 2,
        status: "ACCEPTED",
        settlementParticipation: "INCLUDED",
        payerMemberId: "member-a",
        original: { minor: 500, currency: "NZD", scale: 2 },
        valuation: {
          id: "valuation-b",
          settlement: { minor: 500, currency: "NZD", scale: 2 },
        },
        splits: [{ memberId: "member-a", originalMinor: 250, settlementMinor: 250 }],
      },
      {
        id: "expense-b",
        serverId: null,
        revision: 1,
        status: "ACCEPTED",
        settlementParticipation: "INCLUDED",
        payerMemberId: "member-a",
        original: { minor: 300, currency: "NZD", scale: 2 },
        valuation: {
          id: "valuation-c",
          settlement: { minor: 300, currency: "NZD", scale: 2 },
        },
        splits: [{ memberId: "member-a", originalMinor: 150, settlementMinor: 150 }],
      },
    ] as LedgerExpense[];

    expect(localExpensesChangesFromFinal(expenses, confirmed)).toEqual([
      { expenseId: "expense-a", change: "CHANGED" },
      { expenseId: "expense-b", change: "NEW" },
    ]);
  });
});

function row(category: string, componentMinor: number, id: string) {
  return {
    id,
    category,
    componentMinor,
    settlementCurrency: "NZD",
    settlementScale: 2,
  } as LedgerReportListItem;
}

function payment(ownerMemberId: string, counterpartyMemberId: string) {
  return { ownerMemberId, counterpartyMemberId } as LocalPersonalPayment;
}

function finalInput(
  expenseId: string,
  payerMemberId: string,
  settlementMinor: number,
  shareMinor: number,
) {
  return {
    expenseId,
    payer: { memberId: payerMemberId, displayNameSnapshot: "Payer" },
    original: { minor: settlementMinor, currency: "NZD", scale: 2 },
    settlement: { minor: settlementMinor, currency: "NZD", scale: 2 },
    splits: [
      {
        member: { memberId: "member-a", displayNameSnapshot: "A" },
        originalMinor: shareMinor,
        settlementMinor: shareMinor,
      },
    ],
  };
}

function finalized(inputDigest: string) {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    inputDigest,
    finalizedAt: "2026-09-14T00:00:00.000Z",
  } as Parameters<typeof buildSettlementComparison>[0]["confirmed"];
}
