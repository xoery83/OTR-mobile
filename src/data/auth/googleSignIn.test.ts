import { describe, expect, it, vi } from "vitest";
import { createGoogleSignInAdapter, googleSignInConfiguration } from "./googleSignIn";
import app from "../../../app.json";

function setup() {
  const sdk = {
    configure: vi.fn(),
    signIn: vi
      .fn()
      .mockResolvedValue({ type: "success", data: { idToken: "google-token" } }),
    signOut: vi.fn().mockResolvedValue(null),
  };
  const session = {
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: null,
    identity: { userId: "supabase-account", displayName: "", email: null },
  };
  const exchange = vi.fn().mockResolvedValue(session);
  return {
    sdk,
    exchange,
    session,
    adapter: createGoogleSignInAdapter(() => sdk, exchange),
  };
}

describe("native Google provisional credentials", () => {
  it("binds the approved bundle, reversed scheme and server audience", () => {
    expect(app.expo.ios.bundleIdentifier).toBe("com.xoery.otrmobile");
    expect(app.expo.plugins).toContainEqual([
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme: `com.googleusercontent.apps.${googleSignInConfiguration.iosClientId.replace(".apps.googleusercontent.com", "")}`,
      },
    ]);
    expect(googleSignInConfiguration.webClientId).toBe(
      "580120713844-t44tea8s903dbflo0oqfk35gq4dto5rm.apps.googleusercontent.com",
    );
  });
  it("exchanges only the ID token after clearing provider-local state", async () => {
    const { sdk, exchange, session, adapter } = setup();
    const signal = new AbortController().signal;
    expect(await adapter.verify({ provider: "google" }, signal)).toBe(session);
    expect(sdk.configure).toHaveBeenCalledWith(googleSignInConfiguration);
    expect(exchange).toHaveBeenCalledWith(
      { provider: "google", idToken: "google-token" },
      { signal },
    );
    expect(sdk.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      exchange.mock.invocationCallOrder[0],
    );
  });
  it("keeps an old binary unavailable", async () => {
    expect(await createGoogleSignInAdapter(() => null).capability()).toEqual({
      available: false,
      reason: "NATIVE_MODULE_MISSING",
    });
  });
  it.each(["cancel", "abort", "missing", "failure", "cleanup"])(
    "does not exchange on %s",
    async (mode) => {
      const { sdk, exchange, adapter } = setup();
      const controller = new AbortController();
      if (mode === "cancel")
        sdk.signIn.mockResolvedValue({ type: "cancelled", data: null });
      if (mode === "abort")
        sdk.signIn.mockImplementation(async () => {
          controller.abort();
          return { type: "success", data: { idToken: "late-token" } };
        });
      if (mode === "missing")
        sdk.signIn.mockResolvedValue({ type: "success", data: { idToken: null } });
      if (mode === "failure")
        sdk.signIn.mockRejectedValue(new Error("secret-native-diagnostic"));
      if (mode === "cleanup")
        sdk.signOut.mockRejectedValue(new Error("private-cache-error"));
      await expect(
        adapter.verify({ provider: "google" }, controller.signal),
      ).rejects.toThrow(/^GOOGLE_SIGN_IN_/);
      expect(exchange).not.toHaveBeenCalled();
      expect(sdk.signOut).toHaveBeenCalledOnce();
    },
  );
});
