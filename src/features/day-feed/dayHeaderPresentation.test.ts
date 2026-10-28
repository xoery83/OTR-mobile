import { afterEach, beforeEach, expect, it } from "vitest";
import { getUiLocale, setUiLocale } from "@/ui/locale";
import {
  dayHeaderPresentation,
  unresolvedDayHeaderDestination,
} from "./dayHeaderPresentation";
import { nextDayHeaderStyle, type DayHeaderStyle } from "@/domain/trip/dayHeaderStyle";

const originalLocale = getUiLocale();
beforeEach(() => setUiLocale("en"));
afterEach(() => setUiLocale(originalLocale));
const base = { start: "2026-10-24", today: "2026-10-27", date: "2026-10-27" };
const destination = { kind: "single", label: "Nelson", source: "stay" } as const;
const cases: [DayHeaderStyle, string, string, string, string | null, string][] = [
  ["A", "2026-10-27", "Today", "Tuesday · Oct 27, 2026", null, "4"],
  ["A", "2026-10-28", "Tomorrow", "Wednesday · Oct 28, 2026", null, "5"],
  ["A", "2026-10-29", "Thursday", "Oct 29, 2026", null, "6"],
  ["B", "2026-10-27", "Today", "Day 4 · Nelson", "Tue", "27"],
  ["B", "2026-10-28", "Tomorrow", "Day 5 · Nelson", "Wed", "28"],
  ["B", "2026-10-29", "Day 6", "Nelson", "Thu", "29"],
  ["C", "2026-10-27", "Nelson", "Tuesday · Oct 27, 2026", null, "4"],
  ["C", "2026-10-28", "Nelson", "Wednesday · Oct 28, 2026", null, "5"],
  ["C", "2026-10-29", "Nelson", "Thursday · Oct 29, 2026", null, "6"],
  ["D", "2026-10-27", "Nelson", "Day 4 · Tuesday", "Oct", "27"],
  ["D", "2026-10-28", "Nelson", "Day 5 · Wednesday", "Oct", "28"],
  ["D", "2026-10-29", "Nelson", "Day 6 · Thursday", "Oct", "29"],
];
it.each(cases)(
  "%s resolved layout on %s",
  (style, date, title, subtitle, badgeTop, badgeBottom) => {
    expect(dayHeaderPresentation({ ...base, date, style, destination })).toMatchObject({
      title,
      subtitle,
      badgeTop,
      badgeBottom,
    });
  },
);
it.each([
  ["A", "2026-10-27", "Today", "Tuesday · Oct 27, 2026"],
  ["A", "2026-10-28", "Tomorrow", "Wednesday · Oct 28, 2026"],
  ["A", "2026-10-29", "Thursday", "Oct 29, 2026"],
  ["B", "2026-10-27", "Today", "Day 4"],
  ["B", "2026-10-28", "Tomorrow", "Day 5"],
  ["B", "2026-10-29", "Day 6", "Oct 29, 2026"],
  ["C", "2026-10-27", "Today", "Tuesday · Oct 27, 2026"],
  ["C", "2026-10-28", "Tomorrow", "Wednesday · Oct 28, 2026"],
  ["C", "2026-10-29", "Thursday", "Oct 29, 2026"],
  ["D", "2026-10-27", "Tuesday", "Day 4"],
  ["D", "2026-10-28", "Wednesday", "Day 5"],
  ["D", "2026-10-29", "Thursday", "Day 6"],
] as const)("%s exact unresolved fallback on %s", (style, date, title, subtitle) => {
  expect(dayHeaderPresentation({ ...base, date, style })).toMatchObject({
    title,
    subtitle,
  });
});
it("cycles only the four presentation IDs and leaves unsupported geography unresolved", () => {
  let style: DayHeaderStyle = "A";
  expect(Array.from({ length: 4 }, () => (style = nextDayHeaderStyle(style)))).toEqual([
    "B",
    "C",
    "D",
    "A",
  ]);
  expect(unresolvedDayHeaderDestination).toEqual({
    kind: "unresolved",
    label: null,
    source: "none",
  });
  expect(Object.isFrozen(unresolvedDayHeaderDestination)).toBe(true);
});
it("uses the caller's civil Today authority, including no Today authority, across DST", () => {
  expect(
    dayHeaderPresentation({
      ...base,
      date: "2026-09-28",
      start: "2026-09-26",
      today: "",
    }),
  ).toMatchObject({ ordinal: 3, title: "Monday", subtitle: "Sep 28, 2026" });
});
it("retains authorized route text and localizes the surrounding complete messages", () => {
  setUiLocale("zh-Hans");
  const route = {
    kind: "route",
    label: "Auckland → 尼尔森",
    source: "transport",
  } as const;
  expect(
    dayHeaderPresentation({ ...base, style: "B", destination: route }),
  ).toMatchObject({ title: "今天", subtitle: "第4天 · Auckland → 尼尔森" });
  expect(dayHeaderPresentation({ ...base, style: "D" })).toMatchObject({
    title: "星期二",
    subtitle: "第4天",
    badgeTop: "10月",
    badgeBottom: "27",
  });
});
