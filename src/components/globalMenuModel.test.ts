import { describe, expect, it } from "vitest";

import {
  contextualMenuDestinations,
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
  });

  it("builds account labels without exposing identifiers", () => {
    expect(journeyRoleLabel("owner")).toBe("Organizer");
    expect(journeyRoleLabel("member")).toBe("Member");
    expect(maskEmail("synthetic.owner@example.test")).toBe("s•••@example.test");
    expect(moduleReturnPath("LEDGER")).toBe("/expenses");
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
