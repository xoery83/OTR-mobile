import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { FlightAirportField } from "./FlightAirportField";
const state = vi.hoisted(() => ({ cursor: 0, values: [] as any[], nodes: [] as any[] }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (next: any) => {
        state.values[i] = typeof next === "function" ? next(state.values[i]) : next;
      },
    ];
  },
}));
const capture = (kind: string) =>
  function CapturedNode(props: any) {
    state.nodes.push({ kind, ...props });
    return createElement("div", null, props.children);
  };
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
  ScrollView: (p: any) => capture("scroll")(p),
  Modal: (p: any) => (p.visible ? capture("modal")(p) : null),
  Keyboard: { dismiss: vi.fn() },
  StyleSheet: { create: (s: any) => s },
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: "div",
  SafeAreaView: "div",
}));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => capture("header")(p),
}));
vi.mock("@/ui/controls", () => ({
  UiText: "span",
  UiButton: (p: any) => capture("button")(p),
}));
vi.mock("@/ui/forms", () => ({
  UiFormRow: (p: any) => capture("row")(p),
  UiDatePicker: (p: any) => capture("picker")(p),
  UiTextInput: (p: any) => capture("input")(p),
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: (fn: any) => fn({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/locale", () => ({
  t: (key: string) => key,
  formatUiDate: (d: Date) => d.toISOString().slice(0, 10),
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
beforeEach(() => {
  state.cursor = 0;
  state.values = [];
  state.nodes = [];
});
function setup() {
  const onChange = vi.fn(),
    onEditingChange = vi.fn();
  const render = () => {
    state.cursor = 0;
    state.nodes = [];
    return renderToStaticMarkup(
      createElement(FlightAirportField, {
        label: "Airport",
        code: "AKL",
        name: "Auckland",
        disabled: false,
        onChange,
        onEditingChange,
      }),
    );
  };
  render();
  state.nodes.find((n) => n.kind === "row").onPress();
  render();
  return { render, onChange, onEditingChange };
}
it("opens a full-screen search above keyboard-safe results and cancels without changing the airport", () => {
  const f = setup();
  expect(state.nodes.find((n) => n.kind === "modal").presentationStyle).toBe(
    "fullScreen",
  );
  expect(state.nodes.find((n) => n.kind === "input").autoFocus).toBe(true);
  expect(state.nodes.find((n) => n.kind === "scroll")).toMatchObject({
    automaticallyAdjustKeyboardInsets: true,
    keyboardShouldPersistTaps: "handled",
  });
  state.nodes.find((n) => n.kind === "input").onChangeText("NRT");
  f.render();
  expect(f.onChange).not.toHaveBeenCalled();
  state.nodes.find((n) => n.kind === "header").onLeft();
  f.render();
  expect(f.onChange).not.toHaveBeenCalled();
  expect(f.onEditingChange.mock.calls).toEqual([[true], [false]]);
  expect(state.nodes.some((n) => n.kind === "modal")).toBe(false);
});
it("commits the selected catalog airport and its IANA zone together", () => {
  const f = setup();
  state.nodes.find((n) => n.kind === "input").onChangeText("NRT");
  f.render();
  state.nodes.find((n) => n.kind === "button" && n.label.startsWith("NRT")).onPress();
  expect(f.onChange).toHaveBeenCalledOnce();
  expect(f.onChange.mock.calls[0][0]).toMatchObject({ code: "NRT", zone: "Asia/Tokyo" });
});
it("retains explicitly authored airport text without inventing a time zone", () => {
  const f = setup();
  state.nodes.find((n) => n.kind === "input").onChangeText("My private airfield");
  f.render();
  state.nodes.find((n) => n.label === "manualFlight.keepAirport").onPress();
  expect(f.onChange.mock.calls[0][0]).toMatchObject({
    name: "My private airfield",
    zone: null,
  });
});
