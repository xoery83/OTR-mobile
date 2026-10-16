import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import {
  DayFeedCalendarSheet,
  dayFeedCalendarBounds,
  dayFeedCalendarCells,
  dayFeedCalendarMonths,
} from "./DayFeedCalendarSheet";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  nodes: [] as any[],
  effects: [] as (() => void)[],
  scrollTo: vi.fn(),
  select: vi.fn(),
  close: vi.fn(),
  width: 375,
  fontScale: 1,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (fn: () => void) => state.effects.push(fn),
  useRef: (value: any) => ({
    current: value === null ? { scrollTo: state.scrollTo } : value,
  }),
  useState: (initial: any) => [initial, vi.fn()],
}));
vi.mock("react-native", () => {
  const component = (kind: string) =>
    function MockNative(props: any) {
      state.nodes.push({ ...props, kind });
      return createElement("div", null, props.children);
    };
  return {
    View: component("View"),
    Modal: component("Modal"),
    ScrollView: component("ScrollView"),
    Pressable: component("Pressable"),
    StyleSheet: { create: (s: any) => s },
    useWindowDimensions: () => ({ width: state.width, fontScale: state.fontScale }),
  };
});
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34 }),
}));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => createElement("header", null, p.title),
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: (fn: any) => fn({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
const props = {
  visible: true,
  onClose: state.close,
  onSelect: state.select,
  tripName: "Authorized Trip",
  rangeLabel: "Actual range",
  tripStart: "2027-01-28",
  tripEnd: "2027-02-08",
  selectedDate: "2027-02-03",
  summaries: [
    {
      date: "2027-02-03",
      placeTransitionLabel: "Sapporo",
      markers: ["Plans", "Plans", "Stay", "Transport"] as any,
    },
  ],
  copy: {
    unknownBounds: "Unknown bounds",
    markers: { Plans: "Plans", Stay: "Stay", Transport: "Transport" },
  },
};
const render = (overrides: Partial<Parameters<typeof DayFeedCalendarSheet>[0]> = {}) =>
  renderToStaticMarkup(createElement(DayFeedCalendarSheet, { ...props, ...overrides }));
beforeEach(() => {
  state.nodes = [];
  state.effects = [];
  state.scrollTo.mockReset();
  state.close.mockReset();
  state.select.mockReset();
  state.width = 375;
  state.fontScale = 1;
});
it("uses chronological conventional month grids across year boundaries and leap days", () => {
  expect(
    dayFeedCalendarMonths(dayFeedCalendarBounds("2026-12-29", "2027-02-03")!),
  ).toEqual(["2026-12", "2027-01", "2027-02"]);
  expect(dayFeedCalendarCells("2027-02").slice(0, 7)).toEqual([
    "2027-02-01",
    "2027-02-02",
    "2027-02-03",
    "2027-02-04",
    "2027-02-05",
    "2027-02-06",
    "2027-02-07",
  ]);
  expect(dayFeedCalendarCells("2028-02")).toContain("2028-02-29");
  expect(dayFeedCalendarCells("2027-02")).not.toContain("2027-02-29");
  expect(dayFeedCalendarBounds(null, "2027-02-03")).toBeNull();
  expect(dayFeedCalendarBounds("2027-02-30", "2027-03-03")).toBeNull();
});
it("selects an empty in-range date once without confirmation and blocks off-range cells", () => {
  render();
  const cells = state.nodes.filter((p) => p.kind === "Pressable");
  const empty = cells.find(
    (p) =>
      p.accessibilityLabel ===
      new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeZone: "UTC" }).format(
        new Date("2027-02-04T12:00:00Z"),
      ),
  );
  expect(empty.disabled).toBe(false);
  empty.onPress();
  expect(state.close).toHaveBeenCalledTimes(1);
  expect(state.select).toHaveBeenCalledExactlyOnceWith("2027-02-04");
  const disabled = cells.find((p) => p.disabled);
  disabled.onPress();
  expect(state.select).toHaveBeenCalledTimes(1);
  expect(state.nodes.find((p) => p.kind === "Modal")).toMatchObject({
    presentationStyle: "pageSheet",
    allowSwipeDismissal: true,
  });
});
it("uses only supplied transition labels and deduplicated markers; unknown bounds never synthesize a calendar", () => {
  let html = render();
  expect(html.match(/Sapporo/g)).toHaveLength(1);
  const selected = state.nodes.find(
    (p) => p.kind === "Pressable" && p.accessibilityState.selected,
  );
  expect(selected.accessibilityLabel).toContain("Sapporo, Plans, Stay, Transport");
  expect(selected.children[2].props.children).toHaveLength(3);
  state.nodes = [];
  html = render({ tripStart: null, tripEnd: null });
  expect(html).toContain("Unknown bounds");
  expect(state.nodes.some((p) => p.kind === "Pressable")).toBe(false);
});
it("keeps all 90 legitimate dates selectable without item-detail components and preserves minimum targets on small/large text", () => {
  state.width = 320;
  state.fontScale = 2;
  render({
    tripStart: "2027-01-01",
    tripEnd: "2027-03-31",
    selectedDate: "2027-03-17",
    summaries: [],
  });
  expect(state.nodes.filter((p) => p.kind === "Pressable" && !p.disabled)).toHaveLength(
    90,
  );
  const grids = state.nodes.filter(
    (p) => p.kind === "View" && Array.isArray(p.style) && p.style[1]?.width,
  );
  expect(grids).toHaveLength(3);
  expect(grids.every((p) => p.style[1].width / 7 >= 44)).toBe(true);
  const scroll = state.nodes.find((p) => p.kind === "ScrollView" && !p.horizontal);
  expect(scroll.contentContainerStyle[1].paddingBottom).toBeGreaterThan(34);
});
it("opens around the measured selected month once and never pulls back after sheet reading", () => {
  render({ tripStart: "2027-01-01", tripEnd: "2027-03-31", selectedDate: "2027-03-17" });
  const months = state.nodes.filter(
    (p) => p.kind === "View" && p.onLayout && p.style.gap === 12,
  );
  months[0].onLayout({ nativeEvent: { layout: { y: 0 } } });
  expect(state.scrollTo).not.toHaveBeenCalled();
  months[2].onLayout({ nativeEvent: { layout: { y: 780 } } });
  expect(state.scrollTo).toHaveBeenLastCalledWith({ y: 780, animated: false });
  state.nodes.find((p) => p.kind === "ScrollView" && !p.horizontal).onScrollBeginDrag();
  months[2].onLayout({ nativeEvent: { layout: { y: 920 } } });
  expect(state.scrollTo).toHaveBeenCalledTimes(1);
});
