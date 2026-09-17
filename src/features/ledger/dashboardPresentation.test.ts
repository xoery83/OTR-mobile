import { describe, expect, it } from "vitest";

import {
  expenseAmountPresentation,
  journeyLifecycleLabel,
  journeyPickerSections,
  settlementPositionLabel,
  shortMemberName,
  spendingMembers,
  spendingPercentage,
} from "./dashboardPresentation";

describe("Ledger dashboard presentation", () => {
  it("orders members by attributed spending and shortens long names", () => {
    const members = [
      { id: "a", label: "Alexandra Wellington" },
      { id: "b", label: "Bo Chen" },
      { id: "c", label: "Casey Lee" },
    ];
    const spending = [
      { key: "b", totalMinor: 800 },
      { key: "a", totalMinor: 1200 },
    ] as Parameters<typeof spendingMembers>[1];
    expect(spendingMembers(members, spending).map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(shortMemberName(members[0].label)).toBe("Alexandra");
  });

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

  it("groups selectable Journeys and hides development records by default", () => {
    const journey = {
      endDate: "2026-09-30",
      hasActor: true,
      journeyId: "active",
      memberCount: 8,
      settlementCurrency: "NZD",
      settlementScale: 2,
      startDate: "2026-09-01",
      title: "Iceland",
    };
    expect(
      journeyPickerSections(
        [
          journey,
          {
            ...journey,
            journeyId: "upcoming",
            startDate: "2026-10-01",
            endDate: "2026-10-20",
            title: "Japan",
          },
          {
            ...journey,
            journeyId: "past",
            startDate: "2026-07-01",
            endDate: "2026-07-20",
            title: "France",
          },
          { ...journey, journeyId: "test", title: "Stage 9 Acceptance" },
          { ...journey, journeyId: "broken", hasActor: false, title: "Broken" },
        ],
        "2026-09-16",
        "active",
      ).map((section) => [section.title, section.data.map((item) => item.journeyId)]),
    ).toEqual([
      ["Active", ["active"]],
      ["Upcoming", ["upcoming"]],
      ["Past", ["past"]],
    ]);
    expect(
      journeyPickerSections(
        [{ ...journey, journeyId: "test", title: "Stage 9 Acceptance" }],
        "2026-09-16",
        null,
        "",
        true,
      )[0].data[0].journeyId,
    ).toBe("test");
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
      originalComponentMinor: 770,
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
      original: "€7.70",
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
