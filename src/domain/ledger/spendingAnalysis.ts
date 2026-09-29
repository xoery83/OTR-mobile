import type { LedgerJourneyContext } from "./journeyContext";
import { reportingDateBoundary, type ReportingScope } from "./reporting";

export type AnalysisExpense = {
  id: string;
  title: string;
  category: string;
  occurredAt: string;
  updatedAt: string;
  payerMemberId: string;
  originalMinor: number;
  originalCurrency: string;
  originalScale: number;
  totalMinor: number | null;
  personalMinor: number | null;
  businessStatus: string;
  hasOpenConflict: boolean;
  splits: { memberId: string; minor: number | null }[];
};
export type AnalysisDataset = {
  journey: LedgerJourneyContext;
  members: { id: string; label: string }[];
  expenses: AnalysisExpense[];
  hasExpensesOutsideRange: boolean;
};
export type AnalysisRange = { from?: string; to?: string };
export type AnalysisRangePreset = "ENTIRE" | "LAST_30" | "MONTH" | "YEAR" | "CUSTOM";
export type AnalysisCategory = {
  key: string;
  label: string;
  categories: string[];
  totalMinor: number;
  percentage: number;
  expenses: AnalysisExpense[];
};
export type AnalysisPeriod = {
  key: string;
  from: string;
  to: string;
  totalMinor: number;
  expenseCount: number;
  categories: { key: string; totalMinor: number }[];
};

const dayMs = 86_400_000;
export function analysisDay(value: string) {
  return value.slice(0, 10);
}
export function addAnalysisDays(value: string, days: number) {
  return new Date(Date.parse(`${analysisDay(value)}T00:00:00.000Z`) + days * dayMs)
    .toISOString()
    .slice(0, 10);
}
export function analysisDayCount(from: string, through: string) {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${through}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
        dayMs,
    ) + 1,
  );
}
export function analysisDateBounds(from: string, through: string): AnalysisRange | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through))
    return null;
  const dates = [from, through].map((day) => new Date(`${day}T00:00:00.000Z`));
  if (
    dates.some(
      (date, index) =>
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== [from, through][index],
    ) ||
    from > through
  )
    return null;
  return {
    from: dates[0]!.toISOString(),
    to: `${addAnalysisDays(through, 1)}T00:00:00.000Z`,
  };
}
export function analysisRangePresets(duration: number): AnalysisRangePreset[] {
  if (duration <= 30) return [];
  if (duration <= 90) return ["ENTIRE", "LAST_30", "CUSTOM"];
  if (duration <= 365) return ["ENTIRE", "MONTH", "LAST_30", "CUSTOM"];
  return ["ENTIRE", "MONTH", "YEAR", "CUSTOM"];
}
export function analysisPresetBounds(
  preset: AnalysisRangePreset,
  today: string,
): AnalysisRange {
  if (preset === "ENTIRE" || preset === "CUSTOM") return {};
  if (preset === "LAST_30")
    return analysisDateBounds(addAnalysisDays(today, -29), today)!;
  const from =
    preset === "YEAR" ? `${today.slice(0, 4)}-01-01` : `${today.slice(0, 7)}-01`;
  const date = new Date(`${from}T00:00:00.000Z`);
  if (preset === "YEAR") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return { from: `${from}T00:00:00.000Z`, to: date.toISOString() };
}
export function analysisAmount(expense: AnalysisExpense, scope: ReportingScope) {
  return scope === "MINE" ? expense.personalMinor : expense.totalMinor;
}
export function analysisIncluded(expense: AnalysisExpense, scope: ReportingScope) {
  return (
    expense.businessStatus === "ACCEPTED" &&
    !expense.hasOpenConflict &&
    expense.totalMinor !== null &&
    analysisAmount(expense, scope) !== null
  );
}
function plus(a: number, b: number) {
  const result = a + b;
  if (!Number.isSafeInteger(result))
    throw new Error("Analysis amount exceeds safe integer precision.");
  return result;
}
export function analysisPercentage(amount: number, total: number) {
  return total > 0 ? Math.round((amount / total) * 1000) / 10 : 0;
}
function ranked<T extends { totalMinor: number; label: string }>(rows: T[]) {
  return rows.sort(
    (a, b) => b.totalMinor - a.totalMinor || a.label.localeCompare(b.label),
  );
}
export function analysisRanks<T extends { totalMinor: number }>(rows: T[]) {
  let rank = 0;
  return rows.map((row, index) => {
    if (!index || row.totalMinor !== rows[index - 1]!.totalMinor) rank = index + 1;
    return { ...row, rank };
  });
}

// Display-only scaling: exact money remains in the projection and briefs.
export function analysisUsesLogScale(periods: AnalysisPeriod[]) {
  const positive = periods
    .map((period) => period.totalMinor)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  if (positive.length < 3) return false;
  const middle = Math.floor(positive.length / 2);
  const median =
    positive.length % 2
      ? positive[middle]!
      : (positive[middle - 1]! + positive[middle]!) / 2;
  const max = positive.at(-1)!;
  const total = positive.reduce((sum, value) => sum + value, 0);
  return max / total > 0.6 && max / median >= 10;
}
export function analysisScaledFraction(
  value: number,
  maximum: number,
  scale: number,
  log: boolean,
) {
  if (maximum <= 0 || value <= 0) return 0;
  const unit = 10 ** scale;
  return log ? Math.log1p(value / unit) / Math.log1p(maximum / unit) : value / maximum;
}

export function buildSpendingAnalysis(
  dataset: AnalysisDataset,
  memberId: string,
  scope: ReportingScope,
  range: AnalysisRange,
  today: string,
) {
  const all = dataset.expenses;
  const scoped = all.filter(
    (expense) =>
      (!range.from || expense.occurredAt >= reportingDateBoundary(range.from)) &&
      (!range.to || expense.occurredAt < reportingDateBoundary(range.to)),
  );
  const relevant = scoped.filter(
    (expense) =>
      scope === "GROUP" || expense.splits.some((split) => split.memberId === memberId),
  );
  const included = relevant.filter((expense) => analysisIncluded(expense, scope));
  const incomplete = relevant.filter((expense) => !analysisIncluded(expense, scope));
  const expenses = [...included].sort(
    (a, b) =>
      (analysisAmount(b, scope) ?? 0) - (analysisAmount(a, scope) ?? 0) ||
      a.id.localeCompare(b.id),
  );
  const totalMinor = included.reduce(
    (sum, expense) => plus(sum, analysisAmount(expense, scope)!),
    0,
  );
  const categoryMap = new Map<string, AnalysisCategory>();
  const days = new Map<
    string,
    { totalMinor: number; expenses: AnalysisExpense[]; categories: Map<string, number> }
  >();
  for (const expense of expenses) {
    const amount = analysisAmount(expense, scope)!;
    const category = categoryMap.get(expense.category) ?? {
      key: expense.category,
      label: expense.category,
      categories: [expense.category],
      totalMinor: 0,
      percentage: 0,
      expenses: [],
    };
    category.totalMinor = plus(category.totalMinor, amount);
    category.expenses.push(expense);
    categoryMap.set(expense.category, category);
    const key = analysisDay(expense.occurredAt);
    const day = days.get(key) ?? {
      totalMinor: 0,
      expenses: [],
      categories: new Map<string, number>(),
    };
    day.totalMinor = plus(day.totalMinor, amount);
    day.expenses.push(expense);
    day.categories.set(
      expense.category,
      plus(day.categories.get(expense.category) ?? 0, amount),
    );
    days.set(key, day);
  }
  const categories = ranked([...categoryMap.values()]).map((category) => ({
    ...category,
    percentage: analysisPercentage(category.totalMinor, totalMinor),
  }));
  for (const category of categories)
    category.expenses.sort(
      (a, b) =>
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id),
    );
  const visible = categories.filter(
    (category) => totalMinor === 0 || category.totalMinor / totalMinor >= 0.03,
  );
  const kept =
    visible.length > 6 || visible.length < categories.length
      ? visible.slice(0, 5)
      : visible;
  const keptKeys = new Set(kept.map((category) => category.key));
  const remaining = categories.filter((category) => !keptKeys.has(category.key));
  const displayedCategories = remaining.length
    ? [
        ...kept,
        {
          key: "__analysis_other_categories__",
          label: "Other categories",
          categories: remaining.flatMap((item) => item.categories),
          totalMinor: remaining.reduce((sum, item) => plus(sum, item.totalMinor), 0),
          percentage: analysisPercentage(
            remaining.reduce((sum, item) => plus(sum, item.totalMinor), 0),
            totalMinor,
          ),
          expenses: remaining
            .flatMap((category) => category.expenses)
            .sort(
              (a, b) =>
                Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
                a.id.localeCompare(b.id),
            ),
        },
      ]
    : kept;
  const dateKeys = all.map((expense) => analysisDay(expense.occurredAt)).sort();
  const journeyStart = dataset.journey.startDate?.slice(0, 10);
  const journeyEnd = dataset.journey.endDate?.slice(0, 10);
  const extentStart =
    [journeyStart, dateKeys[0]].filter((day): day is string => !!day).sort()[0] ?? today;
  const extentEnd =
    [journeyEnd, dateKeys.at(-1)]
      .filter((day): day is string => !!day)
      .sort()
      .at(-1) ?? extentStart;
  const from = range.from ? analysisDay(range.from) : extentStart;
  const through = range.to ? addAnalysisDays(range.to, -1) : extentEnd;
  const calendarDays = analysisDayCount(from, through);
  const averageFrom = range.from ? from : (journeyStart ?? from);
  const elapsedDays = analysisDayCount(averageFrom, through < today ? through : today);
  const duration =
    journeyStart && journeyEnd
      ? analysisDayCount(journeyStart, journeyEnd)
      : analysisDayCount(extentStart, extentEnd);
  const granularity =
    calendarDays <= 90 ? "Daily" : calendarDays <= 365 ? "Weekly" : "Monthly";
  const periods: AnalysisPeriod[] = [];
  for (let date = from; date <= through;) {
    let end: string;
    if (granularity === "Monthly") {
      const next = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      end = next.toISOString().slice(0, 10);
    } else end = addAnalysisDays(date, granularity === "Weekly" ? 7 : 1);
    const toDay = end <= through ? end : addAnalysisDays(through, 1);
    const stack = new Map<string, number>();
    let amount = 0;
    let count = 0;
    for (let day = date; day < toDay; day = addAnalysisDays(day, 1)) {
      const value = days.get(day);
      if (!value) continue;
      amount = plus(amount, value.totalMinor);
      count += value.expenses.length;
      for (const [category, minor] of value.categories)
        stack.set(category, plus(stack.get(category) ?? 0, minor));
    }
    periods.push({
      key: date,
      from: `${date}T00:00:00.000Z`,
      to: `${toDay}T00:00:00.000Z`,
      totalMinor: amount,
      expenseCount: count,
      categories: [...stack]
        .map(([key, totalMinor]) => ({ key, totalMinor }))
        .sort((a, b) => b.totalMinor - a.totalMinor || a.key.localeCompare(b.key)),
    });
    date = toDay;
  }
  const highestDay = [...days].sort(
    ([a, av], [b, bv]) => bv.totalMinor - av.totalMinor || a.localeCompare(b),
  )[0];
  const { travellers, payers } = aggregateAnalysisPeople(scoped, dataset.members);
  const state =
    relevant.length === 0
      ? !!range.from && dataset.hasExpensesOutsideRange
        ? "EMPTY_RANGE"
        : "EMPTY"
      : included.length === 0
        ? "UNAVAILABLE"
        : "READY";
  const insights: { label: string; value: string | number; money?: boolean }[] = [];
  const ownRank = travellers.find((member) => member.key === memberId)?.rank;
  if (scope === "MINE" && travellers.length >= 2 && ownRank)
    insights.push({
      label: "Spending rank",
      value: `#${ownRank} of ${travellers.length}`,
    });
  if (categories[0])
    insights.push({ label: "Largest category", value: categories[0].label });
  if (highestDay) insights.push({ label: "Biggest spending day", value: highestDay[0] });
  if (included.length)
    insights.push({
      label: "Average expense",
      value: Math.round(totalMinor / included.length),
      money: true,
    });
  if (insights.length < 4)
    insights.push({ label: "Expense count", value: included.length });
  return {
    scope,
    totalMinor,
    expenseCount: included.length,
    incomplete,
    state,
    categories,
    displayedCategories,
    expenses,
    periods,
    highestDay: highestDay
      ? { date: highestDay[0], totalMinor: highestDay[1].totalMinor }
      : null,
    elapsedDays,
    averageMinor: elapsedDays ? Math.round(totalMinor / elapsedDays) : null,
    calendarDays,
    duration,
    granularity,
    travellers,
    payers,
    insights: insights.slice(0, 4),
  };
}

export function aggregateAnalysisPeople(
  expenses: AnalysisExpense[],
  members: AnalysisDataset["members"],
  category: string | null = null,
) {
  const travellerMap = new Map(
    members.map((member) => [
      member.id,
      {
        key: member.id,
        label: member.label,
        totalMinor: 0,
        expenseCount: 0,
        categories: new Map<string, number>(),
      },
    ]),
  );
  const memberLabels = new Map(members.map((member) => [member.id, member.label]));
  const payerMap = new Map<
    string,
    { key: string; label: string; totalMinor: number; expenseCount: number }
  >();
  for (const expense of expenses) {
    if (
      !analysisIncluded(expense, "GROUP") ||
      (category && expense.category !== category)
    )
      continue;
    for (const split of expense.splits) {
      const traveller = travellerMap.get(split.memberId);
      if (!traveller || split.minor === null) continue;
      traveller.totalMinor = plus(traveller.totalMinor, split.minor);
      traveller.expenseCount++;
      traveller.categories.set(
        expense.category,
        plus(traveller.categories.get(expense.category) ?? 0, split.minor),
      );
    }
    const payer = payerMap.get(expense.payerMemberId) ?? {
      key: expense.payerMemberId,
      label: memberLabels.get(expense.payerMemberId) ?? "Traveller",
      totalMinor: 0,
      expenseCount: 0,
    };
    payer.totalMinor = plus(payer.totalMinor, expense.totalMinor!);
    payer.expenseCount++;
    payerMap.set(payer.key, payer);
  }
  const travellers = analysisRanks(ranked([...travellerMap.values()])).map(
    (traveller) => ({
      ...traveller,
      categories: ranked(
        [...traveller.categories].map(([key, totalMinor]) => ({
          key,
          label: key,
          totalMinor,
        })),
      ),
    }),
  );
  const payers = ranked([...payerMap.values()]);
  return { travellers, payers };
}
