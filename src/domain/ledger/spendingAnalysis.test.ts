import { describe, expect, it } from "vitest";
import {
  aggregateAnalysisPeople,
  analysisUsesLogScale,
  analysisScaledFraction,
  analysisDateBounds,
  analysisPresetBounds,
  analysisRangePresets,
  buildSpendingAnalysis,
  type AnalysisDataset,
  type AnalysisExpense,
} from "./spendingAnalysis";

function expense(id: string, overrides: Partial<AnalysisExpense> = {}): AnalysisExpense {
  return {
    id,
    title: id,
    category: "food",
    occurredAt: "2026-09-02T08:00:00.000Z",
    updatedAt: "2026-09-02T08:00:00.000Z",
    payerMemberId: "a",
    originalMinor: 1000,
    originalCurrency: "EUR",
    originalScale: 2,
    totalMinor: 2000,
    personalMinor: 500,
    businessStatus: "ACCEPTED",
    hasOpenConflict: false,
    splits: [
      { memberId: "a", minor: 500 },
      { memberId: "b", minor: 1500 },
    ],
    ...overrides,
  };
}
function dataset(expenses = [expense("dinner")], end = "2026-09-12"): AnalysisDataset {
  return {
    journey: {
      journeyId: "j",
      title: "Journey",
      startDate: "2026-09-01",
      endDate: end,
      settlementCurrency: "NZD",
      settlementScale: 2,
    },
    members: [
      { id: "a", label: "Alex" },
      { id: "b", label: "Bea" },
    ],
    expenses,
    hasExpensesOutsideRange: expenses.length > 0,
  };
}
const build = (data: AnalysisDataset, scope: "MINE" | "GROUP" = "MINE", range = {}) =>
  buildSpendingAnalysis(data, "a", scope, range, "2026-09-06");

describe("Spending Analysis dashboard", () => {
  it("keeps Mine share and Group full expense distinct", () => {
    expect(build(dataset()).totalMinor).toBe(500);
    expect(build(dataset(), "GROUP").totalMinor).toBe(2000);
    expect(build(dataset()).categories[0]).toMatchObject({
      percentage: 100,
      totalMinor: 500,
    });
  });
  it("counts elapsed calendar days including zero days, never future trip days", () => {
    const view = build(dataset());
    expect(view.elapsedDays).toBe(6);
    expect(view.averageMinor).toBe(83);
    expect(view.calendarDays).toBe(12);
    expect(view.periods).toHaveLength(12);
    expect(view.periods[0]?.totalMinor).toBe(0);
    expect(view.highestDay).toEqual({ date: "2026-09-02", totalMinor: 500 });
  });
  it("uses selected period days and has no average for an upcoming trip", () => {
    const data = dataset();
    data.journey.startDate = "2026-09-10";
    data.expenses = [];
    expect(build(data).averageMinor).toBeNull();
    expect(
      build(dataset(), "MINE", analysisDateBounds("2026-09-02", "2026-09-03")!)
        .elapsedDays,
    ).toBe(2);
  });
  it("anchors entire-trip average to Journey start even with earlier expenses", () => {
    const data = dataset();
    data.journey.startDate = "2026-09-06";
    expect(build(data).elapsedDays).toBe(1);
    expect(build(data).averageMinor).toBe(500);
  });
  it("orders biggest Expenses by share in Mine and full value in Group", () => {
    const data = dataset([
      expense("large-total", { totalMinor: 9000, personalMinor: 100 }),
      expense("large-share", { totalMinor: 4000, personalMinor: 3000 }),
    ]);
    expect(build(data).expenses.map((item) => item.id)).toEqual([
      "large-share",
      "large-total",
    ]);
    expect(build(data, "GROUP").expenses.map((item) => item.id)).toEqual([
      "large-total",
      "large-share",
    ]);
  });
  it("folds >6 categories as Top 5 and a distinct union, retaining the real other", () => {
    const data = dataset(
      Array.from({ length: 8 }, (_, index) =>
        expense(`e${index}`, {
          category: index === 0 ? "other" : `c${index}`,
          personalMinor: 800 - index * 100,
        }),
      ),
    );
    const view = build(data);
    expect(view.displayedCategories).toHaveLength(6);
    expect(view.displayedCategories[0]?.key).toBe("other");
    expect(view.displayedCategories[5]?.key).toBe("__analysis_other_categories__");
    expect(view.displayedCategories[5]?.categories).toEqual(["c5", "c6", "c7"]);
    expect(
      view.displayedCategories.reduce((sum, category) => sum + category.totalMinor, 0),
    ).toBe(view.totalMinor);
    expect(build(dataset(data.expenses.slice(0, 6))).displayedCategories).toHaveLength(6);
  });
  it("folds sub-3% categories without losing money or original category identities", () => {
    const view = build(
      dataset([
        expense("big", { category: "food", personalMinor: 9800 }),
        expense("small", { category: "other", personalMinor: 200 }),
      ]),
    );
    expect(view.displayedCategories.map((item) => item.key)).toEqual([
      "food",
      "__analysis_other_categories__",
    ]);
    expect(view.displayedCategories[1]).toMatchObject({
      totalMinor: 200,
      categories: ["other"],
    });
    expect(view.categories.map((item) => item.key)).toEqual(["food", "other"]);
    expect(view.displayedCategories.reduce((sum, item) => sum + item.totalMinor, 0)).toBe(
      view.totalMinor,
    );
    const boundary = build(
      dataset([
        expense("big", { personalMinor: 9700 }),
        expense("edge", { category: "car", personalMinor: 300 }),
      ]),
    );
    expect(boundary.displayedCategories.map((item) => item.key)).toEqual(["food", "car"]);
  });
  it("previews recently modified records while keeping Biggest ordered by amount", () => {
    const view = build(
      dataset([
        expense("large", { personalMinor: 9000, updatedAt: "2026-09-01T00:00:00Z" }),
        expense("recent", { personalMinor: 100, updatedAt: "2026-09-29T00:00:00Z" }),
      ]),
    );
    expect(view.expenses.map((item) => item.id)).toEqual(["large", "recent"]);
    expect(view.categories[0]!.expenses.map((item) => item.id)).toEqual([
      "recent",
      "large",
    ]);
  });
  it("uses log only for a dominant outlier and preserves cumulative stack geometry and currency scale", () => {
    const periods = [100, 200, 10000].map((totalMinor) => ({ totalMinor })) as Parameters<
      typeof analysisUsesLogScale
    >[0];
    expect(analysisUsesLogScale(periods)).toBe(true);
    expect(
      analysisUsesLogScale(periods.map((period) => ({ ...period, totalMinor: 200 }))),
    ).toBe(false);
    expect(analysisUsesLogScale(periods.slice(1))).toBe(false);
    expect(analysisScaledFraction(0, 10000, 2, true)).toBe(0);
    expect(analysisScaledFraction(10000, 10000, 2, true)).toBe(1);
    expect(analysisScaledFraction(100, 10000, 2, true)).toBeCloseTo(
      analysisScaledFraction(1, 100, 0, true),
    );
    const lower = analysisScaledFraction(100, 10000, 2, true);
    const upper = analysisScaledFraction(300, 10000, 2, true);
    expect(lower + (upper - lower)).toBeCloseTo(upper);
    expect(analysisScaledFraction(300, 10000, 2, false)).toBe(0.03);
  });
  it("partitions incomplete records once and keeps meaningful unavailable/empty states", () => {
    const bad = [
      expense("rate", {
        businessStatus: "RATE_REQUIRED",
        totalMinor: null,
        personalMinor: null,
      }),
      expense("conflict", { hasOpenConflict: true }),
      expense("draft", { businessStatus: "DRAFT" }),
    ];
    expect(build(dataset(bad))).toMatchObject({
      state: "UNAVAILABLE",
      totalMinor: 0,
      expenseCount: 0,
    });
    expect(build(dataset(bad)).incomplete).toHaveLength(3);
    expect(build(dataset([expense("good"), ...bad]))).toMatchObject({
      state: "READY",
      expenseCount: 1,
      totalMinor: 500,
    });
    expect(build(dataset([])).state).toBe("EMPTY");
    const data = dataset([]);
    data.hasExpensesOutsideRange = true;
    expect(
      build(data, "GROUP", analysisDateBounds("2026-09-03", "2026-09-04")!).state,
    ).toBe("EMPTY_RANGE");
  });
  it("preserves zero share identities and excludes unrelated personal records", () => {
    const data = dataset([
      expense("zero", { personalMinor: 0, splits: [{ memberId: "a", minor: 0 }] }),
      expense("unrelated", {
        personalMinor: null,
        splits: [{ memberId: "b", minor: 2000 }],
      }),
    ]);
    expect(build(data)).toMatchObject({ state: "READY", expenseCount: 1, totalMinor: 0 });
    expect(build(data).expenses.map((item) => item.id)).toEqual(["zero"]);
  });
  it("calculates traveller consumption, competition ties and payer full values", () => {
    const data = dataset([
      expense("equal", {
        personalMinor: 1000,
        splits: [
          { memberId: "a", minor: 1000 },
          { memberId: "b", minor: 1000 },
        ],
      }),
    ]);
    data.members.push({ id: "c", label: "Cam" });
    const view = build(data, "GROUP");
    expect(view.travellers.map((item) => [item.key, item.totalMinor, item.rank])).toEqual(
      [
        ["a", 1000, 1],
        ["b", 1000, 1],
        ["c", 0, 3],
      ],
    );
    expect(view.payers[0]).toMatchObject({ key: "a", totalMinor: 2000 });
    expect(build(data).insights[0]).toEqual({ label: "Spending rank", value: "#1 of 3" });
    expect(
      aggregateAnalysisPeople(data.expenses, data.members, "transport").payers,
    ).toEqual([]);
    expect(
      aggregateAnalysisPeople(data.expenses, data.members, "food").travellers[0]
        ?.totalMinor,
    ).toBe(1000);
  });
  it("propagates Range to summary, category, timeline, people, payer and biggest", () => {
    const data = dataset([
      expense("inside"),
      expense("outside", { occurredAt: "2026-09-08T08:00:00.000Z" }),
    ]);
    const view = build(data, "GROUP", analysisDateBounds("2026-09-02", "2026-09-02")!);
    expect(view.totalMinor).toBe(2000);
    expect(view.expenseCount).toBe(1);
    expect(view.periods).toHaveLength(1);
    expect(view.payers[0]?.totalMinor).toBe(2000);
    expect(view.travellers.find((item) => item.key === "b")?.totalMinor).toBe(1500);
    expect(view.categories[0]?.expenses.map((item) => item.id)).toEqual(["inside"]);
    expect(view.expenses.map((item) => item.id)).toEqual(["inside"]);
  });
  it("uses Daily through 90, 7-day range-anchored Weekly through 365, then calendar Monthly", () => {
    for (const [end, granularity] of [
      ["2026-09-30", "Daily"],
      ["2026-11-29", "Daily"],
      ["2026-11-30", "Weekly"],
      ["2027-08-31", "Weekly"],
      ["2027-09-01", "Monthly"],
    ]) {
      const view = build(dataset(undefined, end), "GROUP");
      expect(view.granularity).toBe(granularity);
      expect(view.periods.reduce((sum, item) => sum + item.totalMinor, 0)).toBe(
        view.totalMinor,
      );
    }
  });
  it("uses duration-specific Range menus and validates exact calendar dates", () => {
    expect(analysisRangePresets(30)).toEqual([]);
    expect(analysisRangePresets(31)).toEqual(["ENTIRE", "LAST_30", "CUSTOM"]);
    expect(analysisRangePresets(91)).toEqual(["ENTIRE", "MONTH", "LAST_30", "CUSTOM"]);
    expect(analysisRangePresets(366)).toEqual(["ENTIRE", "MONTH", "YEAR", "CUSTOM"]);
    expect(analysisDateBounds("2026-02-30", "2026-03-01")).toBeNull();
    expect(analysisDateBounds("2026-09-03", "2026-09-02")).toBeNull();
    expect(analysisPresetBounds("LAST_30", "2026-09-29")).toEqual({
      from: "2026-08-31T00:00:00.000Z",
      to: "2026-09-30T00:00:00.000Z",
    });
    expect(analysisPresetBounds("MONTH", "2026-09-29").to).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    expect(analysisPresetBounds("YEAR", "2026-09-29").to).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
  it("never guesses meal/accommodation category semantics and caps insights at four", () => {
    const view = build(dataset());
    expect(view.insights).toHaveLength(4);
    expect(
      view.insights.some((item) => /meal|Transport\/day|Accommodation/.test(item.label)),
    ).toBe(false);
    const data = dataset();
    data.members = [data.members[0]!];
    expect(build(data).insights.some((item) => item.label === "Spending rank")).toBe(
      false,
    );
  });
});
