import { describe, expect, it } from "vitest";

import { changedExpenseGroups } from "./conflict";

const expense = {
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

describe("Ledger conflict groups", () => {
  it("keeps Financial Core atomic and descriptive changes separate", () => {
    expect(
      changedExpenseGroups(expense, {
        ...expense,
        title: "Dinner corrected",
        original: { ...expense.original, minor: 1300 },
      }),
    ).toEqual(["FINANCIAL_CORE", "DESCRIPTIVE"]);
  });
});
