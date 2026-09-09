import { describe, expect, it } from "vitest";

import { canUseCloud, canUseLocalData } from "./authState";

describe("auth state policy", () => {
  it("allows local app usage while authenticated offline", () => {
    expect(canUseLocalData("AUTHENTICATED_OFFLINE")).toBe(true);
    expect(canUseCloud("AUTHENTICATED_OFFLINE")).toBe(false);
  });

  it("requires reauth before local data is available to a signed out user", () => {
    expect(canUseLocalData("SIGNED_OUT")).toBe(false);
    expect(canUseCloud("SIGNED_OUT")).toBe(false);
  });
});
