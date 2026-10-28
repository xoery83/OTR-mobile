import { expect, it } from "vitest";
import { tripCoreDayNumber } from "./tripCoreDayNumber";
import { wholeTripCalendarDates } from "./tripListPresentation";

it("anchors eight core days to confirmed start while retaining outside-core coverage", () => {
  const core = Object.freeze({ startDate: "2026-12-14", endDate: "2026-12-21" });
  const dates = wholeTripCalendarDates(core, ["2026-12-13", "2026-12-22"], "2026-12-14");
  expect(dates).toHaveLength(10);
  expect(dates.map((date) => tripCoreDayNumber(date, core))).toEqual([
    null,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    null,
  ]);
  expect(dates[0]).toBe("2026-12-13");
  expect(dates.at(-1)).toBe("2026-12-22");
  expect(core).toEqual({ startDate: "2026-12-14", endDate: "2026-12-21" });
});
it.each([
  null,
  { startDate: null, endDate: null },
  { startDate: null, endDate: "2026-12-21" },
])(
  "does not invent Day1 without a confirmed start, even when coverage exists: %j",
  (core) => {
    for (const date of wholeTripCalendarDates(core, ["2026-12-13"], "2026-12-14"))
      expect(tripCoreDayNumber(date, core)).toBeNull();
  },
);
it("uses a confirmed start with unknown end without inventing total duration", () => {
  const core = { startDate: "2026-12-14", endDate: null };
  expect(tripCoreDayNumber("2026-12-13", core)).toBeNull();
  expect(tripCoreDayNumber("2026-12-14", core)).toBe(1);
  expect(tripCoreDayNumber("2026-12-16", core)).toBe(3);
});
it.each([
  ["2028-02-28", "2028-03-01", 3],
  ["2026-12-31", "2027-01-01", 2],
  ["2026-03-07", "2026-03-09", 3],
  ["2026-09-26", "2026-09-28", 3],
  ["2026-10-16", "2026-10-16", 1],
] as const)(
  "counts calendar dates %s to %s without a device timezone",
  (startDate, date, number) => {
    expect(tripCoreDayNumber(date, { startDate, endDate: date })).toBe(number);
  },
);
it.each([
  ["2026-12-14", "2026-12-15", "2026-12-14"],
  ["2026-02-29", "2026-02-28", "2026-03-01"],
  ["2026-12-14", "invalid", null],
  ["2026-12-14", "2026-12-14", "invalid"],
  ["invalid", "2026-12-14", "2026-12-21"],
])(
  "does not number invalid or reversed core dates: %s %s %s",
  (date, startDate, endDate) => {
    expect(tripCoreDayNumber(date!, { startDate: startDate!, endDate })).toBeNull();
  },
);
it("recomputes after an explicit core-date edit without altering the Item date", () => {
  const date = "2026-12-16";
  expect(
    tripCoreDayNumber(date, { startDate: "2026-12-14", endDate: "2026-12-21" }),
  ).toBe(3);
  expect(
    tripCoreDayNumber(date, { startDate: "2026-12-15", endDate: "2026-12-21" }),
  ).toBe(2);
  expect(date).toBe("2026-12-16");
});
