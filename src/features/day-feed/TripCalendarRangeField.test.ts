import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UiButton } from "@/ui/controls";
import { UiFormRow } from "@/ui/forms";
import { SheetHeader } from "@/components/SheetHeader";
import { lightPalette } from "@/ui/palette";
import {
  TripCalendarRangeField,
  adjacentTripMonth,
  selectTripRange,
} from "./TripCalendarRangeField";
const state = vi.hoisted(() => ({
  values: [] as any[],
  cursor: 0,
  width: 390,
  fontScale: 1,
}));
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
  useWindowDimensions: () => ({ fontScale: state.fontScale, width: state.width }),
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
vi.mock("@/ui/theme", () => ({ useThemedStyles: (create: any) => create(lightPalette) }));
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
  state.width = 390;
  state.fontScale = 1;
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
it("restarts the start date on an earlier tap, supports single-day intervals and restarting an existing interval without inventing a zone", () => {
  expect(selectTripRange({ start: "2027-01-03", end: "" }, "2026-12-30")).toEqual({
    start: "2026-12-30",
    end: "",
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

const style = (value: any): Record<string, any> =>
  Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
function openedCalendar(value = { start: "2026-10-01", end: "2026-10-31" }) {
  const render = () => {
    state.cursor = 0;
    return nodes(TripCalendarRangeField({ value, onChange: vi.fn() }));
  };
  render()
    .find((node) => node.type === UiFormRow)!
    .props.onPress();
  return () => render().find((node) => node.type === "FlatList")!;
}
it.each([1, 2.5, 4])(
  "gives six seven-cell weeks an explicit matching item/scroll/grid height at text scale %s",
  (fontScale) => {
    state.fontScale = fontScale;
    state.width = 320;
    const list = openedCalendar()();
    const month = list.props.renderItem({ item: "2026-10" });
    const [title, scroll] = Children.toArray(month.props.children) as Element[];
    const grid = scroll.props.children;
    const weeks = Children.toArray(grid.props.children) as Element[];
    const size = Math.max(44, Math.ceil(24 * fontScale));
    expect(weeks).toHaveLength(7);
    const geometry = style(month.props.style);
    expect(list.props.getItemLayout(null, 5)).toEqual({
      index: 5,
      length: geometry.height,
      offset: 5 * geometry.height,
    });
    expect(geometry.height).toBe(
      style(title.props.style).height + geometry.gap + style(scroll.props.style).height,
    );
    expect(scroll.props.style).toMatchObject({
      height: 7 * size,
      flexGrow: 0,
      flexShrink: 0,
    });
    expect(scroll.props.contentContainerStyle.height).toBe(7 * size);
    expect(grid.props.style.height).toBe(7 * size);
    const dates: string[] = [];
    for (const week of weeks) {
      expect(style(week.props.style)).toMatchObject({
        height: size,
        flexDirection: "row",
      });
      const cells = Children.toArray(week.props.children) as Element[];
      expect(cells).toHaveLength(7);
      for (const cell of cells) {
        expect(style(cell.props.style).height).toBe(size);
        expect(style(cell.props.style).width).toBeCloseTo(grid.props.style.width / 7);
        expect(style(cell.props.style).width).toBeGreaterThanOrEqual(44);
        if (cell.type === "Pressable") dates.push(cell.props.accessibilityLabel);
      }
    }
    expect(dates).toEqual(
      Array.from(
        { length: 31 },
        (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`,
      ),
    );
  },
);
it("preserves one opening index and chronological month identities while edge callbacks expand the same list", () => {
  const renderList = openedCalendar();
  const before = renderList();
  const anchor = "2026-10";
  const index = before.props.data.indexOf(anchor);
  const beforeOffset = before.props.getItemLayout(null, index).offset;
  before.props.onStartReached();
  const prepended = renderList();
  expect(prepended.props.initialScrollIndex).toBe(before.props.initialScrollIndex);
  const nextIndex = prepended.props.data.indexOf(anchor);
  expect(nextIndex).toBe(index + 12);
  expect(prepended.props.getItemLayout(null, nextIndex).offset - beforeOffset).toBe(
    12 * prepended.props.getItemLayout(null, 0).length,
  );
  prepended.props.onEndReached();
  const appended = renderList();
  expect(appended.props.initialScrollIndex).toBe(before.props.initialScrollIndex);
  expect(appended.props.data.indexOf(anchor)).toBe(nextIndex);
  expect(appended.props.data).toEqual([...appended.props.data].sort());
  expect(new Set(appended.props.data).size).toBe(appended.props.data.length);
});
it.each(["0001-01-01", "9999-12-31"])(
  "does not mutate exhausted edge bounds at %s",
  (day) => {
    const renderList = openedCalendar({ start: day, end: day });
    const before = state.values[2];
    const list = renderList();
    if (day.startsWith("0001")) list.props.onStartReached();
    else list.props.onEndReached();
    expect(state.values[2]).toBe(before);
  },
);

it("aligns the dates caption with the form fields without changing canonical defaults", () => {
  const rows = nodes(
    TripCalendarRangeField({ value: { start: "", end: "" }, onChange: vi.fn() }),
  );
  expect(rows.find((n) => n.type === UiFormRow)!.props.horizontalInset).toBe(0);
});

it("P3 starts each opened selection with check-in even when a start is prefilled, and marks Today within Trip dates", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 12));
  try {
    const onChange = vi.fn();
    const value = { start: "2026-11-01", end: "" };
    const render = () => {
      state.cursor = 0;
      return nodes(
        TripCalendarRangeField({
          value,
          onChange,
          startWithCheckin: true,
          markToday: true,
          referenceRange: { start: "2026-11-01", end: "2026-11-07" },
        }),
      );
    };
    render()
      .find((n) => n.type === UiFormRow)!
      .props.onPress();
    let view = render();
    const today = view.find(
      (n) => n.type === "Pressable" && n.props.accessibilityLabel === "2026-11-02",
    )!;
    expect(today.props.accessibilityHint).toBe("search.today");
    expect(nodes(today).some((n) => n.props.children === "search.today")).toBe(false);
    expect(today.props.style).toContainEqual({ backgroundColor: lightPalette.selected });
    today.props.onPress();
    view = render();
    expect(
      view.find(
        (n) => n.type === "Pressable" && n.props.accessibilityLabel === "2026-11-02",
      )!.props.accessibilityState.selected,
    ).toBe(true);
    view
      .find((n) => n.type === "Pressable" && n.props.accessibilityLabel === "2026-11-05")!
      .props.onPress();
    render()
      .find((n) => n.type === SheetHeader)!
      .props.onRight();
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      start: "2026-11-02",
      end: "2026-11-05",
    });
  } finally {
    vi.useRealTimers();
  }
});

afterEach(() => vi.useRealTimers());
it("shared Trip and Stay calendars mark Today without optional text in the Trip modal title", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 26, 12));
  const onChange = vi.fn(),
    value = { start: "2026-10-25", end: "2026-10-30" };
  const render = (referenceRange?: typeof value) => {
    state.cursor = 0;
    return nodes(TripCalendarRangeField({ value, onChange, referenceRange }));
  };
  let view = render();
  view.find((n) => n.type === UiFormRow)!.props.onPress();
  view = render();
  expect(view.find((n) => n.type === SheetHeader)!.props.title).toBe(
    "tripForm.dateTitle",
  );
  let today = view.find(
    (n) => n.type === "Pressable" && n.props.accessibilityHint === "search.today",
  )!;
  expect(nodes(today).some((n) => n.props.testID === "calendar-today-selected")).toBe(
    true,
  );
  state.values = [];
  view = render({ start: "2026-10-20", end: "2026-11-01" });
  view.find((n) => n.type === UiFormRow)!.props.onPress();
  view = render({ start: "2026-10-20", end: "2026-11-01" });
  today = view.find(
    (n) => n.type === "Pressable" && n.props.accessibilityHint === "search.today",
  )!;
  expect(nodes(today).some((n) => n.props.testID === "calendar-today-selected")).toBe(
    true,
  );
});
it("P3 keeps choosing checkout after an earlier tap resets check-in", () => {
  const onChange = vi.fn();
  const render = () => {
    state.cursor = 0;
    return nodes(
      TripCalendarRangeField({
        value: { start: "2026-11-01", end: "" },
        onChange,
        startWithCheckin: true,
      }),
    );
  };
  render()
    .find((n) => n.type === UiFormRow)!
    .props.onPress();
  for (const date of ["2026-11-10", "2026-11-05", "2026-11-08"])
    render()
      .find((n) => n.type === "Pressable" && n.props.accessibilityLabel === date)!
      .props.onPress();
  render()
    .find((n) => n.type === SheetHeader)!
    .props.onRight();
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    start: "2026-11-05",
    end: "2026-11-08",
  });
});

it("reports open/close and lets a scoped handoff block opening without changing committed dates", () => {
  const onChange = vi.fn(),
    onOpenChange = vi.fn(() => false as boolean | void);
  const value = { start: "2026-12-14", end: "2026-12-21" };
  const render = () => {
    state.cursor = 0;
    return nodes(TripCalendarRangeField({ value, onChange, onOpenChange }));
  };
  render()
    .find((node) => node.type === UiFormRow)!
    .props.onPress();
  expect(render().find((node) => node.type === "Modal")!.props.visible).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
  onOpenChange.mockReturnValue(undefined);
  render()
    .find((node) => node.type === UiFormRow)!
    .props.onPress();
  expect(render().find((node) => node.type === "Modal")!.props.visible).toBe(true);
  render()
    .find((node) => node.type === SheetHeader)!
    .props.onLeft();
  expect(render().find((node) => node.type === "Modal")!.props.visible).toBe(false);
  expect(onOpenChange.mock.calls).toEqual([[true], [true], [false]]);
  expect(onChange).not.toHaveBeenCalled();
});
