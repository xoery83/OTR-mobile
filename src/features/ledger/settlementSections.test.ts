import { describe, expect, it } from "vitest";

import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

import {
  buildFinalizedSettlementCategories,
  buildSettlementComparison,
  buildSettlementCategories,
  currentSettlementTransfers,
  membersWithActorFirst,
  personalStatementChangesFromFinal,
  personalStatementMatchesFinal,
  settlementCacheMessage,
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
