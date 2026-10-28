import { expect, it } from "vitest";
import { p1CivilMoveItem, p1CivilProposal, p1CivilDuration } from "./p1CivilMove";
const point = {
  availability: "AVAILABLE",
  date: "2026-10-25",
  time: "23:31",
  zone: null,
};
it("changes authored local clocks without inventing a zone, instant or point end", () => {
  expect(p1CivilProposal(point, "2026-10-26", 60)).toMatchObject({
    status: "READY",
    date: "2026-10-26",
    time: "01:00",
    endDate: null,
    endTime: null,
    instant: null,
    endInstant: null,
    zone: null,
  });
});
it("preserves a cross-midnight civil interval and zero duration", () => {
  const item = { ...point, endDate: "2026-10-26", endTime: "01:31" };
  expect(p1CivilDuration(item)).toBe(120);
  expect(p1CivilProposal(item, "2026-10-26", 1380)).toMatchObject({
    endDate: "2026-10-27",
    endTime: "01:00",
  });
  expect(
    p1CivilProposal(
      { ...point, endDate: point.date, endTime: point.time },
      point.date,
      60,
    ).endTime,
  ).toBe("01:00");
});
it("assigns a concrete time to NTC, preserving a date-only end offset", () => {
  expect(
    p1CivilProposal({ ...point, time: null, endDate: "2026-10-27" }, "2026-10-30", 600),
  ).toMatchObject({ time: "10:00", endDate: "2026-11-01", endTime: null });
});
it("does not reinterpret named-zone or instant evidence, including DST dates", () => {
  expect(
    p1CivilProposal({ ...point, zone: "Pacific/Auckland" }, "2026-09-27", 150).status,
  ).toBe("UNAVAILABLE");
  expect(
    p1CivilProposal({ ...point, instant: "2026-10-25T10:31:00Z" }, "2026-10-26", 60)
      .status,
  ).toBe("UNAVAILABLE");
  expect(p1CivilProposal(point, "2026-02-30", 60).status).toBe("UNAVAILABLE");
});
it("never grants a gesture from hidden, foreign-family or qualified schedules", () => {
  const item = {
    itemId: "one",
    title: "P1",
    family: "P1",
    status: "planned",
    schedule: {
      start: { localDate: point.date, localTime: point.time, comparable: false },
    },
  } as any;
  expect(p1CivilMoveItem(item)?.time).toBe("23:31");
  expect(p1CivilMoveItem({ ...item, hidden: true })).toBeUndefined();
  expect(p1CivilMoveItem({ ...item, family: "P3" })).toBeUndefined();
  expect(
    p1CivilMoveItem({
      ...item,
      schedule: { start: { ...item.schedule.start, zoneId: "Pacific/Auckland" } },
    }),
  ).toBeUndefined();
});
