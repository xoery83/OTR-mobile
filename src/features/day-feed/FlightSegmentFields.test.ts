import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { FlightSegmentFields } from "./FlightSegmentFields";
import { emptyFlightSegment } from "./manualFlightFormFields";
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
  ScrollView: (p: any) => createElement("div", null, p.children),
  Modal: (p: any) => (p.visible ? createElement("div", null, p.children) : null),
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
vi.mock("./FlightAirportField", () => ({
  FlightAirportField: (p: any) => capture("airport")(p),
}));
vi.mock("./TripCalendarField", () => ({
  CalendarField: (p: any) => capture("calendar")(p),
}));
vi.mock("./PlanParticipantsField", () => ({ PlanParticipantsField: () => null }));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
beforeEach(() => {
  state.cursor = 0;
  state.values = [];
  state.nodes = [];
});
function setup() {
  let value = {
    ...emptyFlightSegment("leg", "2026-12-31"),
    departureTime: "23:00",
    originCode: "AKL",
    originName: "Auckland International Airport",
    departureZone: "Pacific/Auckland",
    destinationCode: "NRT",
    destinationName: "Narita International Airport",
    arrivalZone: "Asia/Tokyo",
  };
  const onChange = vi.fn((changes) => {
    value = { ...value, ...changes };
  });
  const onPickerChange = vi.fn();
  const render = () => {
    state.cursor = 0;
    state.nodes = [];
    return renderToStaticMarkup(
      createElement(FlightSegmentFields, {
        value,
        full: true,
        disabled: false,
        participantOptions: [],
        onChange,
        onPickerChange,
      }),
    );
  };
  return { render, onChange, onPickerChange, value: () => value };
}
it("puts both airports before two local clocks and does not prompt for known airport zones", () => {
  const f = setup();
  f.render();
  expect(state.nodes.map((n) => n.kind)).toEqual([
    "input",
    "calendar",
    "airport",
    "airport",
    "row",
    "row",
    "button",
  ]);
  expect(state.nodes.filter((n) => n.kind === "row").map((n) => n.label)).toEqual([
    "manualFlight.departureLocal",
    "manualFlight.arrivalLocal",
  ]);
});
it("uses one civil date/time panel, suggests next day, and retains an explicit same-day override", () => {
  const f = setup();
  f.render();
  state.nodes.find((n) => n.label === "manualFlight.arrivalLocal").onPress();
  f.render();
  const picker = state.nodes.find((n) => n.kind === "picker");
  expect(picker).toMatchObject({ mode: "datetime", timeZoneName: "UTC" });
  picker.onChange({}, new Date("2026-12-31T01:00:00Z"));
  f.render();
  state.nodes.find((n) => n.kind === "header").onRight();
  f.render();
  expect(f.value()).toMatchObject({
    arrivalDate: "2027-01-01",
    arrivalTime: "01:00",
    departureZone: "Pacific/Auckland",
    arrivalZone: "Asia/Tokyo",
  });
  state.nodes.find((n) => n.label === "manualFlight.nextDaySelected").onPress();
  f.render();
  state.nodes.find((n) => n.kind === "calendar").onChange("2026-12-31");
  expect(f.value().arrivalDate).toBe("2026-12-31");
  expect(f.onPickerChange.mock.calls).toEqual([
    ["arrivalTime", true],
    ["arrivalTime", false],
  ]);
});
it("cancel closes the combined panel without changing date or time", () => {
  const f = setup();
  f.render();
  state.nodes.find((n) => n.label === "manualFlight.departureLocal").onPress();
  f.render();
  state.nodes
    .find((n) => n.kind === "picker")
    .onChange({}, new Date("2027-01-02T05:00:00Z"));
  f.render();
  state.nodes.find((n) => n.kind === "header").onLeft();
  expect(f.onChange).not.toHaveBeenCalled();
  expect(f.onPickerChange.mock.calls).toEqual([
    ["departureTime", true],
    ["departureTime", false],
  ]);
});
it("clearing an automatic arrival clock does not leave a fabricated populated endpoint date", () => {
  const f = setup();
  f.render();
  state.nodes.find((n) => n.label === "manualFlight.arrivalLocal").onPress();
  f.render();
  state.nodes
    .find((n) => n.kind === "picker")
    .onChange({}, new Date("2026-12-31T01:00:00Z"));
  f.render();
  state.nodes.find((n) => n.kind === "header").onRight();
  f.render();
  state.nodes.find((n) => n.label === "manualFlight.arrivalLocal").onPress();
  f.render();
  state.nodes.find((n) => n.label === "tripCreate.clearTime").onPress();
  expect(f.value()).toMatchObject({ arrivalTime: "", arrivalDate: "" });
});
