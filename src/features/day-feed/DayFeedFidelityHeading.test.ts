import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { DayFeedFidelityHeading } from "./DayFeedFidelityHeading";
import { lightPalette } from "@/ui/palette";
const state = vi.hoisted(() => ({ nodes: [] as any[], scale: 1 }));
vi.mock("react-native", () => ({
  View: (p: any) => {
    state.nodes.push(p);
    return createElement("div", null, p.children);
  },
  StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
  useWindowDimensions: () => ({ fontScale: state.scale }),
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiButton: (p: any) => createElement("button", null, p.label),
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: (fn: any) => fn(lightPalette) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const props = {
  date: "2027-01-16",
  start: "2027-01-16",
  today: "2027-01-16",
  empty: false,
  previousColor: lightPalette.tripIntroduction,
  dayColor: lightPalette.surface,
};
beforeEach(() => {
  state.nodes = [];
  state.scale = 1;
});
it("uses a38pt native gradient strip with supported percentage stops", () => {
  const html = renderToStaticMarkup(createElement(DayFeedFidelityHeading, props));
  expect(html).toContain("Today");
  const strip = state.nodes.find(
    (n) =>
      Array.isArray(n.style) && n.style.some((s: any) => s?.experimental_backgroundImage),
  );
  const gradient = strip.style.find((s: any) => s?.experimental_backgroundImage)
    ?.experimental_backgroundImage[0];
  expect(gradient.colorStops[1].positions).toEqual(["100%"]);
  expect(strip.style[0].height).toBe(38);
  expect(gradient.colorStops[0].color).toBe(lightPalette.tripIntroduction);
  expect(gradient.colorStops[1].color).toBe(lightPalette.surface);
});
it("scales the day badge with Dynamic Type and keeps its spoken ordinal", () => {
  state.scale = 3;
  renderToStaticMarkup(createElement(DayFeedFidelityHeading, props));
  const badge = state.nodes.find((n) => n.accessibilityLabel === "Day 1");
  expect(badge.accessible).toBe(true);
  expect(badge.style.at(-1)).toEqual({ width: 90, height: 96 });
});
it("distinguishes Today solid and Tomorrow outlined accent badges", () => {
  renderToStaticMarkup(createElement(DayFeedFidelityHeading, props));
  const today = state.nodes.find((n) => n.accessibilityLabel === "Day 1");
  expect(Object.assign({}, ...today.style.filter(Boolean))).toMatchObject({
    backgroundColor: lightPalette.accent,
    borderColor: lightPalette.accent,
  });
  state.nodes = [];
  const html = renderToStaticMarkup(
    createElement(DayFeedFidelityHeading, {
      ...props,
      date: "2027-01-17",
    }),
  );
  expect(html).toContain("Tomorrow");
  expect(html).toContain("Sunday");
  const tomorrow = state.nodes.find((n) => n.accessibilityLabel === "Day 2");
  expect(Object.assign({}, ...tomorrow.style.filter(Boolean))).toMatchObject({
    backgroundColor: lightPalette.accentSurface,
    borderColor: lightPalette.accent,
  });
});
it("keeps a past empty day quiet and a future empty day actionable", () => {
  const onAdd = vi.fn();
  const past = renderToStaticMarkup(
    createElement(DayFeedFidelityHeading, {
      ...props,
      today: "2027-01-20",
      empty: true,
      onAdd,
    }),
  );
  expect(past).toContain("No plans");
  expect(past).not.toContain("Add itinerary");
  const future = renderToStaticMarkup(
    createElement(DayFeedFidelityHeading, {
      ...props,
      today: "2027-01-14",
      empty: true,
      onAdd,
    }),
  );
  expect(future).toContain("Add itinerary");
});
