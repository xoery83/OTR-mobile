import { describe, expect, it } from "vitest";

import type { ExpenseAggregate } from "./types";
import { ledgerReviewRulesetVersion, reviewExpenses } from "./review";

const expense = (id: string, minor: number): ExpenseAggregate => ({
  id,
  journeyId: "journey",
  revision: 1,
  title: "Lunch",
  category: "food",
  payerMemberId: "payer",
  original: { minor, currency: "NZD", scale: 2 },
  participants: [
    { memberId: "guest", displayNameSnapshot: "Guest", householdIdSnapshot: null },
  ],
  splits: [
    {
      memberId: "guest",
      originalMinor: minor,
      settlementMinor: minor,
      method: "EXACT",
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: {
    id: `${id}-valuation`,
    policy: "SAME_CURRENCY",
    original: { minor, currency: "NZD", scale: 2 },
    settlement: { minor, currency: "NZD", scale: 2 },
    rateSnapshotId: null,
    paymentRecordId: null,
    reason: null,
    decimalRate: "1",
  },
  paymentRecords: [],
  status: "ACCEPTED",
});

describe("Ledger Review v1", () => {
  it("produces versioned observations without mutating financial truth", () => {
    const values = [
      expense("a", 100),
      expense("b", 100),
      expense("c", 100),
      expense("d", 100),
      expense("e", 1000),
    ];
    const before = JSON.stringify(values);
    const findings = reviewExpenses(values);

    expect(findings.some((item) => item.findingType === "POSSIBLE_DUPLICATE")).toBe(true);
    expect(findings.some((item) => item.findingType === "AMOUNT_OUTLIER")).toBe(true);
    expect(
      findings.every((item) => item.rulesetVersion === ledgerReviewRulesetVersion),
    ).toBe(true);
    expect(JSON.stringify(values)).toBe(before);
  });
});
