import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { TripHomeWidgetHost } from "./TripHomeWidgetHost";
import { TripHomeFrame } from "./TripHomeFrame";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  window: { width: 402, height: 874, fontScale: 1 },
  values: [] as any[],
  cursor: 0,
  effects: [] as (() => void)[],
  nodes: [] as any[],
  scrollTo: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: any) => {
    const at = state.cursor++;
    if (!(at in state.values)) state.values[at] = initial;
    return [state.values[at], (value: any) => (state.values[at] = value)];
  },
  useRef: () => ({ current: { scrollTo: state.scrollTo } }),
  useEffect: (fn: () => void) => state.effects.push(fn),
}));
vi.mock("react-native", () => ({
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", { disabled: p.disabled }, p.children);
  },
  View: (p: any) => {
    state.nodes.push(p);
    return createElement("div", null, p.children);
  },
  ScrollView: (p: any) => {
    state.nodes.push(p);
    return createElement("div", null, p.children);
  },
  useWindowDimensions: () => state.window,
  StyleSheet: { create: (s: any) => s },
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) =>
    createElement(
      "span",
      { role: p.accessibilityRole === "header" ? "heading" : undefined },
      p.children,
    ),
  UiButton: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.label);
  },
}));
vi.mock("@/ui/forms", () => ({
  UiChoiceChip: (p: any) => {
    state.nodes.push(p);
    return createElement("button", { "aria-pressed": p.selected }, p.label);
  },
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@/features/day-feed/TripCoverVisual", () => ({
  TripCoverVisual: (p: any) => {
    state.nodes.push({ ...p, isHero: true });
    return createElement("div", { "data-hero": true }, p.children);
  },
}));
beforeEach(() => {
  state.window = { width: 402, height: 874, fontScale: 1 };
  state.values = [];
  state.cursor = 0;
  state.effects = [];
  state.nodes = [];
  state.scrollTo.mockClear();
});
const render = (widgets: any[]) => {
  state.cursor = 0;
  state.effects = [];
  state.nodes = [];
  const html = renderToStaticMarkup(createElement(TripHomeWidgetHost, { widgets }));
  state.effects.forEach((fn) => fn());
  return html;
};
it("has a plain truthful zero-widget fallback without tags, pager or invented modules", () => {
  const html = render([]);
  expect(html).toContain("tripHome.noQualifiedWork");
  expect(html).not.toContain("button");
  expect(state.nodes).toHaveLength(0);
  expect(state.scrollTo).not.toHaveBeenCalled();
});
it("keeps named tag selection synchronized with manual swipe and stable qualified IDs", () => {
  const pages = [
    { id: "a", title: "Approved A", content: "Content A" },
    { id: "b", title: "Approved B", content: "Content B" },
  ];
  render(pages);
  state.nodes
    .find((p) => p.onLayout)
    ?.onLayout({ nativeEvent: { layout: { width: 380 } } });
  render(pages);
  state.nodes.find((p) => p.label === "Approved B").onPress();
  render(pages);
  expect(state.nodes.find((p) => p.label === "Approved B").selected).toBe(true);
  expect(state.nodes.find((p) => p.label === "Approved B").compact).toBe(true);
  expect(state.scrollTo).toHaveBeenLastCalledWith({ x: 380, animated: false });
  state.nodes
    .find((p) => p.onMomentumScrollEnd)
    .onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 0 } } });
  render(pages);
  expect(state.nodes.find((p) => p.label === "Approved A").selected).toBe(true);
  render([...pages].reverse());
  expect(state.nodes.find((p) => p.label === "Approved A").selected).toBe(true);
  render([pages[1]]);
  expect(state.nodes.find((p) => p.label === "Approved B").selected).toBe(true);
  render(pages);
  expect(state.nodes.find((p) => p.label === "Approved B").selected).toBe(true);
});
it("renders truthful hero metadata and only actual supplied module/edit capabilities", () => {
  const html = renderToStaticMarkup(
    createElement(TripHomeFrame, {
      title: "Known Trip",
      metadata: ["Known date"],
      cover: { uri: "offline" },
    }),
  );
  expect(html).toContain("Known Trip");
  expect(html).toContain("Known date");
  expect(html).not.toContain("tripHome.edit");
  expect(html).not.toContain("tripHome.tools");
});

it("keeps one full-bleed identity with untruncated metadata under enlargement and rotation", () => {
  for (const window of [
    { width: 402, height: 874, fontScale: 1 },
    { width: 402, height: 874, fontScale: 2.143 },
    { width: 874, height: 402, fontScale: 2.143 },
    { width: 375, height: 667, fontScale: 1 },
  ]) {
    state.window = window;
    state.cursor = 0;
    state.values = [];
    state.nodes = [];
    const html = renderToStaticMarkup(
      createElement(TripHomeFrame, {
        title: "Long authorized Trip identity",
        metadata: ["Known full destination", "Known date range"],
        cover: { uri: "offline" },
        modules: createElement("span", null, "Actual local Photos"),
      }),
    );
    const hero = state.nodes.find((p) => p.isHero);
    const geometry = hero.style[1];
    expect(geometry.width).toBe(window.width);
    expect(geometry.minHeight).toBeCloseTo(window.height * 0.32);
    expect(geometry.height).toBeUndefined();
    expect(html.match(/Long authorized Trip identity/g)).toHaveLength(1);
    expect(html).toContain("Known full destination");
    expect(html).toContain("Known date range");
    expect(html).toContain("Actual local Photos");
    expect(html).not.toContain("tripHome.edit");
  }
});

it("uses the supplied Editor for the whole Hero identity and never invents an editing capability", () => {
  const edit = vi.fn();
  renderToStaticMarkup(
    createElement(TripHomeFrame, {
      title: "Trip",
      metadata: ["Auckland"],
      cover: 1,
      onEdit: edit,
    }),
  );
  const target = state.nodes.find(
    (n) => n.accessibilityRole === "button" && n.accessibilityLabel === "tripHome.edit",
  );
  expect(target.disabled).toBe(false);
  target.onPress();
  expect(edit).toHaveBeenCalledOnce();
});
