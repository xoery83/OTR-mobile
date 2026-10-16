import { expect, it } from "vitest";
import {
  initialDayFeedShellDates,
  initialDayFeedShellScroll,
  updateDayFeedShellDates,
  updateDayFeedShellScroll,
} from "./dayFeedShellState";

it("hides only after sustained forward reading, stays hidden at rest and restores on a small reverse", () => {
  let state = initialDayFeedShellScroll;
  for (const offset of [5, 12, 24]) state = updateDayFeedShellScroll(state, offset, true);
  expect(state.navigationVisible).toBe(true);
  state = updateDayFeedShellScroll(state, 36, true);
  expect(state.navigationVisible).toBe(false);
  expect(updateDayFeedShellScroll(state, 36, true)).toBe(state);
  state = updateDayFeedShellScroll(state, 34, true);
  expect(state.navigationVisible).toBe(false);
  state = updateDayFeedShellScroll(state, 28, true);
  expect(state.navigationVisible).toBe(true);
});
it("does not classify anchor restoration or calendar jumps as reading gestures; always restores at top", () => {
  let state = updateDayFeedShellScroll(initialDayFeedShellScroll, 1200, false);
  expect(state.navigationVisible).toBe(true);
  state = updateDayFeedShellScroll(state, 1240, true);
  expect(state.navigationVisible).toBe(false);
  state = updateDayFeedShellScroll(state, 300, false);
  expect(state.navigationVisible).toBe(false);
  state = updateDayFeedShellScroll(state, -3, true);
  expect(state.navigationVisible).toBe(true);
  expect(state.offset).toBe(0);
  expect(updateDayFeedShellScroll(state, Number.NaN, true)).toBe(state);
});
it("keeps the actual visible date range steady at section boundaries, supports immediate explicit jumps", () => {
  const a = { first: "2027-02-01", last: "2027-02-02" };
  const b = { first: "2027-02-02", last: "2027-02-03" };
  let state = updateDayFeedShellDates(initialDayFeedShellDates, a, 0);
  state = updateDayFeedShellDates(state, b, 10);
  expect(state.visible).toEqual(a);
  state = updateDayFeedShellDates(state, a, 50);
  state = updateDayFeedShellDates(state, b, 70);
  state = updateDayFeedShellDates(state, b, 189);
  expect(state.visible).toEqual(a);
  state = updateDayFeedShellDates(state, b, 190);
  expect(state.visible).toEqual(b);
  expect(
    updateDayFeedShellDates(state, { first: "2027-03-17", last: "2027-03-17" }, 191, true)
      .visible?.first,
  ).toBe("2027-03-17");
  expect(
    updateDayFeedShellDates(state, { first: "2027-04-01", last: "2027-03-01" }, 220),
  ).toBe(state);
});
