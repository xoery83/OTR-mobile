import type { SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { createMcpOAuthConsentRepository } from "./mcpOAuthConsentRepository";
const id = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
const other = "33333333-3333-4333-8333-333333333333";
const clientId = "22222222-2222-4222-8222-222222222222";
const redirectUri = "https://chatgpt.com/connector/oauth/unit-draft-fixture";
function fixture() {
  const config = {
    clientId,
    redirectUri,
    publishableKey: "sb_publishable_unit_fixture_no_live_credentials",
    accountIds: [id],
    expiresAt: Date.now() + 60000,
  };
  const details = {
    authorization_id: "unit-authorization",
    client: { id: clientId, name: "QA Read" },
    user: { id },
    scope: "openid",
    redirect_uri: redirectUri,
  };
  const oauth = {
    getAuthorizationDetails: vi.fn(async () => ({
      data: details as unknown,
      error: null,
    })),
    approveAuthorization: vi.fn(async () => ({
      data: { redirect_url: redirectUri + "?code=unit&state=unit" },
      error: null,
    })),
    denyAuthorization: vi.fn(async () => ({
      data: { redirect_url: redirectUri + "?error=access_denied&state=unit" },
      error: null,
    })),
  };
  const auth = {
    oauth,
    getUser: vi.fn(async () => ({
      data: { user: { id, is_anonymous: false } },
      error: null,
    })),
    signInWithOtp: vi.fn(async () => ({ error: null as null | { status: number } })),
    verifyOtp: vi.fn(async () => ({ error: null as null | { status: number } })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  const repo = createMcpOAuthConsentRepository(config, "unit-authorization", {
    auth,
  } as unknown as SupabaseClient);
  return { config, details, auth, oauth, repo };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("uses formal existing-user Email OTP, fresh identity and explicit provider consent", async () => {
  const q = fixture();
  await q.repo.requestCode("otr-qa-unit@example.invalid");
  expect(q.auth.signInWithOtp).toHaveBeenCalledWith({
    email: "otr-qa-unit@example.invalid",
    options: { shouldCreateUser: false },
  });
  expect(await q.repo.verifyCode("otr-qa-unit@example.invalid", "12345678")).toEqual({
    kind: "CONSENT",
    accountId: id,
    clientName: "QA Read",
  });
  expect(q.auth.verifyOtp).toHaveBeenCalledWith({
    email: "otr-qa-unit@example.invalid",
    token: "12345678",
    type: "email",
  });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
  expect(await q.repo.decide(true)).toEqual({
    kind: "REDIRECT",
    url: redirectUri + "?code=unit&state=unit",
  });
  expect(q.oauth.approveAuthorization).toHaveBeenCalledWith("unit-authorization", {
    skipBrowserRedirect: true,
  });
  expect(q.auth.getUser).toHaveBeenCalledTimes(2);
  await q.repo.close();
  expect(q.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  await expect(q.repo.load()).rejects.toMatchObject({ code: "CLOSED" });
});

it("can decline and never implicitly approve a prior-grant redirect", async () => {
  const q = fixture();
  expect(await q.repo.decide(false)).toMatchObject({ kind: "REDIRECT" });
  expect(q.oauth.denyAuthorization).toHaveBeenCalledWith("unit-authorization", {
    skipBrowserRedirect: true,
  });
  q.oauth.getAuthorizationDetails.mockResolvedValueOnce({
    data: { redirect_url: redirectUri + "?code=unit" },
    error: null,
  });
  expect(await q.repo.load()).toMatchObject({ kind: "REDIRECT" });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
});

it.each(["client", "redirect", "account", "scope", "authorization"])(
  "rejects changed %s before consent",
  async (mode) => {
    const q = fixture();
    const changes = {
      client: { client: { id: other, name: "Other" } },
      redirect: { redirect_uri: "https://other.invalid/callback" },
      account: { user: { id: other } },
      scope: { scope: "openid email" },
      authorization: { authorization_id: "other" },
    }[mode];
    q.oauth.getAuthorizationDetails.mockResolvedValueOnce({
      data: { ...q.details, ...changes },
      error: null,
    });
    await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
    expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
  },
);

it.each(["foreign", "anonymous"])(
  "refuses %s login before reading grants",
  async (mode) => {
    const q = fixture();
    q.auth.getUser.mockResolvedValueOnce({
      data: {
        user: { id: mode === "foreign" ? other : id, is_anonymous: mode === "anonymous" },
      },
      error: null,
    });
    await expect(q.repo.load()).rejects.toMatchObject({ code: "CLOSED" });
    expect(q.oauth.getAuthorizationDetails).not.toHaveBeenCalled();
  },
);

it.each([
  "https://other.invalid/?code=unit",
  redirectUri + "?access_token=unit",
  redirectUri + "?code=unit#token",
  redirectUri + "?code=one&code=two",
  redirectUri + "?code=unit&error=denied",
])("rejects unsafe provider redirect %s", async (url) => {
  const q = fixture();
  q.oauth.approveAuthorization.mockResolvedValueOnce({
    data: { redirect_url: url },
    error: null,
  });
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
});

it("keeps OTP/rate errors visible and refuses repeated concurrent requests", async () => {
  const q = fixture();
  q.auth.verifyOtp.mockResolvedValueOnce({ error: { status: 403 } });
  await expect(
    q.repo.verifyCode("unit@example.invalid", "12345678"),
  ).rejects.toMatchObject({ code: "OTP_FAILED" });
  q.auth.signInWithOtp.mockResolvedValueOnce({ error: { status: 429 } });
  await expect(q.repo.requestCode("unit@example.invalid")).rejects.toMatchObject({
    code: "RATE_LIMIT",
  });
  let release!: () => void;
  q.auth.signInWithOtp.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ error: null });
      }),
  );
  const pending = q.repo.requestCode("unit@example.invalid");
  await expect(q.repo.requestCode("unit@example.invalid")).rejects.toMatchObject({
    code: "BUSY",
  });
  release();
  await pending;
});

it("snapshots configuration and suppresses late/expired results", async () => {
  const q = fixture();
  q.config.accountIds[0] = other;
  expect(await q.repo.load()).toMatchObject({ accountId: id });
  q.auth.getUser.mockImplementationOnce(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(q.config.expiresAt);
    return { data: { user: { id, is_anonymous: false } }, error: null };
  });
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "CLOSED" });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
  await q.repo.close();
  expect(q.auth.signOut).toHaveBeenCalledOnce();
});

it("refuses secrets/configured redirect injection", () => {
  const q = fixture();
  for (const changed of [
    { publishableKey: "sb_secret_unit_not_a_public_key_123456" },
    { redirectUri: redirectUri + "?other=1" },
    { redirectUri: "http://chatgpt.com/callback" },
  ])
    expect(() =>
      createMcpOAuthConsentRepository({ ...q.config, ...changed }, "unit-authorization"),
    ).toThrow();
  expect(() => createMcpOAuthConsentRepository(q.config, "../other")).toThrow();
});

it("waits for in-flight OTP settlement before logout and suppresses its late result", async () => {
  const q = fixture();
  let installed = false,
    release!: () => void;
  q.auth.verifyOtp.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => {
          installed = true;
          resolve({ error: null });
        };
      }),
  );
  q.auth.signOut.mockImplementationOnce(async () => {
    expect(installed).toBe(true);
    installed = false;
    return { error: null };
  });
  const pending = q.repo.verifyCode("unit@example.invalid", "12345678");
  await vi.waitFor(() => expect(q.auth.verifyOtp).toHaveBeenCalledOnce());
  const closing = q.repo.close();
  expect(q.auth.signOut).not.toHaveBeenCalled();
  await expect(q.repo.load()).rejects.toMatchObject({ code: "CLOSED" });
  release();
  await expect(pending).rejects.toMatchObject({ code: "CLOSED" });
  await closing;
  await q.repo.close();
  expect(installed).toBe(false);
  expect(q.auth.signOut).toHaveBeenCalledOnce();
  expect(q.auth.getUser).not.toHaveBeenCalled();
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
});

it("does not start a queued OTP after close", async () => {
  const q = fixture();
  const pending = q.repo.requestCode("unit@example.invalid");
  const closed = q.repo.close();
  await expect(pending).rejects.toMatchObject({ code: "CLOSED" });
  await closed;
  expect(q.auth.signInWithOtp).not.toHaveBeenCalled();
});

it.each(["close", "expiry"])(
  "revokes a late successful verify through the actual SDK/fetch adapter on %s",
  async (mode) => {
    const q = fixture();
    // Local transport fixture only: no request leaves the mocked fetch.
    if (mode === "expiry") q.config.expiresAt = Date.now() + 1000;
    const segment = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = [
      segment({ alg: "ES256", typ: "JWT" }),
      segment({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }),
      segment("unit-signature-not-real"),
    ].join(".");
    let finish!: (response: Response) => void;
    const wire = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const target = new URL(String(input));
      if (target.pathname === "/auth/v1/verify")
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      expect(target.pathname).toBe("/auth/v1/logout");
      expect(target.searchParams.get("scope")).toBe("local");
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
      return new Response(null, { status: 204 });
    });
    const repo = createMcpOAuthConsentRepository(q.config, "unit-authorization");
    const pending = repo.verifyCode("unit@example.invalid", "12345678");
    await vi.waitFor(() => expect(wire).toHaveBeenCalledOnce());
    const closing = mode === "close" ? repo.close() : undefined;
    if (mode === "expiry") {
      vi.useFakeTimers();
      vi.setSystemTime(q.config.expiresAt);
    }
    finish(
      Response.json({
        access_token: token,
        refresh_token: "unit-refresh-not-real",
        token_type: "bearer",
        expires_in: 3600,
        user: { id, is_anonymous: false },
      }),
    );
    await expect(pending).rejects.toMatchObject({ code: "CLOSED" });
    await (closing ?? repo.close());
    expect(wire).toHaveBeenCalledTimes(2);
    expect(wire.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/auth/v1/verify",
      "/auth/v1/logout",
    ]);
  },
);
