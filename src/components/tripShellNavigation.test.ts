import { expect, it } from "vitest";
import { isExplicitTripDay, isTripWorkspacePath } from "./tripShellNavigation";
it("cold and warm root entry stays My Trips unless a Day intent is explicit", () => {
  for (const params of [{}, { tripId: "a" }, { view: "home" }, { view: "trips" }])
    expect(isExplicitTripDay(params)).toBe(false);
  expect(isExplicitTripDay({ view: "day" })).toBe(true);
  expect(
    isExplicitTripDay({ tripId: "a", date: "2026-10-16", zone: "Pacific/Auckland" }),
  ).toBe(true);
  expect(isExplicitTripDay({ tripId: "a", date: "2026-10-16" })).toBe(false);
});
it("native Home and legacy Trip route share shell semantics", () => {
  expect(isTripWorkspacePath("/trip-home")).toBe(true);
  expect(isTripWorkspacePath("/trip")).toBe(true);
  expect(isTripWorkspacePath("/trip-validation")).toBe(false);
});
