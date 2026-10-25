import { expect, it } from "vitest";
import { p1InsertionTime } from "./p1InsertionTime";
import { place, boundary } from "@/features/day-feed-lab/fixtureFacts";
const date = "2027-01-16";
const item = (id: string, start?: string, end?: string) => ({
  ...place(id, id, date),
  boundaries: [
    boundary("START", date, start),
    ...(end ? [boundary("END", date, end)] : []),
  ],
});
it("same gap yields the same midpoint via either adjacent plus", () => {
  const rows = [item("a", "10:30", "12:00"), item("b", "13:00", "14:00")],
    before = JSON.stringify(rows);
  expect(p1InsertionTime(rows, "a", "AFTER", date).startTime).toBe("12:30");
  expect(p1InsertionTime(rows, "b", "BEFORE", date)).toEqual(
    p1InsertionTime(rows, "a", "AFTER", date),
  );
  expect(JSON.stringify(rows)).toBe(before);
});
it("uses the known end or a clearly advisory30minute lead when one bound is missing", () => {
  expect(
    p1InsertionTime([item("a", "10:30", "12:00")], "a", "AFTER", date).startTime,
  ).toBe("12:00");
  expect(p1InsertionTime([item("b", "13:00")], "b", "BEFORE", date).startTime).toBe(
    "12:30",
  );
  expect(p1InsertionTime([item("b", "00:10")], "b", "BEFORE", date).startTime).toBe(
    "00:00",
  );
  expect(p1InsertionTime([item("a")], "a", "AFTER", date).startTime).toBeNull();
});
it("never calls overlap, cross-day or different-zone boundaries a free gap", () => {
  const a = item("a", "10:00", "14:00"),
    b = item("b", "13:00");
  expect(p1InsertionTime([a, b], "a", "AFTER", date).reason).toBe("OVERLAP");
  a.boundaries[1].local_time = "12:00:00";
  b.boundaries[0].zone_id = "Asia/Tokyo";
  expect(p1InsertionTime([a, b], "a", "AFTER", date).reason).toBe("ZONE_MISMATCH");
  a.boundaries[1].local_date = "2027-01-17";
  expect(p1InsertionTime([a, b], "a", "AFTER", date).reason).toBe("CROSS_DAY");
});
it("keeps a tight gap inside its bounds rather than snapping outside", () => {
  expect(
    p1InsertionTime([item("a", "10:00", "12:03"), item("b", "12:07")], "a", "AFTER", date)
      .startTime,
  ).toBe("12:05");
});

it("does not suggest a time before the preceding start when its end is missing", () => {
  expect(
    p1InsertionTime([item("a", "12:50"), item("b", "13:00")], "a", "AFTER", date)
      .startTime,
  ).toBeNull();
});
it("rejects a next-day upper endpoint rather than treating it as an absent bound", () => {
  const next = item("b", "01:00");
  next.boundaries[0].local_date = "2027-01-17";
  expect(
    p1InsertionTime([item("a", "10:00", "12:00"), next], "a", "AFTER", date).reason,
  ).toBe("CROSS_DAY");
});

it("leaves the clock blank for conflicting known zones even when one clock is absent", () => {
  const previous = item("a", "10:00", "12:00"),
    next = item("b");
  previous.boundaries[1].zone_id = "Pacific/Auckland";
  next.boundaries[0].zone_id = "Asia/Tokyo";
  expect(p1InsertionTime([previous, next], "a", "AFTER", date)).toMatchObject({
    reason: "ZONE_MISMATCH",
    startTime: null,
  });
});
