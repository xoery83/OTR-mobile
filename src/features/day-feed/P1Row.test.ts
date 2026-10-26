import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { P1Row } from "./P1Row";
import { place, boundary } from "@/features/day-feed-lab/fixtureFacts";
import { lightPalette } from "@/ui/palette";
const state = vi.hoisted(() => ({ nodes: [] as any[], scale: 1 }));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
  useWindowDimensions: () => ({ fontScale: state.scale }),
  StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: () => null }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiButton: (p: any) => {
    state.nodes.push({ ...p, accessibilityLabel: p.label });
    return createElement("button", null, p.label);
  },
}));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => lightPalette,
  useThemedStyles: (fn: any) => fn(lightPalette),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const event = () => ({
  ...place("one", "Botanical garden visit", "2027-01-16", "10:30", "12:00"),
  authored_label: "Queen's Gardens",
  authored_address: "99 Garden Street",
});
const facts = () => ({
  itemId: "one",
  semanticRevision: 1,
  note: "Original full note",
  participation: { mode: "WHOLE_GROUP" as const },
  photoIds: ["a", "a", "b"],
  expenseIds: ["e"],
  documentIds: [],
  navigationQualified: true,
});
const node = (label: string) => state.nodes.find((n) => n.accessibilityLabel === label);
beforeEach(() => {
  state.nodes = [];
  state.scale = 1;
});
it.each(["FUTURE", "TODAY", "PAST"] as const)(
  "P1 %s Focus uses only the approved context facts/actions",
  (context) => {
    const actions = { map: vi.fn(), navigate: vi.fn() };
    const html = renderToStaticMarkup(
      createElement(P1Row, {
        event: event(),
        depth: "F",
        onDepth: vi.fn(),
        context,
        facts: facts(),
        actions,
      }),
    );
    expect(html).toContain("Everyone");
    expect(html).not.toContain("Planned");
    expect(node("Open place details")).toBeDefined();
    expect(!!node("View on Map")).toBe(context === "FUTURE");
    expect(!!node("Directions")).toBe(context === "TODAY");
    expect(html.includes("Original full note")).toBe(context !== "PAST");
    expect(html.includes("2 photos")).toBe(context !== "FUTURE");
  },
);
it("stale supplemental facts and actions never disclose Note, linked IDs or navigation", () => {
  const html = renderToStaticMarkup(
    createElement(P1Row, {
      event: event(),
      depth: "F",
      onDepth: vi.fn(),
      context: "TODAY",
      facts: { ...facts(), semanticRevision: 2 },
      actions: { navigate: vi.fn() },
    }),
  );
  expect(html).not.toContain("Original full note");
  expect(html).not.toContain("Everyone");
  expect(node("Directions")).toBeUndefined();
});
it("Browse and Immersive show the authored clock without a timezone warning", () => {
  const e = event();
  e.boundaries = [
    {
      ...boundary("START", "2027-01-16"),
      local_time: "15:00:00",
      clock_precision: 0,
      quality: "EXACT",
    },
  ];
  const props = { event: e, onDepth: vi.fn() };
  expect(renderToStaticMarkup(createElement(P1Row, { ...props, depth: "B" }))).toContain(
    "15:00",
  );
  const html = renderToStaticMarkup(createElement(P1Row, { ...props, depth: "I" }));
  expect(html).toContain("15:00");
  expect(html).not.toContain("Timezone not confirmed");
});
it("cross-day accessible labels include end clock/offset and identify the independent END projection", () => {
  const e = event();
  e.boundaries = [
    boundary("START", "2027-01-16", "18:00"),
    boundary("END", "2027-01-17", "08:00"),
  ];
  renderToStaticMarkup(createElement(P1Row, { event: e, depth: "B", onDepth: vi.fn() }));
  expect(node("Botanical garden visit, 18:00, 08:00, +1")).toBeDefined();
  state.nodes = [];
  state.scale = 1;
  renderToStaticMarkup(
    createElement(P1Row, { event: e, depth: "B", onDepth: vi.fn(), occurrence: "END" }),
  );
  expect(node("Botanical garden visit, End at 08:00")).toBeDefined();
});

it("retains meaningful real status without adding a generic Planned badge", () => {
  const html = renderToStaticMarkup(
    createElement(P1Row, {
      event: { ...event(), status: "cancelled" },
      depth: "F",
      onDepth: vi.fn(),
    }),
  );
  expect(html).toContain("Cancelled");
  expect(html).not.toContain("Planned");
});

it("uses singular linked-record counts in Focus and accessible Immersive actions", () => {
  const one = { ...facts(), photoIds: ["a", "a"], documentIds: ["d", "d"] };
  const actions = { photos: vi.fn(), attachments: vi.fn(), expenses: vi.fn() };
  const html = renderToStaticMarkup(
    createElement(P1Row, {
      event: event(),
      depth: "F",
      context: "TODAY",
      facts: one,
      actions,
      onDepth: vi.fn(),
    }),
  );
  expect(html).toContain("1 expense");
  expect(html).toContain("1 photo");
  expect(html).not.toContain("1 expenses");
  expect(html).not.toContain("1 photos");
  renderToStaticMarkup(
    createElement(P1Row, {
      event: event(),
      depth: "I",
      facts: one,
      actions,
      onDepth: vi.fn(),
    }),
  );
  for (const label of ["1 expense", "1 photo", "1 attachment"])
    expect(node(label)).toBeDefined();
});

it("retains both civil clocks without a timezone prompt when END is unqualified", () => {
  const value = event();
  value.boundaries[1] = {
    ...value.boundaries[1],
    instant: null,
    source_instant: null,
    zone_id: null,
    civil_resolution: "PENDING",
  };
  const html = renderToStaticMarkup(
    createElement(P1Row, { event: value, depth: "F", onDepth: vi.fn() }),
  );
  expect(html).toContain("10:30");
  expect(html).toContain("12:00");
  expect(html).not.toContain("Timezone not confirmed");
});
it("native long press forwards the pickup point and suppresses its following normal tap", () => {
  const start = vi.fn(),
    onDepth = vi.fn();
  renderToStaticMarkup(
    createElement(P1Row, { event: event(), depth: "B", onDepth, moveGesture: { start } }),
  );
  const target = state.nodes.find((n) => n.onLongPress);
  target.onPressIn();
  target.onLongPress({ nativeEvent: { pageX: 200, pageY: 450 } });
  target.onPress();
  expect(start).toHaveBeenCalledWith({ x: 200, y: 450 });
  expect(onDepth).not.toHaveBeenCalled();
});
it("Immersive keeps four common actions, disables missing capabilities and hides empty association cards", () => {
  const addExpense = vi.fn();
  const html = renderToStaticMarkup(
    createElement(P1Row, {
      event: event(),
      depth: "I",
      onDepth: vi.fn(),
      context: "TODAY",
      facts: { ...facts(), photoIds: [], documentIds: [], expenseIds: [], note: "   " },
      actions: { addExpense },
    }),
  );
  expect(html).not.toContain("Original full note");
  expect(html).not.toContain("Photos</span>");
  expect(html).not.toContain("Attachments</span>");
  expect(html).not.toContain("Expenses</span>");
  for (const label of ["Add photo", "Add attachment", "Link existing expense"])
    expect(node(label)?.disabled).toBe(true);
  expect(node("Add expense")?.disabled).toBe(false);
  node("Add expense").onPress();
  expect(addExpense).toHaveBeenCalledOnce();
});
