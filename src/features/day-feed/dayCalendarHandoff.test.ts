import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { readDayCalendar, releaseDayCalendar, stageDayCalendar } from "./dayCalendarHandoff";

it("fences the calendar to its current owner, invocation and account generation", () => {
  const calendar = {
    visible: true,
    tripName: "QA Trip",
    summaries: [],
    copy: { unknownBounds: "", markers: { Plans: "", Stay: "", Transport: "" } },
    isCurrent: vi.fn(() => true),
    canSelect: vi.fn(() => true),
    onClose: vi.fn(),
    onSelect: vi.fn(),
  };
  const old = stageDayCalendar(calendar);
  const current = stageDayCalendar(calendar);
  releaseDayCalendar(old);
  expect(readDayCalendar(old)).toBeUndefined();
  expect(readDayCalendar(current)).toBe(calendar);
  calendar.isCurrent.mockReturnValue(false);
  expect(readDayCalendar(current)).toBeUndefined();
  calendar.isCurrent.mockReturnValue(true);
  advanceAccountGeneration();
  expect(readDayCalendar(current)).toBeUndefined();
  expect(calendar.onSelect).not.toHaveBeenCalled();
});
