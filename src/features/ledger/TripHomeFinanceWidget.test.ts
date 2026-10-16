import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import {
  getAccountGeneration,
  advanceAccountGeneration,
} from "@/data/auth/accountGeneration";
import type { TripHomeLedgerSnapshot } from "@/data/repositories/tripHomeLedgerRepository";
import {
  rememberSettlementProjection,
  clearSharedSettlementProjection,
  type SettlementSummaryProjection,
} from "./settlementSummaryProjection";
import {
  financeDataForHome,
  TripHomeFinanceWidget,
  useTripHomeFinanceWidget,
} from "./TripHomeFinanceWidget";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  buttons: [] as { label: string; onPress(): void }[],
  money: [] as any[],
  push: vi.fn(),
  values: [] as any[],
  cursor: 0,
  focus: [] as (() => () => void)[],
  read: vi.fn(),
  reader: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const at = state.cursor++;
    if (!(at in state.values)) state.values[at] = initial;
    return [
      state.values[at],
      (value: any) => {
        state.values[at] = value;
      },
    ];
  },
  useMemo: (fn: () => unknown) => {
    const at = state.cursor++;
    return state.values[at] ?? (state.values[at] = fn());
  },
  useCallback: (fn: any) => fn,
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: any, read: () => number) => read(),
}));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
  StyleSheet: { create: (s: any) => s },
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
vi.mock("expo-router", () => ({
  router: { push: state.push },
  useFocusEffect: (fn: () => () => void) => state.focus.push(fn),
}));
vi.mock("@/data/repositories/tripHomeLedgerRepository", () => ({
  readTripHomeLedgerRepository: () => state.reader(),
}));
vi.mock("@/data/sync/ledgerOperationalSync", () => ({
  subscribeLedgerOperationalSyncCompletion: vi.fn(),
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiButton: (p: any) => {
    state.buttons.push(p);
    return createElement("button", null, p.label);
  },
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/locale", () => ({
  t: (key: string, args: any) => key + (args ? ":" + args.count : ""),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/domainLabels", () => ({ categoryLabel: (category: string) => category }));
vi.mock("./MoneyText", () => ({
  MoneyText: (p: any) => {
    state.money.push(p);
    return createElement(
      "span",
      null,
      p.minor === null ? p.placeholder : String(p.minor),
    );
  },
}));
function snapshot(expenseCount = 1): TripHomeLedgerSnapshot {
  const aggregate = {
    totalMinor: 2000,
    expenseCount,
    includedExpenseIds: ["a"],
    unresolvedRateCount: 0,
    openConflictCount: 0,
  };
  return {
    context: { tripId: "trip", accountId: "actor", generation: getAccountGeneration() },
    journey: {
      journeyId: "trip",
      title: "Trip",
      startDate: null,
      endDate: null,
      settlementCurrency: "NZD",
      settlementScale: 2,
      hasActor: true,
      memberCount: 2,
    },
    memberId: "mine",
    group: aggregate,
    mine: { ...aggregate, totalMinor: 800 },
    expenseCount,
    categories: [{ category: "food", count: expenseCount }],
    recent: expenseCount
      ? [
          {
            id: "a",
            title: "Dinner",
            category: "food",
            occurredAt: "2026-10-10",
            updatedAt: "2026-10-12",
            createdAt: "2026-10-11",
            payerMemberId: "payer",
            originalMinor: 1000,
            originalCurrency: "EUR",
            originalScale: 2,
            totalMinor: 2000,
            personalMinor: 800,
            businessStatus: "ACCEPTED",
            hasOpenConflict: false,
            splits: [],
          },
        ]
      : [],
  };
}
const settlement: SettlementSummaryProjection = {
  projectionId: "projection",
  freshness: "CURRENT",
  sourceAsOf: "2026-10-14",
  sourceFingerprintPolicy: "SETTLEMENT_SOURCE_V1",
  sourceFingerprint: "known",
  balanceMinor: -1200,
  paidMinor: 0,
  shareMinor: 1200,
  currency: "NZD",
  scale: 2,
  confirmedSettlement: null,
  confirmationDiff: [],
};
beforeEach(() => {
  clearSharedSettlementProjection("trip");
  state.values = [];
  state.cursor = 0;
  state.focus = [];
  state.buttons = [];
  state.money = [];
  state.push.mockReset();
  state.read.mockReset();
  state.reader.mockReset();
  state.reader.mockResolvedValue({ read: state.read });
});
function render(data: TripHomeLedgerSnapshot, lifecycle: "Upcoming" | "Active" | "Past") {
  const qualified = financeDataForHome(data, lifecycle);
  return qualified
    ? renderToStaticMarkup(
        createElement(TripHomeFinanceWidget, { data: qualified, lifecycle }),
      )
    : "";
}
it("omits NoData, keeps all-incomplete unavailable instead of zero, and preserves original recent currency", () => {
  expect(financeDataForHome(snapshot(0), "Active")).toBeNull();
  const data = snapshot();
  data.group.expenseCount = 0;
  data.mine.expenseCount = 0;
  data.group.unresolvedRateCount = 1;
  const html = render(data, "Upcoming");
  expect(state.money).toHaveLength(1);
  expect(state.money[0]).toMatchObject({ currency: "EUR", minor: 1000 });
  expect(html).toContain("ui.spendingTotalUnavailable");
  expect(html).toContain("ui.waitingForConfirmedJourneyCurrencyValue");
  expect(html).toContain("analysis.excludedDescription:1");
  expect(html).not.toContain("Add Expense");
  expect(html).not.toContain("ledger.spending");
});
it("uses only current actor/Journey/generation cached Settlement in Past, no history, recent list or settled assertion", () => {
  const data = snapshot(0);
  rememberSettlementProjection("trip", "other-member", false, settlement, null);
  expect(financeDataForHome(data, "Past")).toBeNull();
  rememberSettlementProjection("other-trip", "mine", false, settlement, null);
  expect(financeDataForHome(data, "Past")).toBeNull();
  rememberSettlementProjection("trip", "mine", false, settlement, null);
  const qualified = financeDataForHome(data, "Past")!;
  expect(qualified.settlement).toMatchObject({ freshness: "SAVED", balanceMinor: -1200 });
  const html = render(data, "Past");
  expect(html).toContain("settlement.youOwe");
  expect(html).toContain("ledger.savedCalculation");
  expect(html).not.toContain("ledger.recentExpenses");
  expect(html).not.toContain("settlement.allSettled");
  advanceAccountGeneration();
  expect(financeDataForHome(data, "Past")).toBeNull();
});
it("opens real scoped Spending, Settlement, Analysis and expense detail; stale account callbacks cannot navigate", () => {
  render(snapshot(), "Active");
  state.buttons.find((b) => b.label === "Dinner")!.onPress();
  expect(state.push).toHaveBeenLastCalledWith({
    pathname: "/expenses/expense/[id]",
    params: { id: "a" },
  });
  state.buttons.find((b) => b.label === "tripHome.finance.openSpending")!.onPress();
  expect(state.push).toHaveBeenLastCalledWith({
    pathname: "/expenses/journey/[journeyId]",
    params: { journeyId: "trip" },
  });
  state.buttons.find((b) => b.label === "ledger.seeAnalysis")!.onPress();
  expect(state.push).toHaveBeenLastCalledWith({
    pathname: "/expenses/analysis",
    params: { journeyId: "trip", memberId: "mine", scope: "MINE" },
  });
  state.buttons = [];
  render(snapshot(), "Past");
  const open = state.buttons.find((b) => b.label === "ledger.settlement")!.onPress;
  open();
  expect(state.push).toHaveBeenLastCalledWith({
    pathname: "/expenses/settlement",
    params: { journeyId: "trip", journeyTitle: "Trip" },
  });
  state.push.mockClear();
  advanceAccountGeneration();
  open();
  expect(state.push).not.toHaveBeenCalled();
});
function HookHarness({
  tripId,
  lifecycle,
}: {
  tripId: string | null;
  lifecycle: "Active" | "Past" | null;
}) {
  const widget = useTripHomeFinanceWidget(tripId, lifecycle);
  return widget ? createElement("output", null, widget.id) : null;
}
function hook(tripId: string | null, lifecycle: "Active" | "Past" | null) {
  state.cursor = 0;
  return renderToStaticMarkup(createElement(HookHarness, { tripId, lifecycle }));
}
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
it("actual runtime hook reads its repository and qualifies only current selected Trip, rejecting late reads and account changes", async () => {
  let resolve!: (value: TripHomeLedgerSnapshot) => void;
  state.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  expect(hook("trip", "Active")).toBe("");
  const cancel = state.focus.pop()!();
  await flush();
  expect(state.read).toHaveBeenCalledWith("trip");
  const data = snapshot();
  resolve(data);
  await flush();
  expect(hook("trip", "Active")).toContain("ledger-finance");
  expect(hook("other-trip", "Active")).toBe("");
  expect(hook(null, null)).toBe("");
  advanceAccountGeneration();
  expect(hook("trip", "Active")).toBe("");
  cancel();
});
it("does not publish a superseded asynchronous response after focus cleanup", async () => {
  let resolve!: (value: TripHomeLedgerSnapshot) => void;
  state.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  hook("trip", "Active");
  const cancel = state.focus.pop()!();
  await flush();
  const data = snapshot();
  cancel();
  resolve(data);
  await flush();
  expect(hook("trip", "Active")).toBe("");
});

it("renders an owning known zero only when accepted valued entries exist", () => {
  const data = snapshot();
  data.mine.totalMinor = 0;
  const html = render(data, "Active");
  expect(state.money.slice(0, 2).map((item) => item.minor)).toEqual([2000, 0]);
  expect(html).not.toContain("ui.spendingTotalUnavailable");
});
