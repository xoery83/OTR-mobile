import type { SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { createMcpOAuthConsentRepository } from "./mcpOAuthConsentRepository";
const id = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
const other = "33333333-3333-4333-8333-333333333333";
const clientId = "22222222-2222-4222-8222-222222222222";
const redirectUri = "https://chatgpt.com/connector/oauth/unit-draft-fixture";
function fixture(businessAccess?: "READ_WRITE", accountIds = [id]) {
  const config = {
    clientId,
    redirectUris: [redirectUri],
    qaEmail: "unit@example.invalid",
    publishableKey: "sb_publishable_unit_fixture_no_live_credentials",
    accountIds,
    expiresAt: Date.now() + 60000,
    ...(businessAccess ? { businessAccess } : {}),
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

it("Write requires a presented fresh decision and never reuses an authorized redirect", async () => {
  const q = fixture("READ_WRITE");
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
  expect(await q.repo.load()).toMatchObject({
    kind: "CONSENT",
    businessAccess: "READ_WRITE",
    accountId: id,
  });
  q.oauth.getAuthorizationDetails.mockResolvedValueOnce({
    data: { redirect_url: redirectUri + "?code=unit" },
    error: null,
  });
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
  await q.repo.close();
});

it("Write binds the shown Account and rechecks it before explicit approval", async () => {
  const q = fixture("READ_WRITE", [id, other]);
  await q.repo.requestCode("unit@example.invalid");
  expect(await q.repo.verifyCode("unit@example.invalid", "12345678")).toMatchObject({
    kind: "CONSENT",
    businessAccess: "READ_WRITE",
    accountId: id,
  });
  q.auth.getUser.mockResolvedValue({
    data: { user: { id: other, is_anonymous: false } },
    error: null,
  });
  q.oauth.getAuthorizationDetails.mockResolvedValue({
    data: { ...q.details, user: { id: other } },
    error: null,
  });
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
  await q.repo.close();
});

it("Write explicit approval uses the existing provider decision and normal cleanup", async () => {
  const q = fixture("READ_WRITE");
  await q.repo.load();
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
  expect(await q.repo.decide(true)).toEqual({
    kind: "REDIRECT",
    url: redirectUri + "?code=unit&state=unit",
  });
  expect(q.oauth.approveAuthorization).toHaveBeenCalledOnce();
  await q.repo.close();
  expect(q.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
});

it("uses formal existing-user Email OTP, fresh identity and explicit provider consent", async () => {
  const q = fixture();
  await q.repo.requestCode("unit@example.invalid");
  expect(q.auth.signInWithOtp).toHaveBeenCalledWith({
    email: "unit@example.invalid",
    options: { shouldCreateUser: false },
  });
  expect(await q.repo.verifyCode("unit@example.invalid", "12345678")).toEqual({
    kind: "CONSENT",
    accountId: id,
    clientName: "QA Read",
  });
  expect(q.auth.verifyOtp).toHaveBeenCalledWith({
    email: "unit@example.invalid",
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

it.each(["openid offline_access", "offline_access openid"])(
  "accepts only the read identity and refresh protocol scopes: %s",
  async (scope) => {
    const q = fixture();
    q.oauth.getAuthorizationDetails.mockResolvedValue({
      data: { ...q.details, scope },
      error: null,
    });
    await q.repo.decide(true);
    expect(q.oauth.approveAuthorization).toHaveBeenCalledOnce();
  },
);

it.each([
  "offline_access",
  "openid offline_access email",
  "openid offline_access offline_access",
  "openid profile",
])("refuses any expanded or duplicate provider scopes: %s", async (scope) => {
  const q = fixture();
  q.oauth.getAuthorizationDetails.mockResolvedValue({
    data: { ...q.details, scope },
    error: null,
  });
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
});

it.each([
  { scope: ["openid"] },
  { scope: ["openid offline_access"] },
  { scope: null },
  { scope: { value: "openid" } },
])("refuses non-string scope metadata: $scope", async ({ scope }) => {
  const q = fixture();
  q.oauth.getAuthorizationDetails.mockResolvedValueOnce({
    data: { ...q.details, scope: scope as unknown as string },
    error: null,
  });
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
});

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
    { redirectUris: [redirectUri + "?other=1"] },
    { redirectUris: ["http://chatgpt.com/callback"] },
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

it("permits the exact SDK loopback and pins the authorization's selected redirect", async () => {
  const q = fixture(),
    loopback = "http://127.0.0.1:18764/callback";
  const config = { ...q.config, redirectUris: [redirectUri, loopback] };
  const repo = createMcpOAuthConsentRepository(config, "unit-authorization", {
    auth: q.auth,
  } as unknown as SupabaseClient);
  expect(await repo.load()).toMatchObject({ kind: "CONSENT" });
  q.oauth.getAuthorizationDetails.mockResolvedValueOnce({
    data: { ...q.details, redirect_uri: loopback },
    error: null,
  });
  await expect(repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
  const second = fixture();
  second.oauth.getAuthorizationDetails.mockResolvedValue({
    data: { ...second.details, redirect_uri: loopback },
    error: null,
  });
  const sdk = createMcpOAuthConsentRepository(config, "unit-authorization", {
    auth: second.auth,
  } as unknown as SupabaseClient);
  expect(await sdk.load()).toMatchObject({ kind: "CONSENT" });
  second.oauth.approveAuthorization.mockResolvedValueOnce({
    data: { redirect_url: loopback + "?code=unit&state=unit" },
    error: null,
  });
  expect(await sdk.decide(true)).toEqual({
    kind: "REDIRECT",
    url: loopback + "?code=unit&state=unit",
  });
  for (const uri of [
    "http://localhost:18764/callback",
    "http://127.0.0.1:18765/callback",
    "http://127.0.0.1:18764/other",
  ])
    expect(() =>
      createMcpOAuthConsentRepository(
        { ...config, redirectUris: [uri] },
        "unit-authorization",
      ),
    ).toThrow();
});

it("does not send or verify OTP for a non-QA recipient", async () => {
  const q = fixture();
  await expect(q.repo.requestCode("other@example.invalid")).rejects.toMatchObject({
    code: "CLOSED",
  });
  await expect(
    q.repo.verifyCode("other@example.invalid", "12345678"),
  ).rejects.toMatchObject({ code: "CLOSED" });
  expect(q.auth.signInWithOtp).not.toHaveBeenCalled();
  expect(q.auth.verifyOtp).not.toHaveBeenCalled();
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

async function verifiedCloseFixture(mode = "rejected") {
  const q = fixture();
  const segment = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const access = [
    segment({ alg: "ES256", typ: "JWT" }),
    segment({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }),
    segment("unit-signature"),
  ].join(".");
  const newAccess = [
    segment({ alg: "ES256", typ: "JWT" }),
    segment({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }),
    segment("unit-new-signature"),
  ].join(".");
  let deliver!: (response: Response) => void;
  const paths: string[] = [];
  const wire = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const u = new URL(String(input));
    paths.push(u.pathname + u.search);
    expect(init?.credentials).toBe("omit");
    if (u.pathname === "/auth/v1/verify")
      return new Promise<Response>((resolve) => {
        deliver = resolve;
      });
    if (u.pathname === "/auth/v1/user") {
      if (mode === "identity-network") throw Error("identity read failed");
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${access}`);
      return Response.json({
        id: mode === "foreign" ? other : id,
        is_anonymous: false,
        email: q.config.qaEmail,
      });
    }
    if (u.pathname === "/auth/v1/logout") {
      expect(u.search).toBe("?scope=local");
      const afterRefresh = paths.some((path) =>
        path.includes("grant_type=refresh_token"),
      );
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${afterRefresh ? newAccess : access}`,
      );
      if (
        mode === "logout-unknown" ||
        (mode === "accepted-cleanup-unknown" && afterRefresh)
      )
        throw Error("logout response lost");
      return mode === "logout-failed"
        ? Response.json({ code: "bad_jwt" }, { status: 401 })
        : new Response(null, { status: 204 });
    }
    expect(u.pathname + u.search).toBe("/auth/v1/token?grant_type=refresh_token");
    expect(JSON.parse(String(init?.body))).toEqual({
      refresh_token: "unit-browser-refresh",
    });
    if (mode === "network") throw Error("network failed");
    if (mode === "local-closed") throw Error("CLOSED");
    if (mode.startsWith("accepted"))
      return Response.json({
        access_token: newAccess,
        refresh_token: "unit-new-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: { id, is_anonymous: false },
      });
    if (mode === "rate")
      return Response.json({ code: "over_request_rate_limit" }, { status: 429 });
    if (mode === "ambiguous") return Response.json({ code: "bad_jwt" }, { status: 401 });
    if (mode === "mixed")
      return Response.json(
        { code: "refresh_token_not_found", error_code: "bad_jwt" },
        { status: 400 },
      );
    return Response.json({ code: "refresh_token_not_found" }, { status: 400 });
  });
  const repo = createMcpOAuthConsentRepository(q.config, "unit-authorization");
  const pending = repo.verifyCode(q.config.qaEmail, "12345678");
  await vi.waitFor(() => expect(wire).toHaveBeenCalledOnce());
  const binding = {
    runId: "e81520d0-12fa-4374-97e1-5cae5ba899e1",
    accountId: id,
    requestedAt: new Date().toISOString(),
  };
  const closing = repo.closeVerified(binding);
  // Install the late successful Session only after close has fenced new work.
  deliver(
    Response.json({
      access_token: access,
      refresh_token: "unit-browser-refresh",
      token_type: "bearer",
      expires_in: 3600,
      user: { id, is_anonymous: false },
    }),
  );
  await expect(pending).rejects.toMatchObject({ code: "CLOSED" });
  return { repo, binding, closing, paths };
}

it("QA verified-close drains late verify and observes exact own logout plus actual server refresh rejection without exporting Session", async () => {
  const q = await verifiedCloseFixture();
  const result = await q.closing;
  expect(result).toEqual({
    kind: "BROWSER_LOCAL_CLEANUP_VERIFIED",
    binding: q.binding,
    localLogout: "COMPLETED",
    refresh: "SERVER_REJECTED",
    hostUnlockAuthorized: false,
  });
  expect(q.paths).toEqual([
    "/auth/v1/verify",
    "/auth/v1/user",
    "/auth/v1/logout?scope=local",
    "/auth/v1/token?grant_type=refresh_token",
  ]);
  expect(JSON.stringify(result)).not.toMatch(
    /access_token|refresh_token|unit-browser-refresh|12345678/,
  );
  expect(q.repo.closeVerified({ ...q.binding })).toBe(q.closing);
  await expect(
    q.repo.closeVerified({ ...q.binding, runId: "82ff9b61-a4fc-43dd-b5f1-8cdb83c667d1" }),
  ).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  await q.repo.close();
  await expect(q.repo.requestCode("unit@example.invalid")).rejects.toMatchObject({
    code: "CLOSED",
  });
  expect(q.paths).toHaveLength(4);
});

it.each([
  "network",
  "local-closed",
  "accepted",
  "rate",
  "ambiguous",
  "mixed",
  "logout-failed",
  "foreign",
  "identity-network",
  "logout-unknown",
  "accepted-cleanup-unknown",
])("QA verified-close cannot turn %s into a cleanup proof or retry it", async (mode) => {
  const q = await verifiedCloseFixture(mode);
  await expect(q.closing).rejects.toMatchObject({ code: "CLEANUP_UNPROVEN" });
  await expect(q.repo.closeVerified(q.binding)).rejects.toMatchObject({
    code: "CLEANUP_UNPROVEN",
  });
  await expect(q.repo.close()).rejects.toMatchObject({ code: "CLEANUP_UNPROVEN" });
  expect(
    q.paths.filter((path) => path.includes("grant_type=refresh_token")),
  ).toHaveLength(
    ["foreign", "identity-network", "logout-failed", "logout-unknown"].includes(mode)
      ? 0
      : 1,
  );
  expect(q.paths.filter((path) => path.startsWith("/auth/v1/logout"))).toHaveLength(
    mode.startsWith("accepted") ? 2 : 1,
  );
});

it("ordinary close does not gain a refresh probe and cannot later be upgraded to a verified receipt", async () => {
  const q = fixture();
  await q.repo.close();
  expect(q.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  expect(() =>
    q.repo.closeVerified({
      runId: "e81520d0-12fa-4374-97e1-5cae5ba899e1",
      accountId: id,
      requestedAt: new Date().toISOString(),
    }),
  ).toThrow("CLOSED");
  expect(q.auth.getUser).not.toHaveBeenCalled();
});

it("does not trust an injected SDK signOut success without observing the actual same-token logout response", async () => {
  const q = fixture();
  const getSession = vi.fn(async () => ({
    data: {
      session: {
        access_token: "unit-access",
        refresh_token: "unit-refresh",
        user: { id },
      },
    },
    error: null,
  }));
  const repo = createMcpOAuthConsentRepository(q.config, "unit-authorization", {
    auth: { ...q.auth, getSession },
  } as unknown as SupabaseClient);
  const wire = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      id,
      email: q.config.qaEmail,
      is_anonymous: false,
    }),
  );
  await expect(
    repo.closeVerified({
      runId: "e81520d0-12fa-4374-97e1-5cae5ba899e1",
      accountId: id,
      requestedAt: new Date().toISOString(),
    }),
  ).rejects.toMatchObject({ code: "CLEANUP_UNPROVEN" });
  expect(q.auth.signOut).toHaveBeenCalledOnce();
  expect(wire).toHaveBeenCalledOnce();
});

it("rejects foreign binding before closing or touching the owned Session", async () => {
  const q = fixture();
  await expect(
    q.repo.closeVerified({
      runId: "e81520d0-12fa-4374-97e1-5cae5ba899e1",
      accountId: other,
      requestedAt: new Date().toISOString(),
    }),
  ).rejects.toMatchObject({ code: "CLEANUP_UNPROVEN" });
  expect(q.auth.signOut).not.toHaveBeenCalled();
  await q.repo.close();
  expect(q.auth.signOut).toHaveBeenCalledOnce();
});

it("QA proof getSession failure still runs original own local cleanup once without a probe", async () => {
  const q = fixture();
  const repo = createMcpOAuthConsentRepository(q.config, "unit-authorization", {
    auth: {
      ...q.auth,
      getSession: vi.fn(async () => {
        throw Error("SDK read failed");
      }),
    },
  } as unknown as SupabaseClient);
  const failed = repo.closeVerified({
    runId: "e81520d0-12fa-4374-97e1-5cae5ba899e1",
    accountId: id,
    requestedAt: new Date().toISOString(),
  });
  await expect(failed).rejects.toMatchObject({ code: "CLEANUP_UNPROVEN" });
  expect(q.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  await expect(repo.close()).rejects.toMatchObject({ code: "CLEANUP_UNPROVEN" });
  expect(q.auth.signOut).toHaveBeenCalledOnce();
});
