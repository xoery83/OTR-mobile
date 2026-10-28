import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import Module from "node:module";
import {
  createGoogleSignInAdapter,
  createGoogleNonce,
  googleSignInConfiguration,
} from "./googleSignIn";
import app from "../../../app.json";

function setup() {
  const sdk = {
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
    adapter: createGoogleSignInAdapter(
      () => sdk,
      exchange,
      () => createGoogleNonce(new Uint8Array(32).fill(7)),
    ),
  };
}

describe("native Google provisional credentials", () => {
  it("uses native secure getRandomValues with no Math.random fallback", () => {
    const modules = Module as unknown as {
      _load(request: string, ...args: unknown[]): unknown;
    };
    const originalLoad = modules._load;
    const nativeRandom = vi.fn((bytes: Uint8Array) => bytes.fill(19));
    const load = vi
      .spyOn(modules, "_load")
      .mockImplementation((request, ...args) =>
        request === "expo-crypto"
          ? { getRandomValues: nativeRandom }
          : originalLoad.call(modules, request, ...args),
      );
    const weakRandom = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("INSECURE_RANDOM_FORBIDDEN");
    });
    try {
      expect(createGoogleNonce().raw).toHaveLength(64);
      expect(nativeRandom).toHaveBeenCalledWith(expect.any(Uint8Array));
      expect(weakRandom).not.toHaveBeenCalled();
    } finally {
      weakRandom.mockRestore();
      load.mockRestore();
    }
  });
  it("a busy non-owning attempt cannot clear the original Google prompt", async () => {
    const { sdk, exchange, adapter } = setup();
    let finish!: (value: unknown) => void;
    sdk.signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    sdk.signIn.mockRejectedValueOnce(
      Object.assign(new Error("native diagnostic must stay private"), {
        code: "GOOGLE_SIGN_IN_IN_PROGRESS",
      }),
    );
    const firstScope = new AbortController();
    const first = adapter.verify({ provider: "google" }, firstScope.signal);
    firstScope.abort();
    await expect(
      adapter.verify({ provider: "google" }, new AbortController().signal),
    ).rejects.toThrow("GOOGLE_SIGN_IN_FAILED");
    expect(sdk.signOut).not.toHaveBeenCalled();
    finish({ type: "success", data: { idToken: "late-original-token" } });
    await expect(first).rejects.toThrow("GOOGLE_SIGN_IN_CANCELLED");
    expect(sdk.signOut).toHaveBeenCalledOnce();
    expect(exchange).not.toHaveBeenCalled();
  });

  it("binds a 256-bit original nonce to its SHA256 hex digest", () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => i);
    const nonce = createGoogleNonce(bytes);
    expect(nonce.raw).toBe(Buffer.from(bytes).toString("hex"));
    expect(nonce.digest).toBe(createHash("sha256").update(nonce.raw).digest("hex"));
    expect(nonce.raw).not.toBe(nonce.digest);
    expect(() => createGoogleNonce(new Uint8Array(16))).toThrow("GOOGLE_NONCE_INVALID");
  });
  it("creates a separate nonce for each attempt and never reads it from a token", async () => {
    const { sdk, exchange } = setup();
    let sequence = 0;
    const nonces: ReturnType<typeof createGoogleNonce>[] = [];
    const adapter = createGoogleSignInAdapter(
      () => sdk,
      exchange,
      () => {
        const nonce = createGoogleNonce(new Uint8Array(32).fill(++sequence));
        nonces.push(nonce);
        return nonce;
      },
    );
    await adapter.verify({ provider: "google" }, new AbortController().signal);
    await adapter.verify({ provider: "google" }, new AbortController().signal);
    expect(nonces[0].raw).not.toBe(nonces[1].raw);
    expect(sdk.signIn.mock.calls).toEqual([[nonces[0].digest], [nonces[1].digest]]);
    expect(exchange.mock.calls.map((call) => call[0].nonce)).toEqual(
      nonces.map((n) => n.raw),
    );
  });

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
    const nonce = createGoogleNonce(new Uint8Array(32).fill(7));
    expect(sdk.signIn).toHaveBeenCalledWith(nonce.digest);
    expect(exchange).toHaveBeenCalledWith(
      { provider: "google", idToken: "google-token", nonce: nonce.raw },
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
