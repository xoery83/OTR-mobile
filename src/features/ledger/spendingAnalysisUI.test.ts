import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import {
  buildSpendingAnalysis,
  type AnalysisDataset,
} from "@/domain/ledger/spendingAnalysis";
import { LedgerAnalysisScreen } from "./LedgerAnalysisScreen";
import {
  AnalysisCategories,
  AnalysisCategoryMenu,
  AnalysisExpenseRows,
  AnalysisInsights,
  AnalysisPeople,
  AnalysisSkeleton,
  AnalysisTimeline,
} from "./SpendingAnalysisSections";

// Small hook/event harness: verifies screen transitions and read ownership without
// a new renderer dependency. Native layout/material/scroll are Simulator checks.
const ui = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  focus: null as null | (() => (() => void) | void),
  cleanup: null as null | (() => void),
  initial: {} as Record<number, unknown>,
  projection: vi.fn(),
  params: { journeyId: "j", memberId: "a", scope: "MINE" },
  options: vi.fn(),
  fontScale: 1,
  push: vi.fn(),
  nav: { getParent: () => ({ setOptions: ui.options }) },
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState(initial: unknown) {
      const index = ui.cursor++;
      if (!(index in ui.slots))
        ui.slots[index] =
          index in ui.initial
            ? ui.initial[index]
            : typeof initial === "function"
              ? (initial as () => unknown)()
              : initial;
      return [
        ui.slots[index],
        (value: unknown) => {
          ui.slots[index] =
            typeof value === "function"
              ? (value as (prior: unknown) => unknown)(ui.slots[index])
              : value;
        },
      ];
    },
    useLayoutEffect(callback: () => void, deps: unknown[]) {
      const index = ui.cursor++;
      const prior = ui.slots[index] as unknown[] | undefined;
      if (!prior || deps.some((dep, i) => dep !== prior[i])) {
        ui.slots[index] = deps;
        callback();
      }
    },
    useRef(initial: unknown) {
      const index = ui.cursor++;
      ui.slots[index] ??= { current: initial };
      return ui.slots[index];
    },
    useMemo(factory: () => unknown, deps: unknown[]) {
      const index = ui.cursor++;
      const prior = ui.slots[index] as { value: unknown; deps: unknown[] } | undefined;
      if (!prior || deps.some((dep, i) => dep !== prior.deps[i]))
        ui.slots[index] = { value: factory(), deps };
      return (ui.slots[index] as { value: unknown }).value;
    },
    useCallback(callback: unknown, deps: unknown[]) {
      const index = ui.cursor++;
      const prior = ui.slots[index] as { callback: unknown; deps: unknown[] } | undefined;
      if (!prior || deps.some((dep, i) => dep !== prior.deps[i]))
        ui.slots[index] = { callback, deps };
      return (ui.slots[index] as { callback: unknown }).callback;
    },
  };
});
vi.mock("react-native", () => ({
  ActivityIndicator: "spinner",
  Modal: "modal",
  Platform: { OS: "ios" },
  Pressable: "button",
  ScrollView: "scroll",
  Text: "text",
  TextInput: "input",
  View: "view",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  useWindowDimensions: () => ({ fontScale: ui.fontScale, width: 375 }),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: "stack" },
  router: { push: ui.push },
  useLocalSearchParams: () => ui.params,
  useNavigation: () => ui.nav,
  useFocusEffect: (callback: () => (() => void) | void) => {
    if (ui.focus !== callback) {
      ui.cleanup?.();
      ui.focus = callback;
      ui.cleanup = callback() ?? null;
    }
  },
}));
vi.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 96 }));
vi.mock("expo-glass-effect", () => ({
  GlassView: "glass",
  isLiquidGlassAvailable: () => true,
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "icon" }));
vi.mock("./LedgerSheetHeader", () => ({ LedgerSheetHeader: "sheet-header" }));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: async () => ({
    loadSpendingAnalysisProjection: ui.projection,
  }),
}));

function data(days = 30): AnalysisDataset {
  return {
    journey: {
      journeyId: "j",
      title: "Native QA",
      startDate: "2026-09-01",
      endDate: new Date(Date.UTC(2026, 8, days)).toISOString().slice(0, 10),
      settlementCurrency: "NZD",
      settlementScale: 2,
    },
    members: [
      { id: "a", label: "Alex" },
      { id: "b", label: "Bea" },
    ],
    hasExpensesOutsideRange: true,
    expenses: Array.from({ length: 5 }, (_, index) => ({
      id: `e${index}`,
      title: `Expense ${index}`,
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
    })),
  };
}
function nodes(element: unknown): ReactElement<Record<string, unknown>>[] {
  if (!element || typeof element !== "object" || !("props" in element)) return [];
  const node = element as ReactElement<Record<string, unknown>>;
  return [node, ...[node.props.children, node.props.action].flat(2).flatMap(nodes)];
}
function texts(element: unknown): string {
  return nodes(element)
    .flatMap((node) =>
      [node.props.children]
        .flat(2)
        .filter((child) => typeof child === "string" || typeof child === "number"),
    )
    .join(" ");
}
function render() {
  ui.cursor = 0;
  return LedgerAnalysisScreen();
}
async function ready(dataset = data()) {
  ui.projection.mockResolvedValue(dataset);
  render();
  await new Promise<void>((resolve) => setImmediate(resolve));
  return render();
}
function press(node: ReactElement<Record<string, unknown>>) {
  (node.props.onPress as () => void)();
}

beforeEach(() => {
  ui.cleanup?.();
  ui.slots = [];
  ui.cursor = 0;
  ui.initial = {};
  ui.focus = null;
  ui.cleanup = null;
  ui.projection.mockReset();
  ui.options.mockClear();
  ui.push.mockClear();
  ui.params.scope = "MINE";
  ui.fontScale = 1;
});

describe("Analysis UI transitions and request guardrails", () => {
  it("uses full-width insight cards and a fitted timeline with large text", () => {
    ui.fontScale = 3.1;
    const dashboard = buildSpendingAnalysis(data(), "a", "MINE", {}, "2026-09-29");
    const insights = AnalysisInsights({ dashboard, money: String });
    expect(
      nodes(insights).filter(
        (node) =>
          Array.isArray(node.props.style) &&
          (node.props.style as { width?: string }[]).some(
            (style) => style?.width === "100%",
          ),
      ),
    ).toHaveLength(dashboard.insights.length);
    ui.cursor = 0;
    const timeline = AnalysisTimeline({ dashboard, money: String, drilldown: vi.fn() });
    const bar = nodes(timeline).find(
      (node) => node.props.accessibilityHint === "Opens spending brief",
    )!;
    expect(bar.props.style).toContainEqual({ width: 343 / 30 });
  });
  it("pins only the scope control and applies one consolidated range read", async () => {
    let screen = await ready(data(400));
    expect(
      nodes(screen).filter((node) => node.props.accessibilityRole === "tablist"),
    ).toHaveLength(1);
    const header = (
      nodes(screen).find((node) => node.type === "stack")!.props.options as {
        headerTitle: () => unknown;
      }
    ).headerTitle();
    expect(
      (header as ReactElement<{ title: string; subtitle: string }>).props,
    ).toMatchObject({
      title: "Spending Analysis",
      subtitle: "Native QA",
    });
    expect(texts(nodes(screen).find((node) => node.type === "scroll")!)).not.toContain(
      "Entire trip",
    );
    expect(ui.projection).toHaveBeenCalledTimes(1);
    press(
      nodes(screen).find((node) => node.props.onPress && texts(node) === "This month")!,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(ui.projection).toHaveBeenCalledTimes(2);
    expect(ui.projection.mock.calls[1][2]).toHaveProperty("from");
    expect(ui.projection.mock.calls[1][2]).toHaveProperty("to");
  });
  it("filters Biggest Expenses in memory without another read", async () => {
    const dataset = data();
    dataset.expenses[0]!.category = "hotel";
    let screen = await ready(dataset);
    const menu = nodes(screen).find(
      (node) =>
        node.type === AnalysisCategoryMenu && node.props.title === "biggest expenses",
    )!;
    press(menu);
    screen = render();
    press(nodes(screen).find((node) => node.props.onPress && texts(node) === "hotel")!);
    screen = render();
    const rows = nodes(screen).find((node) => node.type === AnalysisExpenseRows)!;
    expect(rows.props.expenses).toEqual([dataset.expenses[0]]);
    expect(ui.projection).toHaveBeenCalledTimes(1);
  });
  it("reads once on entry, never on renders/toggle/menu/idle, once on focus return", async () => {
    let screen = await ready();
    expect(ui.projection).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 15; index++) screen = render();
    const group = nodes(screen).find(
      (node) => node.props.accessibilityRole === "tab" && texts(node) === "Group",
    )!;
    press(group);
    screen = render();
    expect(texts(screen)).toContain("GROUP SPENDING");
    expect(ui.projection).toHaveBeenCalledTimes(1);
    expect(ui.options).not.toHaveBeenCalled();
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(ui.projection).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    ui.cleanup?.();
    ui.cleanup = ui.focus?.() ?? null;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(ui.projection).toHaveBeenCalledTimes(2);
    expect(texts(render())).toContain("GROUP SPENDING");
  });
  it("keeps the previous dashboard unchanged during a pending return refresh", async () => {
    const dataset = data();
    const before = await ready(dataset);
    const content = texts(before);
    let complete!: (value: AnalysisDataset) => void;
    ui.projection.mockImplementationOnce(
      () =>
        new Promise<AnalysisDataset>((resolve) => {
          complete = resolve;
        }),
    );
    ui.cleanup?.();
    ui.cleanup = ui.focus?.() ?? null;
    await new Promise<void>((resolve) => setImmediate(resolve));
    const pending = render();
    expect(texts(pending)).toBe(content);
    expect(nodes(pending).some((node) => node.type === AnalysisSkeleton)).toBe(false);
    expect(
      nodes(pending).find((node) => node.type === AnalysisTimeline)!.props.dashboard,
    ).toBe(nodes(before).find((node) => node.type === AnalysisTimeline)!.props.dashboard);
    complete({ ...dataset, expenses: dataset.expenses.slice(0, 1) });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(texts(render())).toContain("1 expense");
    expect(ui.projection).toHaveBeenCalledTimes(2);
  });
  it("restores independent Mine and Group scroll offsets without reads", async () => {
    let screen = await ready();
    const main = () =>
      nodes(screen).find((node) => node.type === "scroll" && node.props.onScroll)!;
    const scrollTo = vi.fn();
    (main().props.ref as { current: unknown }).current = { scrollTo };
    (main().props.onScroll as (event: unknown) => void)({
      nativeEvent: { contentOffset: { y: 480 } },
    });
    const tab = (label: string) =>
      nodes(screen).find(
        (node) => node.props.accessibilityRole === "tab" && texts(node) === label,
      )!;
    press(tab("Group"));
    screen = render();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
    (main().props.onScroll as (event: unknown) => void)({
      nativeEvent: { contentOffset: { y: 900 } },
    });
    press(tab("Mine"));
    screen = render();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 480, animated: false });
    press(tab("Group"));
    screen = render();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 900, animated: false });
    (main().props.onContentSizeChange as () => void)();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 900, animated: false });
    expect(ui.projection).toHaveBeenCalledTimes(1);
  });
  it("shows only an icon above 30 days and no Range action for short Journeys", async () => {
    const screen = await ready(data(30));
    const stack = nodes(screen).find((node) => node.type === "stack")!;
    expect(
      (stack.props.options as { headerRight: () => unknown }).headerRight(),
    ).toBeNull();
    ui.projection.mockResolvedValue(data(31));
    ui.cleanup?.();
    ui.cleanup = ui.focus?.() ?? null;
    await new Promise<void>((resolve) => setImmediate(resolve));
    const longStack = nodes(render()).find((node) => node.type === "stack")!;
    const action = (
      longStack.props.options as {
        headerRight: () => ReactElement<Record<string, unknown>>;
      }
    ).headerRight();
    expect(action.props.label).toBe("Choose date range");
    expect(texts(action)).not.toContain("Range");
  });
  it("uses a structured skeleton, then preserves previous data on local failure", async () => {
    ui.projection.mockResolvedValue(data());
    expect(nodes(render()).some((node) => node.type === AnalysisSkeleton)).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    ui.projection.mockRejectedValueOnce(new Error("local read failure"));
    ui.cleanup?.();
    ui.cleanup = ui.focus?.() ?? null;
    await new Promise<void>((resolve) => setImmediate(resolve));
    const screen = render();
    expect(texts(screen)).toContain("MY SPENDING");
    expect(texts(screen)).toContain("Tap to try again");
  });
  it("distinguishes no expenses, no period data, and all incomplete without a zero total", async () => {
    const dataset = data();
    dataset.expenses = [];
    dataset.hasExpensesOutsideRange = false;
    expect(texts(await ready(dataset))).toContain("No spending yet");
    ui.slots = [];
    ui.focus = null;
    ui.initial = {
      1: {
        dataset: { ...dataset, hasExpensesOutsideRange: true },
        range: { from: "2026-09-02T00:00:00.000Z", to: "2026-09-03T00:00:00.000Z" },
      },
    };
    expect(texts(render())).toContain("No spending in this period");
    ui.slots = [];
    ui.focus = null;
    const incomplete = data();
    incomplete.expenses = incomplete.expenses.map((expense) => ({
      ...expense,
      totalMinor: null,
      personalMinor: null,
      businessStatus: "RATE_REQUIRED",
    }));
    ui.initial = { 1: { dataset: incomplete, range: {} } };
    const text = texts(render());
    expect(text).toContain("Spending total unavailable");
    expect(text).toContain("Spending analysis isn’t ready yet");
    expect(text).not.toContain("NZ$0.00");
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  it("opens excluded records from the count info icon without additional reads", async () => {
    const dataset = data();
    dataset.expenses[0].businessStatus = "RATE_REQUIRED";
    dataset.expenses[0].totalMinor = null;
    dataset.expenses[0].personalMinor = null;
    dataset.expenses[1].hasOpenConflict = true;
    dataset.expenses[2].personalMinor = null;
    let screen = await ready(dataset);
    expect(texts(screen)).toContain("2 included expenses");
    expect(texts(screen)).not.toContain("not included yet");
    const info = nodes(screen).find(
      (node) =>
        node.props.accessibilityLabel === "View 3 expenses not included in the total",
    )!;
    expect(texts(info)).toBe("ⓘ");
    press(info);
    screen = render();
    const popup = nodes(screen).find(
      (node) => node.type === "modal" && node.props.visible === true,
    )!;
    expect(texts(popup)).toContain("Waiting for confirmed Journey currency value");
    expect(texts(popup)).toContain("Changes need review");
    expect(texts(popup)).toContain("Your share is not available yet");
    expect(texts(popup)).toMatch(/Original total\s+€10\.00/);
    expect(texts(popup)).not.toContain("Expense 3");
    (popup.props.onRequestClose as () => void)();
    expect(
      nodes(render()).filter(
        (node) => node.type === "modal" && node.props.visible === true,
      ),
    ).toHaveLength(0);
    press(
      nodes(render()).find(
        (node) => node.props.accessibilityLabel === info.props.accessibilityLabel,
      )!,
    );
    screen = render();
    press(
      nodes(screen).find(
        (node) => node.props.onPress && texts(node).startsWith("Expense 0"),
      )!,
    );
    expect(ui.push).toHaveBeenCalledWith("/expenses/expense/e0");
    expect(
      nodes(render()).filter(
        (node) => node.type === "modal" && node.props.visible === true,
      ),
    ).toHaveLength(0);
    expect(ui.projection).toHaveBeenCalledTimes(1);
  });
  it("omits the count info icon when every expense is included", async () => {
    expect(texts(await ready())).not.toContain("ⓘ");
  });
  it("category expansion shows Top 3 and keeps View all as the Search entry", () => {
    const dashboard = buildSpendingAnalysis(data(), "a", "MINE", {}, "2026-09-29");
    const drilldown = vi.fn();
    const props = {
      categories: dashboard.displayedCategories,
      totalCategories: 1,
      scope: "MINE" as const,
      money: (amount: number) => `NZ${amount}`,
      drilldown,
    };
    ui.cursor = 0;
    let element = AnalysisCategories(props);
    press(
      nodes(element).find(
        (node) =>
          node.props.accessibilityState && node.props.accessibilityRole === "button",
      )!,
    );
    ui.cursor = 0;
    element = AnalysisCategories(props);
    const expenses = nodes(element).find(
      (node) => (node.props.expenses as unknown[])?.length === 3,
    )!;
    expect(expenses).toBeDefined();
    press(
      nodes(element).find(
        (node) => /View all\s+5 expenses/.test(texts(node)) && node.props.onPress,
      )!,
    );
    expect(drilldown).toHaveBeenCalledWith({ categories: ["food"] }, "Category: food");
    expect(ui.projection).not.toHaveBeenCalled();
  });
  it("uses one-day fallback and preserves timeline zero-day click identity", () => {
    const dataset = data(1);
    dataset.expenses = dataset.expenses.map((expense) => ({
      ...expense,
      occurredAt: "2026-09-01T08:00:00.000Z",
    }));
    const dashboard = buildSpendingAnalysis(dataset, "a", "MINE", {}, "2026-09-29");
    ui.cursor = 0;
    const element = AnalysisTimeline({ dashboard, money: String, drilldown: vi.fn() });
    expect(texts(element)).toContain("Spent this day");
    expect(
      nodes(element).some(
        (node) => node.props.accessibilityLabel === "Spending timeline",
      ),
    ).toBe(false);
  });
  it("expands a zero timeline period in memory and drills into its exact date bounds", () => {
    const dashboard = buildSpendingAnalysis(data(), "a", "MINE", {}, "2026-09-29");
    const drilldown = vi.fn();
    const props = { dashboard, money: String, drilldown };
    ui.cursor = 0;
    let element = AnalysisTimeline(props);
    press(
      nodes(element).find((node) =>
        String(node.props.accessibilityLabel).includes("No spending"),
      )!,
    );
    ui.cursor = 0;
    element = AnalysisTimeline(props);
    press(
      nodes(element).find(
        (node) => node.props.onPress && /View\s+0 expenses/.test(texts(node)),
      )!,
    );
    expect(drilldown).toHaveBeenCalledWith(
      { from: dashboard.periods[0]!.from, to: dashboard.periods[0]!.to },
      expect.any(String),
    );
    expect(ui.projection).not.toHaveBeenCalled();
  });
  it("zooms with horizontal pinch, scrolls only after zoom, opens and closes a floating brief without reads", () => {
    const dashboard = buildSpendingAnalysis(data(), "a", "MINE", {}, "2026-09-29");
    const props = { dashboard, money: String, drilldown: vi.fn() };
    const draw = () => {
      ui.cursor = 0;
      return AnalysisTimeline(props);
    };
    let element = draw();
    expect(
      nodes(element).find(
        (node) => node.props.accessibilityLabel === "Spending timeline",
      )!.props.scrollEnabled,
    ).toBe(false);
    const frame = nodes(element).find((node) => node.props.onResponderGrant)!;
    (frame.props.onResponderGrant as (event: unknown) => void)({
      nativeEvent: { touches: [{ pageX: 100 }, { pageX: 200 }] },
    });
    (frame.props.onResponderMove as (event: unknown) => void)({
      nativeEvent: { touches: [{ pageX: 50 }, { pageX: 250 }] },
    });
    (frame.props.onResponderRelease as () => void)();
    element = draw();
    expect(
      nodes(element).find(
        (node) => node.props.accessibilityLabel === "Spending timeline",
      )!.props.scrollEnabled,
    ).toBe(true);
    expect(
      nodes(element).find(
        (node) => node.props.accessibilityHint === "Opens spending brief",
      )!.props.style,
    ).toContainEqual({ width: 686 / 30 });
    press(
      nodes(element).find(
        (node) => node.props.accessibilityHint === "Opens spending brief",
      )!,
    );
    element = draw();
    expect(nodes(element).find((node) => node.type === "modal")!.props.visible).toBe(
      true,
    );
    press(
      nodes(element).find(
        (node) => node.props.accessibilityLabel === "Close spending brief",
      )!,
    );
    expect(nodes(draw()).find((node) => node.type === "modal")!.props.visible).toBe(
      false,
    );
    expect(ui.projection).not.toHaveBeenCalled();
  });
  it("shows useful zoom actions only and makes each column at least 44pt after zoom", () => {
    const props = {
      dashboard: buildSpendingAnalysis(data(), "a", "MINE", {}, "2026-09-29"),
      money: String,
      drilldown: vi.fn(),
    };
    const draw = () => {
      ui.cursor = 0;
      return AnalysisTimeline(props);
    };
    const action = (element: unknown, label: string) =>
      nodes(element).find((node) => node.props.accessibilityLabel === label);
    let element = draw();
    expect(action(element, "Zoom out timeline")).toBeUndefined();
    expect(action(element, "Show entire timeline")).toBeUndefined();
    expect(texts(element)).not.toMatch(/Linear scale|Log scale/);
    press(action(element, "Zoom in timeline")!);
    element = draw();
    expect(action(element, "Zoom in timeline")).toBeUndefined();
    expect(action(element, "Zoom out timeline")).toBeDefined();
    expect(
      nodes(element).find(
        (node) => node.props.accessibilityHint === "Opens spending brief",
      )!.props.style,
    ).toContainEqual({ width: 44 });
    press(action(element, "Show entire timeline")!);
    expect(action(draw(), "Zoom out timeline")).toBeUndefined();
    props.dashboard = buildSpendingAnalysis(data(3), "a", "MINE", {}, "2026-09-29");
    expect(action(draw(), "Zoom in timeline")).toBeUndefined();
    expect(action(draw(), "Zoom out timeline")).toBeUndefined();
    expect(ui.projection).not.toHaveBeenCalled();
  });
  it("keeps the brief date and View expenses outside the scrolling category content", () => {
    const props = {
      dashboard: buildSpendingAnalysis(data(), "a", "MINE", {}, "2026-09-29"),
      money: String,
      drilldown: vi.fn(),
    };
    ui.cursor = 0;
    press(
      nodes(AnalysisTimeline(props)).find(
        (node) => node.props.accessibilityHint === "Opens spending brief",
      )!,
    );
    ui.cursor = 0;
    const popup = nodes(AnalysisTimeline(props)).find((node) => node.type === "modal")!;
    const body = nodes(popup).find((node) => node.type === "scroll")!;
    expect(texts(body)).not.toContain("View");
    expect(nodes(body).some((node) => node.props.accessibilityRole === "header")).toBe(
      false,
    );
    expect(nodes(popup).some((node) => node.props.accessibilityRole === "header")).toBe(
      true,
    );
    expect(texts(popup)).toMatch(/View\s+0 expenses/);
  });
  it("keeps traveller expansion only for all categories and routes filtered travellers and payers directly", () => {
    const drilldown = vi.fn();
    const props = {
      title: "Spending by traveller",
      rows: [
        {
          key: "a",
          label: "Alex",
          totalMinor: 1000,
          expenseCount: 2,
          rank: 1,
          categories: [{ key: "food", label: "food", totalMinor: 1000 }],
        },
      ],
      totalMinor: 1000,
      money: String,
      drilldown,
      action: null,
      traveller: true,
      category: null as string | null,
    };
    const draw = () => {
      ui.cursor = 0;
      return AnalysisPeople(props);
    };
    let element = draw();
    expect(texts(element)).toMatch(/#\s*1/);
    expect(texts(element)).not.toMatch(/percent|%|Each traveller/);
    const person = () =>
      nodes(element).find(
        (node) =>
          node.props.accessibilityLabel &&
          String(node.props.accessibilityLabel).includes("Alex"),
      )!;
    press(person());
    element = draw();
    expect(texts(element)).toMatch(/View\s+Alex/);
    expect(drilldown).not.toHaveBeenCalled();
    props.category = "food";
    element = draw();
    expect(texts(element)).not.toMatch(/View\s+Alex/);
    press(person());
    expect(drilldown).toHaveBeenLastCalledWith(
      { selectedMemberId: "a", categories: ["food"] },
      "Alex's spending",
    );
    props.traveller = false;
    element = draw();
    expect(texts(element)).not.toContain("before any repayments");
    press(person());
    expect(drilldown).toHaveBeenLastCalledWith(
      { payerMemberId: "a", categories: ["food"] },
      "Paid by Alex",
    );
    expect(ui.projection).not.toHaveBeenCalled();
  });
  it("keeps shared Expense rows at two lines and removes original currency and repeated share wording", () => {
    const element = AnalysisExpenseRows({
      expenses: data().expenses.slice(0, 1),
      scope: "MINE",
      money: (amount) => `NZ${amount}`,
    });
    expect(texts(element)).toContain("You");
    expect(texts(element)).not.toMatch(/My share|original|food/);
    expect(
      nodes(element).filter(
        (node) => node.type === "text" && node.props.numberOfLines === 1,
      ),
    ).toHaveLength(3);
    expect(texts(element)).toContain("Total NZ2000");
    const row = nodes(element).find((node) => node.props.onPress)!;
    expect(row.props.style).toContainEqual({ borderBottomWidth: 0 });
  });
  it("keeps chrome and section read ownership local and timer-free", () => {
    const screen = readFileSync(
      new URL("./LedgerAnalysisScreen.tsx", import.meta.url),
      "utf8",
    );
    const sections = readFileSync(
      new URL("./SpendingAnalysisSections.tsx", import.meta.url),
      "utf8",
    );
    expect(screen).not.toMatch(
      /setInterval|setTimeout|refreshJourney|fxSnapshot|kickLedgerSync/,
    );
    expect(sections).not.toMatch(/Repository|@\/data\/|setInterval|setTimeout/);
    expect(screen).toContain(
      'headerBlurEffect: Platform.OS === "ios" ? "systemMaterial"',
    );
    expect(screen).not.toContain("tabBarStyle");
    expect(screen).not.toContain("selectedMemberId?:");
  });
});
