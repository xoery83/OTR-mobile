import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAppleSignInAdapter } from "./appleSignIn";
import { createProvisionalSignIn } from "./provisionalSignIn";
import { advanceAccountGeneration } from "./accountGeneration";
import { SupabaseDevAuthError } from "./devSupabaseAuth";

function setup() {
  const sdk = {
    isAvailableAsync: vi.fn(async () => true),
    AppleAuthenticationScope: { EMAIL: 0, FULL_NAME: 1 },
    signInAsync: vi.fn(async () => ({
      identityToken: "synthetic-apple-token",
      fullName: null,
    })),
  };
  const session = {
    accessToken: "synthetic-access",
    refreshToken: "synthetic-refresh",
    expiresAt: null,
    identity: {
      userId: "account-a",
      email: "qa@privaterelay.appleid.com",
      displayName: "",
    },
  };
  const exchange = vi.fn(async () => session);
  const saveName = vi.fn(async () => {});
  const raw = "07".repeat(32);
  const nonce = { raw, digest: createHash("sha256").update(raw).digest("hex") };
  const adapter = createAppleSignInAdapter(
    () => sdk as never,
    exchange,
    () => nonce,
    saveName,
  );
  return { sdk, session, exchange, saveName, adapter, nonce };
}

describe("native Apple provisional sign-in", () => {
  it("sends the nonce digest to Apple and the original nonce to Supabase", async () => {
    const s = setup();
    const signal = new AbortController().signal;
    expect(await s.adapter.verify({ provider: "apple" }, signal)).toEqual(s.session);
    expect(s.sdk.signInAsync).toHaveBeenCalledWith({
      requestedScopes: [0, 1],
      nonce: s.nonce.digest,
    });
    expect(s.exchange).toHaveBeenCalledWith(
      { provider: "apple", idToken: "synthetic-apple-token", nonce: s.nonce.raw },
      { signal },
    );
    expect(s.saveName).not.toHaveBeenCalled();
  });
  it("saves optional first name separately and preserves the server's relay email and Account", async () => {
    const s = setup();
    const fullName = { familyName: "王", givenName: "小明" };
    s.sdk.signInAsync.mockResolvedValueOnce({
      identityToken: "synthetic-apple-token",
      fullName,
    } as never);
    expect(
      await s.adapter.verify({ provider: "apple" }, new AbortController().signal),
    ).toEqual(s.session);
    expect(s.saveName).toHaveBeenCalledWith(s.session, fullName, {
      signal: expect.any(AbortSignal),
    });
  });
  it("reports native cancellation without exchanging a token", async () => {
    const s = setup();
    s.sdk.signInAsync.mockRejectedValueOnce({ code: "ERR_REQUEST_CANCELED" });
    await expect(
      s.adapter.verify({ provider: "apple" }, new AbortController().signal),
    ).rejects.toThrow("APPLE_SIGN_IN_CANCELLED");
    expect(s.exchange).not.toHaveBeenCalled();
  });
  it("retains the first-name suggestion for secure Session installation if metadata saving fails", async () => {
    const s = setup();
    s.sdk.signInAsync.mockResolvedValueOnce({
      identityToken: "synthetic-apple-token",
      fullName: { givenName: "小明" },
    } as never);
    s.saveName.mockRejectedValueOnce(
      new SupabaseDevAuthError("temporary network failure", "network"),
    );
    const session = await s.adapter.verify(
      { provider: "apple" },
      new AbortController().signal,
    );
    expect(session.identity?.appleFirstSignInName).toMatchObject({ givenName: "小明" });
    expect(session.identity?.displayName).toBe("");
  });
  it("rejects missing tokens and redacts native errors", async () => {
    const s = setup();
    s.sdk.signInAsync.mockResolvedValueOnce({
      identityToken: null,
      fullName: null,
    } as never);
    await expect(
      s.adapter.verify({ provider: "apple" }, new AbortController().signal),
    ).rejects.toThrow("APPLE_SIGN_IN_FAILED");
    s.sdk.signInAsync.mockRejectedValueOnce(new Error("sensitive native diagnostic"));
    await expect(
      s.adapter.verify({ provider: "apple" }, new AbortController().signal),
    ).rejects.toThrow("APPLE_SIGN_IN_FAILED");
    expect(s.exchange).not.toHaveBeenCalled();
  });
  it("fences a late Apple response after cancellation", async () => {
    const s = setup();
    const controller = new AbortController();
    s.sdk.signInAsync.mockImplementationOnce(async () => {
      controller.abort();
      return { identityToken: "late-token", fullName: null };
    });
    await expect(
      s.adapter.verify({ provider: "apple" }, controller.signal),
    ).rejects.toThrow("APPLE_SIGN_IN_CANCELLED");
    expect(s.exchange).not.toHaveBeenCalled();
  });
  it("keeps a late Account-switch result out of Session installation and Adoption", async () => {
    const s = setup();
    s.exchange.mockImplementationOnce(async () => {
      advanceAccountGeneration();
      return s.session;
    });
    expect(
      await createProvisionalSignIn({ apple: s.adapter }).verify({ provider: "apple" }),
    ).toEqual({ status: "CANCELLED" });
    expect(s.saveName).not.toHaveBeenCalled();
  });
  it("keeps old binaries unavailable", async () => {
    expect(await createAppleSignInAdapter(() => null).capability()).toEqual({
      available: false,
      reason: "NATIVE_MODULE_MISSING",
    });
  });
});
