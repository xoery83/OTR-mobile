import { describe, expect, it } from "vitest";

import { ReauthRequiredError, refreshInBackground } from "./authRefresh";

const localSession = {
  accessToken: "expired",
  refreshToken: "refresh",
  expiresAt: "2026-09-09T00:00:00.000Z",
};

describe("background auth refresh", () => {
  it("preserves offline access when refresh cannot reach the network", async () => {
    await expect(
      refreshInBackground(localSession, async () => {
        throw new Error("offline");
      }),
    ).resolves.toEqual({
      authState: "AUTHENTICATED_OFFLINE",
      session: localSession,
    });
  });

  it("requires reauthentication only after an explicit refresh rejection", async () => {
    await expect(
      refreshInBackground(localSession, async () => {
        throw new ReauthRequiredError();
      }),
    ).resolves.toEqual({ authState: "REAUTH_REQUIRED", session: null });
  });
});
