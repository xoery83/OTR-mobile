import { describe, expect, it } from "vitest";

import {
  allocateByPercentageUnits,
  allocateByWeightUnits,
  allocateEqualHousehold,
  allocateEqual,
  PERCENTAGE_TOTAL_UNITS,
  validateExactAllocation,
} from "./allocation";
import { convertMoney, parseDecimalRatio } from "./money";
import { buildTransferPlan, calculateMemberBalances } from "./settlement";
import type { ExpenseAggregate } from "./types";
import { validateExpenseAggregate } from "./validation";

function expense(overrides: Partial<ExpenseAggregate> = {}): ExpenseAggregate {
  return {
    id: "expense-1",
    journeyId: "journey-1",
    revision: 1,
    title: "Dinner",
    category: "food",
    payerMemberId: "leon",
    original: { minor: 10_000, currency: "EUR", scale: 2 },
    participants: ["leon", "may", "mia"].map((memberId) => ({
      memberId,
      displayNameSnapshot: memberId,
      householdIdSnapshot: null,
    })),
    splits: allocateEqual(10_000, 19_780, ["leon", "may", "mia"]),
    valuation: {
      id: "valuation-1",
      policy: "REFERENCE_RATE",
      original: { minor: 10_000, currency: "EUR", scale: 2 },
      settlement: { minor: 19_780, currency: "NZD", scale: 2 },
      rateSnapshotId: "rate-1",
      paymentRecordId: null,
      reason: null,
    },
    paymentRecords: [
      {
        id: "payment-1",
        instrumentLabel: "Visa NZ",
        authorization: null,
        posted: { minor: 19_943, currency: "NZD", scale: 2 },
        postedAt: "2026-09-10T00:00:00.000Z",
        fee: { minor: 200, currency: "NZD", scale: 2 },
        supersedesPaymentRecordId: null,
      },
    ],
    status: "ACCEPTED",
    ...overrides,
  };
}

describe("Ledger 2.0 money and allocation", () => {
  it("converts decimal rates with integer rounding", () => {
    expect(parseDecimalRatio("1.9780")).toEqual({
      numerator: 19_780n,
      denominator: 10_000n,
    });
    expect(
      convertMoney({ minor: 10_000, currency: "EUR", scale: 2 }, "NZD", 2, "1.978"),
    ).toEqual({ minor: 19_780, currency: "NZD", scale: 2 });
  });

  it("allocates residual minor units deterministically", () => {
    const result = allocateEqual(100, 199, ["c", "a", "b"]);
    expect(result.reduce((sum, split) => sum + split.originalMinor, 0)).toBe(100);
    expect(result.reduce((sum, split) => sum + split.settlementMinor!, 0)).toBe(199);
    expect(result.find((split) => split.memberId === "a")?.originalMinor).toBe(34);
  });

  it("splits equal-household before splitting within each household", () => {
    const equalPerson = allocateEqual(1200, null, ["a1", "a2", "b1"]);
    const equalHousehold = allocateEqualHousehold(1200, null, [
      { memberId: "a1", householdId: "household-a" },
      { memberId: "a2", householdId: "household-a" },
      { memberId: "b1", householdId: "household-b" },
    ]);

    expect(equalPerson.map((split) => split.originalMinor)).toEqual([400, 400, 400]);
    expect(equalHousehold.map((split) => split.originalMinor)).toEqual([300, 300, 600]);
    expect(equalHousehold.every((split) => split.method === "EQUAL_HOUSEHOLD")).toBe(
      true,
    );
  });

  it("supports adult and child weight units", () => {
    const result = allocateByWeightUnits(2500, 5000, [
      { memberId: "adult", units: 1000 },
      { memberId: "child", units: 500 },
    ]);
    expect(result.map((split) => split.originalMinor)).toEqual([1667, 833]);
    expect(result.map((split) => split.settlementMinor)).toEqual([3333, 1667]);
  });

  it("requires percentages to reconcile exactly", () => {
    expect(() =>
      allocateByPercentageUnits(1000, 2000, [
        { memberId: "a", units: 500_000 },
        { memberId: "b", units: PERCENTAGE_TOTAL_UNITS - 500_001 },
      ]),
    ).toThrow(/must total/);
    expect(() => validateExactAllocation(100, [40, 59])).toThrow(/reconcile/);
  });
});

describe("Ledger 2.0 aggregate and settlement", () => {
  it("keeps merchant, payer cost, and group valuation independent", () => {
    const value = expense();
    expect(value.original.minor).toBe(10_000);
    expect(value.paymentRecords[0].posted?.minor).toBe(19_943);
    expect(value.valuation?.settlement.minor).toBe(19_780);
    expect(validateExpenseAggregate(value, new Set(["leon", "may", "mia"]))).toEqual([]);
  });

  it("rejects participant and split inconsistencies", () => {
    const value = expense({ payerMemberId: "outside" });
    value.splits[0] = { ...value.splits[0], originalMinor: 1 };
    expect(
      validateExpenseAggregate(value, new Set(["leon", "may", "mia"])).map(
        (issue) => issue.code,
      ),
    ).toEqual(expect.arrayContaining(["INVALID_PAYER", "ORIGINAL_SPLIT_MISMATCH"]));
  });

  it("calculates zero-net balances and a deterministic transfer plan", () => {
    const balances = calculateMemberBalances(
      [expense()],
      ["leon", "may", "mia"],
      "NZD",
      2,
    );
    expect(balances.reduce((sum, balance) => sum + balance.minor, 0)).toBe(0);
    const plan = buildTransferPlan(balances);
    expect(plan).toHaveLength(2);
    expect(plan.reduce((sum, transfer) => sum + transfer.amount.minor, 0)).toBe(13_186);
    expect(plan.every((transfer) => transfer.toMemberId === "leon")).toBe(true);
  });

  it("refuses a non-zero settlement balance sheet", () => {
    expect(() =>
      buildTransferPlan([
        { memberId: "a", minor: 10, currency: "NZD", scale: 2 },
        { memberId: "b", minor: -9, currency: "NZD", scale: 2 },
      ]),
    ).toThrow(/net to zero/);
  });
});
