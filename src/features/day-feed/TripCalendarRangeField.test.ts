import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { UiButton } from "@/ui/controls";
import { UiFormRow } from "@/ui/forms";
import { SheetHeader } from "@/components/SheetHeader";
import {
  TripCalendarRangeField,
  adjacentTripMonth,
  selectTripRange,
} from "./TripCalendarRangeField";
const state = vi.hoisted(() => ({ values: [] as any[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (value: any) => {
        state.values[i] = value;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ fontScale: 1 }),
  View: "View",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (s: any) => s },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "SheetHeader" }));
vi.mock("@/ui/controls", () => ({ UiText: "UiText", UiButton: "UiButton" }));
vi.mock("@/ui/forms", () => ({ UiFormRow: "UiFormRow" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({
  t: (s: string) => s,
  formatUiDate: (d: Date) => d.toISOString().slice(0, 10),
  formatUiNumber: String,
}));
type Element = ReactElement<any>;
function nodes(node: ReactNode): Element[] {
  return isValidElement(node)
    ? [
        node as Element,
        ...Children.toArray((node as Element).props.children).flatMap(nodes),
      ]
    : [];
}
beforeEach(() => {
  state.values = [];
  state.cursor = 0;
});
it("selects an interval across year boundaries with one explicit Done; Cancel and Clear stay draft-only", () => {
  const onChange = vi.fn();
  const value = { start: "2026-12-14", end: "2026-12-21" };
  const render = () => {
    state.cursor = 0;
    return nodes(TripCalendarRangeField({ value, onChange }));
  };
  let view = render();
  view.find((n) => n.type === UiFormRow)!.props.onPress();
  view = render();
  view
    .find((n) => n.type === "Pressable" && n.props.accessibilityLabel === "2026-12-30")!
    .props.onPress();
  render()
    .find((n) => n.type === UiButton && n.props.label === "tripForm.nextMonth")!
    .props.onPress();
  render()
    .find((n) => n.type === "Pressable" && n.props.accessibilityLabel === "2027-01-03")!
    .props.onPress();
  expect(onChange).not.toHaveBeenCalled();
  render()
    .find((n) => n.type === SheetHeader)!
    .props.onRight();
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    start: "2026-12-30",
    end: "2027-01-03",
  });
  onChange.mockClear();
  render()
    .find((n) => n.type === UiFormRow)!
    .props.onPress();
  render()
    .find((n) => n.type === UiButton && n.props.label === "tripForm.clearDates")!
    .props.onPress();
  render()
    .find((n) => n.type === SheetHeader)!
    .props.onLeft();
  expect(onChange).not.toHaveBeenCalled();
  render()
    .find((n) => n.type === UiFormRow)!
    .props.onPress();
  render()
    .find((n) => n.type === UiButton && n.props.label === "tripForm.clearDates")!
    .props.onPress();
  render()
    .find((n) => n.type === SheetHeader)!
    .props.onRight();
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ start: "", end: "" });
});
it("supports reversed taps, single-day intervals and restarting an existing interval without inventing a zone", () => {
  expect(selectTripRange({ start: "2027-01-03", end: "" }, "2026-12-30")).toEqual({
    start: "2026-12-30",
    end: "2027-01-03",
  });
  expect(selectTripRange({ start: "2027-01-03", end: "" }, "2027-01-03")).toEqual({
    start: "2027-01-03",
    end: "2027-01-03",
  });
  expect(adjacentTripMonth("2026-12", 1)).toBe("2027-01");
  expect(adjacentTripMonth("2027-01", -1)).toBe("2026-12");
});
