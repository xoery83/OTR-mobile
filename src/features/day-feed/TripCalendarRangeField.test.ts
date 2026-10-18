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
        state.values[i] = typeof value === "function" ? value(state.values[i]) : value;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ fontScale: 1, width: 390 }),
  View: "View",
  Modal: "Modal",
  FlatList: "FlatList",
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
        ...((node as Element).type === "FlatList"
          ? (node as Element).props.data.flatMap((item: string) =>
              nodes((node as Element).props.renderItem({ item })),
            )
          : []),
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
  expect(render().some((n) => n.props.label === "tripForm.nextMonth")).toBe(false);
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

it("keeps a bounded virtualized continuous calendar and extends both ends without altering the draft", () => {
  const onChange = vi.fn();
  const value = { start: "2026-12-14", end: "2027-12-21" };
  const render = () => {
    state.cursor = 0;
    return nodes(TripCalendarRangeField({ value, onChange }));
  };
  render()
    .find((n) => n.type === UiFormRow)!
    .props.onPress();
  let list = render().find((n) => n.type === "FlatList")!;
  expect(list.props.data).toEqual(expect.arrayContaining(["2026-12", "2027-12"]));
  expect(list.props.initialScrollIndex).toBe(12);
  expect(list.props.initialNumToRender).toBe(3);
  const first = list.props.data[0],
    last = list.props.data.at(-1);
  list.props.onStartReached();
  list = render().find((n) => n.type === "FlatList")!;
  expect(list.props.data[0]).toBe(adjacentTripMonth(first, -12));
  list.props.onEndReached();
  list = render().find((n) => n.type === "FlatList")!;
  expect(list.props.data.at(-1)).toBe(adjacentTripMonth(last, 12));
  expect(onChange).not.toHaveBeenCalled();
});

it("clamps browsing to valid four-digit calendar years without looping at either boundary", () => {
  expect(adjacentTripMonth("0001-01", -12)).toBe("0001-01");
  expect(adjacentTripMonth("9999-12", 12)).toBe("9999-12");
  for (const day of ["0001-01-01", "9999-12-31"]) {
    state.values = [];
    state.cursor = 0;
    const value = { start: day, end: day };
    nodes(TripCalendarRangeField({ value, onChange: vi.fn() }))
      .find((node) => node.type === UiFormRow)!
      .props.onPress();
    state.cursor = 0;
    const list = nodes(TripCalendarRangeField({ value, onChange: vi.fn() })).find(
      (node) => node.type === "FlatList",
    )!;
    expect(list.props.data).toHaveLength(13);
    expect(list.props.initialScrollIndex).toBe(day.startsWith("0001") ? 0 : 12);
  }
});
