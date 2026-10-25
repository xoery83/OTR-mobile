import { expect, it } from "vitest";
import {
  moveClockTick,
  moveInsertionTarget,
  movePrecision,
  moveTickRate,
} from "./p1MoveCursor";
it("provides four screen-relative precision bands with hysteresis", () => {
  expect([40, 140, 240, 370].map((x) => movePrecision(x, 402))).toEqual([
    10, 30, 60, 120,
  ]);
  expect(movePrecision(105, 402, 10)).toBe(10);
  expect(movePrecision(115, 402, 10)).toBe(30);
});
it("stops in neutral, accelerates with distance, and caps coarse traversal", () => {
  expect(moveTickRate(10, 10)).toBe(0);
  expect(moveTickRate(-60, 30)).toBe(-moveTickRate(60, 30));
  expect(moveTickRate(120, 10)).toBeGreaterThan(moveTickRate(20, 10));
  expect(moveTickRate(1000, 120)).toBe(1.2);
});
it("preserves off-grid time on a horizontal-only change, then aligns the deliberate tick", () => {
  const args = ["2027-01-16", 975] as const;
  expect(moveClockTick(...args, 60, 0, "2027-01-16", "2027-01-25").minute).toBe(975);
  expect(moveClockTick(...args, 60, 1, "2027-01-16", "2027-01-25").minute).toBe(1020);
  expect(moveClockTick(...args, 60, -1, "2027-01-16", "2027-01-25").minute).toBe(960);
});
it("crosses midnight in either direction including DST dates without asserting an instant", () => {
  expect(moveClockTick("2027-04-04", 1430, 10, 1, "2027-04-01", "2027-04-10")).toEqual({
    date: "2027-04-05",
    minute: 0,
  });
  expect(moveClockTick("2027-04-05", 0, 10, -1, "2027-04-01", "2027-04-10")).toEqual({
    date: "2027-04-04",
    minute: 1430,
  });
  expect(moveClockTick("2027-01-25", 1380, 120, 1, "2027-01-16", "2027-01-25")).toEqual({
    date: "2027-01-25",
    minute: 1380,
  });
});
it("uses the existing rendered order for placement and omits the source identity", () => {
  const rows = [
    { key: "ntc", itemId: "ntc", date: "2027-01-16", minute: null },
    { key: "source", itemId: "a", date: "2027-01-16", minute: 600 },
    { key: "next", itemId: "b", date: "2027-01-16", minute: 780 },
  ];
  expect(moveInsertionTarget(rows, "2027-01-16", 750, "a", false)).toMatchObject({
    key: "next",
    edge: "BEFORE",
  });
  expect(moveInsertionTarget(rows, "2027-01-17", 750, "a", false)).toMatchObject({
    key: "day:2027-01-17",
    edge: "AFTER",
  });
});

it("follows upward through the previous measured row instead of getting stuck at within=0", async () => {
  const { moveFollowAnchor } = await import("./p1MoveCursor");
  const rows = [
    { key: "day", itemId: "", date: "2027-01-16", minute: null },
    { key: "next", itemId: "b", date: "2027-01-16", minute: 780 },
  ];
  expect(
    moveFollowAnchor(
      { key: "next", date: "2027-01-16", within: 0 },
      -20,
      rows,
      () => 120,
    ),
  ).toEqual({ key: "day", date: "2027-01-16", within: 100 });
});
