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
it("Browse hides the unqualified original clock while Immersive retains it with a warning", () => {
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
  expect(
    renderToStaticMarkup(createElement(P1Row, { ...props, depth: "B" })),
  ).not.toContain("15:00");
  const html = renderToStaticMarkup(createElement(P1Row, { ...props, depth: "I" }));
  expect(html).toContain("15:00");
  expect(html).toContain("Timezone not confirmed");
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
