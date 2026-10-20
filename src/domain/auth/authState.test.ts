import { describe, expect, it } from "vitest";

import { canUseCloud, canUseLocalData } from "./authState";
import { stateFromSessionAndNetwork } from "./localSession";

describe("auth state policy", () => {
  it("allows local app usage while authenticated offline", () => {
    expect(canUseLocalData("AUTHENTICATED_OFFLINE")).toBe(true);
    expect(canUseCloud("AUTHENTICATED_OFFLINE")).toBe(false);
  });

  it("requires reauth before local data is available to a signed out user", () => {
    expect(canUseLocalData("SIGNED_OUT")).toBe(false);
    expect(canUseCloud("SIGNED_OUT")).toBe(false);
  });

  it("reports a fresh validated token online without weakening offline access", () => {
    const session = {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: "2026-09-10T12:00:00.000Z",
    };
    const now = Date.parse("2026-09-10T11:00:00.000Z");

    expect(stateFromSessionAndNetwork(session, true, now)).toBe("AUTHENTICATED_ONLINE");
    expect(stateFromSessionAndNetwork(session, false, now)).toBe("AUTHENTICATED_OFFLINE");
    expect(
      stateFromSessionAndNetwork(
        { ...session, expiresAt: "2026-09-10T10:00:00.000Z" },
        true,
        now,
      ),
    ).toBe("AUTHENTICATED_OFFLINE");
  });
});
