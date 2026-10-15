import { describe, expect, it } from "vitest";

import {
  contextualMenuDestinations,
  selectedTripMenuId,
  isApprovedDevIdentity,
  journeyRoleLabel,
  maskEmail,
  moduleReturnPath,
} from "./globalMenuModel";

describe("contextual global menu", () => {
  it("shows only real Ledger secondary destinations and never primary tabs", () => {
    expect(contextualMenuDestinations("LEDGER").map((item) => item.label)).toEqual([
      "My Ledger",
      "Currency",
    ]);
    expect(contextualMenuDestinations("TODAY")).toEqual([]);
    expect(contextualMenuDestinations("TRIP")).toEqual([]);
    expect(contextualMenuDestinations("CAPTURE")).toEqual([]);
    expect(contextualMenuDestinations("UPDATES")).toEqual([]);
  });

  it("builds account labels without exposing identifiers", () => {
    expect(journeyRoleLabel("owner")).toBe("Organizer");
    expect(journeyRoleLabel("member")).toBe("Member");
    expect(maskEmail("synthetic.owner@example.test")).toBe("s•••@example.test");
    expect(moduleReturnPath("LEDGER")).toBe("/expenses");
    expect(moduleReturnPath("UPDATES")).toBe("/updates");
  });

  it("recognizes only approved Dev identities", () => {
    expect(
      isApprovedDevIdentity({ userId: "00000000-0000-4000-8000-000000000001" }),
    ).toBe(true);
    expect(
      isApprovedDevIdentity({ userId: "00000000-0000-4000-8000-000000000002" }),
    ).toBe(true);
    expect(
      isApprovedDevIdentity({ userId: "00000000-0000-4000-8000-000000000003" }),
    ).toBe(false);
  });
});

it("My Trips/Create and other modules cannot reuse a historical selected-Trip return guard", () => {
  expect(selectedTripMenuId("/trip", { tripId: "a", view: "home" })).toBe("a");
  expect(selectedTripMenuId("/trip", { tripId: "a", view: "day" })).toBe("a");
  for (const view of ["trips", "create"])
    expect(selectedTripMenuId("/trip", { tripId: "a", view })).toBeNull();
  expect(selectedTripMenuId("/trip", { view: "home" })).toBeNull();
  expect(selectedTripMenuId("/expenses", { tripId: "a", view: "home" })).toBeNull();
});
