import { describe, expect, it } from "vitest";

import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

import { estimatedSettlement } from "./estimatedSettlement";
import type { DisplayEstimate } from "./displayEstimate";

const expense = {
  id: "one",
  status: "RATE_REQUIRED",
  settlementParticipation: "INCLUDED",
  payerMemberId: "leo",
  economicDate: "2026-09-16",
  valuation: null,
  splits: [
    { memberId: "leo", originalMinor: 25, settlementMinor: null },
    { memberId: "mary", originalMinor: 75, settlementMinor: null },
  ],
} as LedgerExpense;
const estimate = {
  money: { minor: 10_001, currency: "CNY", scale: 2 },
  quoteId: "quote",
  exactDate: false,
} satisfies DisplayEstimate;

describe("informational settlement preview", () => {
  it("allocates estimate deterministically and never edits financial evidence", () => {
    const before = JSON.stringify(expense);
    const result = estimatedSettlement(
      [expense],
      ["leo", "mary"],
      "CNY",
      2,
      new Map([[expense.id, estimate]]),
      new Set(),
    );
    expect(result.estimatedCount).toBe(1);
    expect(result.balances.map((balance) => balance.minor)).toEqual([7_501, -7_501]);
    expect(result.transfers).toMatchObject([
      { fromMemberId: "mary", toMemberId: "leo", amount: { minor: 7_501 } },
    ]);
    expect(JSON.stringify(expense)).toBe(before);
  });

  it("does not turn conflicts or missing rates into zero-valued accepted inputs", () => {
    expect(
      estimatedSettlement([expense], ["leo", "mary"], "CNY", 2, new Map(), new Set())
        .blockers,
    ).toEqual([{ expenseId: "one", reason: "Journey value needs attention" }]);
    expect(
      estimatedSettlement(
        [expense],
        ["leo", "mary"],
        "CNY",
        2,
        new Map([["one", estimate]]),
        new Set(["one"]),
      ).blockers,
    ).toEqual([{ expenseId: "one", reason: "Conflicting edit needs review" }]);
    expect(
      estimatedSettlement(
        [{ ...expense, economicDate: null, occurredAt: "" }],
        ["leo", "mary"],
        "CNY",
        2,
        new Map(),
        new Set(),
      ).blockers,
    ).toEqual([{ expenseId: "one", reason: "Add date" }]);
  });

  it("combines accepted and estimated values while marking only the latter approximate", () => {
    const accepted = {
      ...expense,
      id: "accepted",
      status: "ACCEPTED",
      payerMemberId: "mary",
      valuation: { settlement: { minor: 2_000, currency: "CNY", scale: 2 } },
      splits: [
        { memberId: "leo", settlementMinor: 1_000 },
        { memberId: "mary", settlementMinor: 1_000 },
      ],
    } as LedgerExpense;
    const result = estimatedSettlement(
      [expense, accepted],
      ["leo", "mary"],
      "CNY",
      2,
      new Map([[expense.id, estimate]]),
      new Set(),
    );
    expect(result.estimatedCount).toBe(1);
    expect(result.balances.map((item) => item.minor)).toEqual([6_501, -6_501]);
    expect(result.transfers[0].amount.minor).toBe(6_501);
  });

  it("keeps accepted agreed/payment valuations instead of replacing them with ECB estimates", () => {
    for (const policy of ["MANUAL_AGREED", "ACTUAL_PAYER_COST"] as const) {
      const accepted = {
        ...expense,
        status: "ACCEPTED",
        valuation: {
          policy,
          settlement: { minor: 20_000, currency: "CNY", scale: 2 },
        },
        splits: [
          { memberId: "leo", originalMinor: 25, settlementMinor: 5_000 },
          { memberId: "mary", originalMinor: 75, settlementMinor: 15_000 },
        ],
      } as LedgerExpense;
      const result = estimatedSettlement(
        [accepted],
        ["leo", "mary"],
        "CNY",
        2,
        new Map([["one", estimate]]),
        new Set(),
        "REFERENCE_RATE",
      );
      expect(result.estimatedCount).toBe(0);
      expect(result.balances.map((item) => item.minor)).toEqual([15_000, -15_000]);
    }
  });

  it("rejects an unsafe aggregate instead of rounding preview balances", () => {
    const accepted = {
      ...expense,
      status: "ACCEPTED",
      valuation: {
        settlement: { minor: Number.MAX_SAFE_INTEGER, currency: "CNY", scale: 2 },
      },
      splits: [
        { memberId: "leo", settlementMinor: 0 },
        { memberId: "mary", settlementMinor: Number.MAX_SAFE_INTEGER },
      ],
    } as LedgerExpense;
    expect(() =>
      estimatedSettlement(
        [accepted, { ...accepted, id: "two" }],
        ["leo", "mary"],
        "CNY",
        2,
        new Map(),
        new Set(),
      ),
    ).toThrow("Preview total is unsafe.");
  });
});
