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
it("nearby neighbours yield a five-minute midpoint without mutating rows", () => {
  const rows = [item("a", "10:30", "12:00"), item("b", "13:00", "14:00")],
    before = JSON.stringify(rows);
  expect(p1InsertionTime(rows, "a", "AFTER", date).startTime).toBe("12:30");
  expect(p1InsertionTime(rows, "b", "BEFORE", date)).toEqual(
    p1InsertionTime(rows, "a", "AFTER", date),
  );
  expect(JSON.stringify(rows)).toBe(before);
});
it("uses directional offsets and a suggestion-only allowance for a missing end", () => {
  expect(
    p1InsertionTime([item("a", "10:30", "12:00")], "a", "AFTER", date).startTime,
  ).toBe("12:20");
  expect(p1InsertionTime([item("b", "13:00")], "b", "BEFORE", date).startTime).toBe(
    "12:00",
  );
  expect(p1InsertionTime([item("b", "00:10")], "b", "BEFORE", date).startTime).toBe(null);
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

it("uses the actual point bracket when the advisory end crosses the next start", () => {
  expect(
    p1InsertionTime([item("a", "12:50"), item("b", "13:00")], "a", "AFTER", date)
      .startTime,
  ).toBe("12:55");
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

it("uses offsets for a wide gap intentionally differing by plus direction", () => {
  const rows = [item("a", "10:00", "12:00"), item("b", "15:00")];
  expect(p1InsertionTime(rows, "a", "AFTER", date).startTime).toBe("12:20");
  expect(p1InsertionTime(rows, "b", "BEFORE", date).startTime).toBe("14:00");
});
it("counts a nearby end even when the previous event started hours ago", () => {
  const rows = [item("a", "08:00", "11:50"), item("b", "12:00")];
  expect(p1InsertionTime(rows, "b", "BEFORE", date).startTime).toBe("11:55");
});
it("uses midpoint at exactly 70 minutes, offset beyond 70", () => {
  const rows = [item("a", "10:00", "12:00"), item("b", "13:10")];
  expect(p1InsertionTime(rows, "a", "AFTER", date).startTime).toBe("12:35");
  expect(p1InsertionTime(rows, "b", "BEFORE", date).startTime).toBe("12:35");
  rows[1] = item("b", "13:11");
  expect(p1InsertionTime(rows, "a", "AFTER", date).startTime).toBe("12:20");
  expect(p1InsertionTime(rows, "b", "BEFORE", date).startTime).toBe("12:11");
});
it("keeps a one-minute gap and does not wrap an after suggestion into another day", () => {
  expect(
    p1InsertionTime([item("a", "12:00", "12:03"), item("b", "12:04")], "a", "AFTER", date)
      .startTime,
  ).toBe("12:03");
  expect(p1InsertionTime([item("a", "23:40")], "a", "AFTER", date).reason).toBe(
    "CROSS_DAY",
  );
});

it("uses the previous point for BEFORE and only an advisory allowance for AFTER", () => {
  expect(
    p1InsertionTime([item("a", "12:50"), item("b", "13:00")], "b", "BEFORE", date)
      .startTime,
  ).toBe("12:55");
  expect(
    p1InsertionTime([item("a", "10:00"), item("b", "13:00")], "a", "AFTER", date)
      .startTime,
  ).toBe("10:50");
  const previous = item("a", "12:50");
  previous.boundaries[0].zone_id = null;
  expect(
    p1InsertionTime([previous, item("b", "13:00")], "b", "BEFORE", date).reason,
  ).toBe("ZONE_MISMATCH");
});
