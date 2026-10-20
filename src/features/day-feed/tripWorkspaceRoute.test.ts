import { expect, it } from "vitest";
import {
  isSelectedTripHome,
  resolvedWorkspaceKind,
  showTripContextualActions,
} from "./tripWorkspaceRoute";

it("hides contextual actions while a different cached Trip route resolves", () => {
  const priorLocal = { tripId: "local-trip", generation: 4, kind: "LOCAL" as const };
  const unresolved = resolvedWorkspaceKind(priorLocal, "cached-trip", 4);
  expect(unresolved).toBeNull();
  expect(showTripContextualActions("cached-trip", unresolved, false)).toBe(false);
  expect(showTripContextualActions("cached-trip", "CACHED", false)).toBe(false);
  expect(showTripContextualActions("cached-trip", "CACHED", true)).toBe(false);
  expect(showTripContextualActions("local-trip", "LOCAL", false)).toBe(true);
});

it("invalidates prior workspace resolution across account generations", () => {
  const oldAccount = { tripId: "same-trip", generation: 4, kind: "LOCAL" as const };
  expect(resolvedWorkspaceKind(oldAccount, "same-trip", 5)).toBeNull();
  expect(showTripContextualActions("same-trip", null, false)).toBe(false);
  expect(showTripContextualActions("same-trip", null, true)).toBe(false);
  expect(showTripContextualActions("same-trip", "NONE", true)).toBe(true);
  expect(showTripContextualActions("", null, false)).toBe(true);
});

it("omits a title only for requested selected Home contexts, keeping MyTrips Create and Day chrome", () => {
  expect(isSelectedTripHome({ tripId: "known", view: "home" })).toBe(true);
  expect(isSelectedTripHome({ tripId: "known" })).toBe(true);
  for (const view of ["trips", "create", "day"])
    expect(isSelectedTripHome({ tripId: "known", view })).toBe(false);
  for (const params of [
    undefined,
    null,
    {},
    { tripId: "" },
    { tripId: "  ", view: "home" },
    { tripId: ["known"], view: "home" },
  ])
    expect(isSelectedTripHome(params)).toBe(false);
});
