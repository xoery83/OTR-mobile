import { describe, expect, it } from "vitest";

import {
  expenseAmountPresentation,
  journeyLifecycleLabel,
  settlementPositionLabel,
  spendingPercentage,
} from "./dashboardPresentation";

describe("Ledger dashboard presentation", () => {
  it("only labels lifecycle when Journey dates make it unambiguous", () => {
    expect(
      journeyLifecycleLabel(
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        "2026-09-14",
      ),
    ).toBe("Active");
    expect(
      journeyLifecycleLabel({ startDate: "2026-10-01", endDate: null }, "2026-09-14"),
    ).toBe("Upcoming");
    expect(
      journeyLifecycleLabel({ startDate: null, endDate: "2026-08-31" }, "2026-09-14"),
    ).toBe("Past");
    expect(
      journeyLifecycleLabel({ startDate: "2026-01-01", endDate: null }, "2026-09-14"),
    ).toBeNull();
  });

  it("uses the signed settlement position without implying a new calculation", () => {
    expect(settlementPositionLabel(-1)).toBe("You owe");
    expect(settlementPositionLabel(1)).toBe("You are owed");
    expect(settlementPositionLabel(0)).toBe("All settled");
  });

  it("keeps category percentages bounded and handles an empty total", () => {
    expect(spendingPercentage(32, 100)).toBe(32);
    expect(spendingPercentage(120, 100)).toBe(100);
    expect(spendingPercentage(-1, 100)).toBe(0);
    expect(spendingPercentage(1, 0)).toBe(0);
  });

  it("presents default-currency shares without repeating the paid currency", () => {
    const foreignSplit = {
      componentMinor: 2840,
      originalCurrency: "EUR",
      originalMinor: 2310,
      originalScale: 2,
      participantCount: 3,
      settlementCurrency: "NZD",
      settlementMinor: 8520,
      settlementParticipation: "INCLUDED" as const,
      settlementScale: 2,
    };
    expect(expenseAmountPresentation(foreignSplit, "MINE")).toEqual({
      primary: "NZ$28.40",
      total: "Total NZ$85.20",
      original: "€23.10",
      splitLabel: "Split",
    });
    expect(expenseAmountPresentation(foreignSplit, "GROUP")).toEqual({
      primary: "NZ$85.20",
      total: null,
      original: "€23.10",
      splitLabel: "Split",
    });
    expect(
      expenseAmountPresentation(
        { ...foreignSplit, settlementParticipation: "EXCLUDED" },
        "MINE",
      ).splitLabel,
    ).toBeNull();
    expect(
      expenseAmountPresentation(
        {
          ...foreignSplit,
          componentMinor: 8520,
          originalCurrency: "NZD",
          originalMinor: 8520,
          participantCount: 1,
        },
        "MINE",
      ),
    ).toEqual({
      primary: "NZ$85.20",
      total: null,
      original: null,
      splitLabel: null,
    });
  });
});
