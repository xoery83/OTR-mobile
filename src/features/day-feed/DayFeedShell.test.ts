import { createElement } from "react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DayFeedIntroduction,
  formatDayFeedVisibleDates,
  DayFeedShellTitle,
  useDayFeedShellState as runShellHook,
} from "./DayFeedShell";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  nodes: [] as any[],
  values: [] as any[],
  refs: [] as any[],
  cursor: 0,
  refCursor: 0,
  effects: [] as (() => () => void)[],
  collect: true,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (fn: any) => fn,
  useRef: (initial: any) => (state.refs[state.refCursor++] ??= { current: initial }),
  useState: (initial: any) => {
    const at = state.cursor++;
    if (!(at in state.values)) state.values[at] = initial;
    return [
      state.values[at],
      (value: any) => {
        state.values[at] = typeof value === "function" ? value(state.values[at]) : value;
      },
    ];
  },
  useEffect: (fn: any) => {
    if (state.collect) state.effects.push(fn);
  },
}));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
  StyleSheet: { create: (s: any) => s },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
}));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (fn: any) => fn({}),
  useUiTheme: () => ({}),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
beforeEach(() => {
  state.nodes = [];
  state.values = [];
  state.refs = [];
  state.cursor = state.refCursor = 0;
  state.effects = [];
  state.collect = true;
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
const a = { first: "2027-02-01", last: "2027-02-01" },
  b = { first: "2027-02-02", last: "2027-02-03" };
function renderShell(key = "account/trip/gen1", collect = false) {
  state.cursor = state.refCursor = 0;
  state.collect = collect;
  return runShellHook(key);
}
it("keeps the native title button accessible and puts only compact Trip text inside the feed", () => {
  const open = vi.fn();
  renderToStaticMarkup(
    createElement(DayFeedShellTitle, {
      label: "Actual Trip",
      openCalendarLabel: "Choose date",
      onOpenCalendar: open,
    }),
  );
  expect(state.nodes[0]).toMatchObject({
    accessibilityRole: "button",
    accessibilityLabel: "Choose date",
  });
  expect(state.nodes[0].style.minHeight).toBe(44);
  state.nodes[0].onPress();
  expect(open).toHaveBeenCalledOnce();
  const html = renderToStaticMarkup(
    createElement(DayFeedIntroduction, {
      tripName: "Actual Trip",
      rangeLabel: "Authorized range",
    }),
  );
  expect(html).toContain("Actual Trip");
  expect(html).toContain("Authorized range");
  expect(html).not.toContain("img");
});
it("settles a visible range after scrolling stops and cancels stale range timers on scope change", () => {
  let shell = renderShell(undefined, true);
  const cleanup = state.effects.splice(0).map((fn) => fn());
  shell.observeVisibleDates(a);
  expect(renderShell().visibleDates).toEqual(a);
  vi.setSystemTime(10);
  shell.observeVisibleDates(b);
  vi.advanceTimersByTime(119);
  expect(renderShell().visibleDates).toEqual(a);
  vi.advanceTimersByTime(1);
  expect(renderShell().visibleDates).toEqual(b);
  shell.observeVisibleDates({ first: "2027-02-04", last: "2027-02-04" });
  cleanup.forEach((fn) => fn());
  shell = renderShell("account/other/gen2", true);
  shell.observeVisibleDates(a);
  vi.advanceTimersByTime(200);
  expect(renderShell("account/other/gen2").visibleDates).toEqual(a);
});
it("retains hidden navigation at rest and avoids rerendering on every reading pixel", () => {
  const shell = renderShell();
  shell.observeScroll(40, true);
  expect(renderShell().navigationVisible).toBe(false);
  const hidden = state.values[0];
  shell.observeScroll(41, true);
  expect(state.values[0]).toBe(hidden);
  shell.observeScroll(41, false);
  expect(renderShell().navigationVisible).toBe(false);
  shell.observeScroll(32, true);
  expect(renderShell().navigationVisible).toBe(true);
  shell.observeScroll(6000, false);
  expect(renderShell().navigationVisible).toBe(true);
});

it("accumulates small real gestures and restores navigation on a slight non-top reversal", () => {
  const shell = renderShell();
  for (let i = 0; i < 32; i++) shell.observeReadingMotion(1);
  expect(renderShell().navigationVisible).toBe(false);
  const hidden = state.values[0];
  shell.observeReadingMotion(1);
  shell.observeReadingMotion(NaN);
  expect(state.values[0]).toBe(hidden);
  for (let i = 0; i < 8; i++) shell.observeReadingMotion(-1);
  expect(renderShell().navigationVisible).toBe(true);
  shell.observeReadingMotion(40);
  expect(renderShell().navigationVisible).toBe(false);
  expect(renderShell("account/other/gen2").navigationVisible).toBe(true);
});

it("compresses same-month and same-year ranges while retaining both years across New Year", () => {
  const compact = formatDayFeedVisibleDates({ first: "2027-02-02", last: "2027-02-03" });
  expect(compact.match(/2027/g)).toHaveLength(1);
  expect(compact.match(/Feb/g)).toHaveLength(1);
  expect(formatDayFeedVisibleDates({ first: "2026-12-31", last: "2027-01-02" })).toMatch(
    /2026.*2027/,
  );
});

it("opens Calendar from the initial Trip date row while the floating title is blank", () => {
  const open = vi.fn();
  renderToStaticMarkup(
    createElement(DayFeedIntroduction, {
      tripName: "Japan",
      rangeLabel: "Feb 1–12, 2027",
      openCalendarLabel: "Choose date",
      onOpenCalendar: open,
    }),
  );
  const row = state.nodes.find((node) => node.accessibilityLabel === "Choose date");
  expect(row.style.minHeight).toBe(44);
  row.onPress();
  expect(open).toHaveBeenCalledOnce();
});
