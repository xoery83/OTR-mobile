import { expect, it } from "vitest";
import {
  movePrecision,
  moveFingerLineY,
  moveEdgeVelocity,
  movePlacementAtY,
  moveDayAtY,
  moveDayHeightTime,
  moveCardPosition,
} from "./p1MoveCursor";
it("provides four precision bands with hysteresis", () => {
  expect([40, 140, 240, 370].map((x) => movePrecision(x, 402))).toEqual([
    10, 30, 60, 120,
  ]);
  expect(movePrecision(105, 402, 10)).toBe(10);
  expect(movePrecision(115, 402, 10)).toBe(30);
});
it("scrolls only within edge zones and stops immediately in the middle", () => {
  expect(moveEdgeVelocity(450, 108, 764, 874)).toBe(0);
  expect(moveEdgeVelocity(130, 108, 764, 874)).toBeLessThan(0);
  expect(moveEdgeVelocity(740, 108, 764, 874)).toBeGreaterThan(0);
  expect(Math.abs(moveEdgeVelocity(109, 108, 764, 874))).toBeGreaterThan(
    Math.abs(moveEdgeVelocity(160, 108, 764, 874)),
  );
  expect(moveEdgeVelocity(-1, 108, 764, 874)).toBe(0);
});
it("interpolates only the clocks of the day physically under the line", () => {
  const anchors = [
    { y: 200, minute: 600 },
    { y: 400, minute: 720 },
  ];
  const original = JSON.stringify(anchors);
  expect(movePlacementAtY("2027-01-16", anchors, 300, 10, 630)).toEqual({
    date: "2027-01-16",
    minute: 660,
  });
  expect(JSON.stringify(anchors)).toBe(original);
});
it("an empty Jan18 region uses that day height rather than Jan17 or the old clock", () => {
  const boxes = [
    { top: 200, bottom: 800, date: "2027-01-17" },
    { top: 800, bottom: 1100, date: "2027-01-18" },
  ];
  const date = moveDayAtY(boxes, 1000)!;
  expect(date).toBe("2027-01-18");
  expect(moveDayHeightTime(date, 800, 1100, 1000, 60)).toEqual({
    date: "2027-01-18",
    minute: 960,
  });
});
it("clock rounding cannot carry placement into a different visible Day", () => {
  expect(
    movePlacementAtY("2027-01-18", [{ y: 200, minute: 1430 }], 200, 60, 630),
  ).toEqual({ date: "2027-01-18", minute: 1430 });
});
it("finger line depends only on the finger and safe viewport bounds", () => {
  expect(moveFingerLineY(450, 100, 874)).toBe(450);
  expect(moveFingerLineY(500, 100, 874)).toBe(500);
  expect(moveFingerLineY(0, 100, 874, 148)).toBe(248);
  expect(moveFingerLineY(1000, 100, 874)).toBe(828);
});
it("the floating card flips sides at screen edges and never covers the time label", () => {
  const top = moveCardPosition(170, 100, 874, 32, 84);
  expect(top).toBeGreaterThan(170);
  const bottom = moveCardPosition(754, 100, 874, 32, 84);
  expect(bottom + 84).toBeLessThanOrEqual(754 - 9 - 32 - 12);
});

it("coarse precision cannot move a candidate outside the visible neighboring clock bounds", () => {
  const anchors = [
    { y: 200, minute: 630 },
    { y: 400, minute: 660 },
  ];
  expect(movePlacementAtY("2027-01-16", anchors, 200, 120, 600).minute).toBe(630);
  const placement = movePlacementAtY("2027-01-16", anchors, 300, 120, 600);
  expect(placement.minute).toBeGreaterThanOrEqual(630);
  expect(placement.minute).toBeLessThanOrEqual(660);
});

it("empty and NTC-only days expose concrete times over their own height", () => {
  expect(moveDayHeightTime("2027-01-20", 200, 600, 200, 10).minute).toBe(0);
  expect(moveDayHeightTime("2027-01-20", 200, 600, 400, 30).minute).toBe(720);
  expect(moveDayHeightTime("2027-01-20", 200, 600, 500, 60).minute).toBe(1080);
  expect(moveDayHeightTime("2027-01-20", 200, 600, 600, 120)).toEqual({
    date: "2027-01-20",
    minute: 1439,
  });
});
