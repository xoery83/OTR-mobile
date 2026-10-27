import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { TripDayHeading } from "./TripDayHeading";
const state = vi.hoisted(() => ({ headings: [] as any[] }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));
vi.mock("./DayFeedFidelityHeading", () => ({
  DayFeedFidelityHeading: (props: any) => {
    state.headings.push(props);
    return null;
  },
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const base = {
  date: "2026-10-27",
  start: "2026-10-24",
  today: "2026-10-27",
  empty: false,
};
it("all current Trip headers share cycling without changing dates/add callbacks or another Trip", () => {
  const onAdd = vi.fn();
  function render() {
    state.headings = [];
    for (const [tripId, date] of [
      ["trip-a", "2026-10-27"],
      ["trip-a", "2026-10-28"],
      ["trip-b", "2026-10-27"],
    ])
      renderToStaticMarkup(
        createElement(TripDayHeading, { ...base, tripId, date, onAdd }),
      );
    return state.headings;
  }
  let headings = render();
  for (const style of ["B", "C", "D", "A"]) {
    headings[1].onCycleStyle();
    headings = render();
    expect(headings.map((h) => h.styleMode)).toEqual([style, style, "A"]);
    expect(headings.map((h) => h.date)).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-27",
    ]);
    expect(headings.every((h) => h.onAdd === onAdd)).toBe(true);
    expect(headings.every((h) => h.destination.kind === "unresolved")).toBe(true);
  }
  expect(onAdd).not.toHaveBeenCalled();
});
