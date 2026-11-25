import type { SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import {
  createMcpOAuthConsentRepository,
  mcpBetaConsentConfigSchema,
} from "./mcpOAuthConsentRepository";
const id = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
const other = "33333333-3333-4333-8333-333333333333";
const clientId = "22222222-2222-4222-8222-222222222222";
const redirectUri = "https://chatgpt.com/connector/oauth/unit-draft-fixture";
function fixture(businessAccess?: "READ_WRITE", accountIds = [id], beta = false) {
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
  const selected = beta
    ? {
        authOrigin: "https://isolated.example.invalid/",
        publishableKey:
          Buffer.from("synthetic-public-header").toString("base64url") +
          "." +
          Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url") +
          ".synthetic-unverifiable-api-key",
        expiresAt: config.expiresAt,
        businessAccess: "BETA_READ_WRITE" as const,
      }
    : config;
  const repo = createMcpOAuthConsentRepository(selected, "unit-authorization", {
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
      scope: { scope: "openid otr.trips.read" },
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

it.each(["openid email", "openid offline_access", "offline_access openid email", "openid email offline_access"])(
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
  "openid otr.trips.write",
  "email offline_access",
  "openid email email",
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

it("isolated Beta uses normal current Accounts without QA identity lists and requires its presented full scope", async () => {
  const q = fixture(undefined, [id], true);
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  q.auth.getUser.mockResolvedValue({
    data: { user: { id: other, is_anonymous: false } },
    error: null,
  });
  q.oauth.getAuthorizationDetails.mockResolvedValue({
    data: { ...q.details, user: { id: other } },
    error: null,
  });
  await q.repo.requestCode("another-normal@example.invalid");
  expect(await q.repo.load()).toMatchObject({
    kind: "CONSENT",
    businessAccess: "BETA_READ_WRITE",
    accountId: other,
  });
  expect(await q.repo.decide(true)).toMatchObject({ kind: "REDIRECT" });
  await q.repo.close();
});
it("isolated Beta rejects changed OAuth client, callbacks and anonymous users before provider approval", async () => {
  const q = fixture(undefined, [id], true);
  await q.repo.load();
  q.oauth.getAuthorizationDetails.mockResolvedValue({
    data: { ...q.details, client: { id: other, name: "changed" } },
    error: null,
  });
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
  await q.repo.close();
  const r = fixture(undefined, [id], true);
  r.oauth.getAuthorizationDetails.mockResolvedValue({
    data: { ...r.details, redirect_uri: "https://foreign.invalid/callback?injected=yes" },
    error: null,
  });
  await expect(r.repo.load()).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  await r.repo.close();
  const anonymous = fixture(undefined, [id], true);
  anonymous.auth.getUser.mockResolvedValue({
    data: { user: { id, is_anonymous: true } },
    error: null,
  });
  await expect(anonymous.repo.load()).rejects.toMatchObject({ code: "CLOSED" });
  await anonymous.repo.close();
});
it("isolated Beta configuration rejects shared Supabase origins, insecure URLs and service-role keys", () => {
  const key =
    Buffer.from("header").toString("base64url") +
    "." +
    Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url") +
    ".invalid-signature";
  for (const authOrigin of [
    "http://foreign.invalid/",
    "https://tuqigdxrvrerfewsxqgm.supabase.co/",
    "https://user:password@isolated.invalid/",
  ])
    expect(
      mcpBetaConsentConfigSchema.safeParse({
        authOrigin,
        publishableKey: key,
        expiresAt: Date.now() + 60000,
        businessAccess: "BETA_READ_WRITE",
      }).success,
    ).toBe(false);
  expect(
    mcpBetaConsentConfigSchema.safeParse({
      authOrigin: "https://isolated.invalid/",
      publishableKey: key,
      expiresAt: Date.now() + 60000,
      businessAccess: "BETA_READ_WRITE",
    }).success,
  ).toBe(false);
});

it.each(["load", "after-presentation"])(
  "isolated Beta keeps redirect-only repeated consent closed at %s",
  async (phase) => {
    const q = fixture(undefined, [id], true);
    if (phase === "after-presentation") await q.repo.load();
    q.oauth.getAuthorizationDetails.mockResolvedValue({
      data: { redirect_url: redirectUri + "?code=prior-grant&state=unit" },
      error: null,
    });
    await expect(
      phase === "load" ? q.repo.load() : q.repo.decide(true),
    ).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
    expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
    expect(q.oauth.denyAuthorization).not.toHaveBeenCalled();
    await q.repo.close();
    expect(q.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  },
);

it.each([true, false])("validates the pinned callback for a reused Managed OAuth grant (%s)", async (matches) => {
  const q = fixture();
  const url = (matches ? redirectUri : "https://chatgpt.com/connector/oauth/another-client") + "?code=unit&state=unit";
  q.oauth.getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: url }, error: null });
  const repo = createMcpOAuthConsentRepository({
    authOrigin: "https://tuqigdxrvrerfewsxqgm.supabase.co/",
    publishableKey: "sb_publishable_unit_fixture_no_live_credentials",
    expiresAt: Date.now() + 60_000,
    businessAccess: "BETA_READ_WRITE",
    managedNativeOAuth: true,
    managedDev: { accountId: id, clientId, redirectUri },
    consentPolicy: {
      contractVersion: 1, identityScopes: ["openid"], policyHash: "a".repeat(64),
      policy: { id: "unit", version: "1", resource: "https://api-dev.xoery.art/mcp",
        permissions: ["otr.trip.get"], business_scopes: ["otr.trips.read", "otr.trips.write"],
        allow_reuse: false, grant_ttl_seconds: 600 },
    },
  }, "unit-authorization", { auth: q.auth } as unknown as SupabaseClient);
  if (matches) await expect(repo.load()).resolves.toEqual({ kind: "REDIRECT", url });
  else await expect(repo.load()).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  expect(q.oauth.approveAuthorization).not.toHaveBeenCalled();
  await repo.close();
});

it.each([
  { state: "APPROVED", allow: true, lost: false },
  { state: "APPROVED", allow: true, lost: true },
  { state: "DENIED", allow: false, lost: true },
  { state: "PENDING", allow: true, lost: false },
  { state: "PENDING", allow: true, lost: true },
])("reads the same Managed decision after failure ($state, lost=$lost)", async ({ state, allow, lost }) => {
  const q = fixture();
  const auth = { ...q.auth, getSession: vi.fn(async () => ({ data: { session: { access_token: "synthetic-first-party" } }, error: null })) };
  const challengeId = "55555555-5555-4555-8555-555555555555";
  const policyHash = "a".repeat(64);
  const challenge = { id: challengeId, accountId: id, state: "PENDING", policy: { policyId: "unit", policyVersion: "1", policyHash } };
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({}, { status: 403 }))
    .mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(Response.json(challenge))
    .mockImplementationOnce(async () => {
      if (lost) throw new TypeError("Transport closed");
      return Response.json({}, { status: 403 });
    })
    .mockResolvedValueOnce(Response.json({ ...challenge, state }));
  const repo = createMcpOAuthConsentRepository({
    authOrigin: "https://tuqigdxrvrerfewsxqgm.supabase.co/",
    publishableKey: "sb_publishable_unit_fixture_no_live_credentials",
    expiresAt: Date.now() + 60_000,
    businessAccess: "BETA_READ_WRITE",
    managedNativeOAuth: true,
    managedDev: { accountId: id, clientId, redirectUri },
    consentPolicy: {
      contractVersion: 1, identityScopes: ["openid"], policyHash,
      policy: { id: "unit", version: "1", resource: "https://api-dev.xoery.art/mcp",
        permissions: ["otr.trip.get"], business_scopes: ["otr.trips.read", "otr.trips.write"],
        allow_reuse: false, grant_ttl_seconds: 600 },
    },
  }, challengeId, { auth } as unknown as SupabaseClient, request, true);
  await expect(repo.verifyCode("unit@example.invalid", "12345678"))
    .rejects.toMatchObject({ code: "UNAVAILABLE" });
  await expect(repo.verifyCode("unit@example.invalid", "12345678"))
    .resolves.toMatchObject({ kind: "CONSENT" });
  expect(q.auth.verifyOtp).toHaveBeenCalledOnce();
  if (state !== "PENDING") await expect(repo.decide(allow)).resolves.toEqual({ kind: "DECIDED", decision: state });
  else await expect(repo.decide(allow)).rejects.toMatchObject({ code: "DECISION_UNKNOWN" });
  expect(request.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).action)).toEqual(["inspect", "inspect", "inspect", "decide", "inspect"]);
  if (state === "PENDING") {
    request.mockResolvedValueOnce(Response.json({ ...challenge, state: "PENDING" }));
    await expect(repo.decide(false)).rejects.toMatchObject({ code: "DECISION_UNKNOWN" });
    request.mockResolvedValueOnce(Response.json({}));
    await expect(repo.load()).rejects.toMatchObject({ code: "DECISION_UNKNOWN" });
    request.mockRejectedValueOnce(new TypeError("Network unavailable"));
    await expect(repo.load()).rejects.toMatchObject({ code: "DECISION_UNKNOWN" });
    request.mockResolvedValueOnce(Response.json({ ...challenge, state: "APPROVED" }));
    await expect(repo.load()).resolves.toEqual({ kind: "DECIDED", decision: "APPROVED" });
    expect(request.mock.calls.filter(([, init]) => JSON.parse(String(init?.body)).action === "decide")).toHaveLength(1);
    expect(request.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).id === challengeId)).toBe(true);
    expect(q.auth.verifyOtp).toHaveBeenCalledOnce();
  }
  await repo.close();
});
