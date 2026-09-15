import { describe, expect, it } from "vitest";

import { buildDraftSplits, parsePercentageUnits } from "./expenseDraft";

const members = [
  { id: "a", displayName: "A", householdId: "home-a", shareUnits: 1000 },
  { id: "b", displayName: "B", householdId: "home-a", shareUnits: 1000 },
  { id: "c", displayName: "C", householdId: "home-b", shareUnits: 1000 },
];

describe("Expense draft allocation", () => {
  it("uses existing deterministic Household allocation", () => {
    const splits = buildDraftSplits({
      mode: "EQUAL_HOUSEHOLD",
      originalMinor: 1200,
      settlementMinor: 1200,
      members,
    });
    expect(splits.map((split) => split.originalMinor)).toEqual([300, 300, 600]);
    expect(
      buildDraftSplits({
        mode: "EQUAL_HOUSEHOLD",
        originalMinor: 5,
        settlementMinor: 5,
        members: members.slice(1),
      }).map((split) => split.originalMinor),
    ).toEqual([3, 2]);
    expect(() =>
      buildDraftSplits({
        mode: "EQUAL_HOUSEHOLD",
        originalMinor: 100,
        settlementMinor: 100,
        members: [{ ...members[0], householdId: null }],
      }),
    ).toThrow(/needs a Household/);
  });

  it("validates exact and percentage totals", () => {
    expect(
      buildDraftSplits({
        mode: "EXACT",
        originalMinor: 100,
        settlementMinor: null,
        members: members.slice(0, 2),
        exactMinor: { a: 40, b: 60 },
      }).map((split) => split.originalMinor),
    ).toEqual([40, 60]);
    expect(parsePercentageUnits("33.3333")).toBe(333_333);
    expect(parsePercentageUnits("100.0001")).toBeNull();
  });
});
