import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createMcpOAuthConsentRepository } from "./mcpOAuthConsentRepository";
import {
  mcpConsentDetailsSchema,
  type McpConsentPolicyPin,
} from "./mcpOAuthConsentContract";

const actor = "11111111-1111-4111-8111-111111111111";
const client = "22222222-2222-4222-8222-222222222222";
const callback = "https://chatgpt.com/connector/oauth/unit";
const origin = "https://isolated.invalid";
const publicKey =
  Buffer.from("{}").toString("base64url") +
  "." +
  Buffer.from('{"role":"anon"}').toString("base64url") +
  ".synthetic-public-api-key";
const pin: McpConsentPolicyPin = {
  contractVersion: 1,
  policy: {
    id: "otr.beta",
    version: "unit-risk1.1",
    resource: origin + "/mcp",
    permissions: ["otr.trip.get", "otr.trip.update"],
    business_scopes: ["otr.trips.read", "otr.trips.write"],
    allow_reuse: true,
    grant_ttl_seconds: 3600,
  },
  policyHash: "a".repeat(64),
  identityScopes: ["openid", "offline_access"],
};
function fixture(browserProviders?: ("google" | "apple")[]) {
  const details = {
    contract_version: 1,
    authorization_id: "unit-authorization",
    redirect_uri: callback,
    client: { id: client, name: "Unit Beta Client" },
    user: { id: actor },
    resource: pin.policy.resource,
    scope: "openid offline_access",
    policy: structuredClone(pin.policy),
    policy_hash: pin.policyHash,
    expires_at: new Date(Date.now() + 60000).toISOString(),
    consent: {
      decision: "REQUIRED",
      decision_id: randomUUID(),
      policy_version: pin.policy.version,
      basis: "EXPLICIT_CONSENT_REQUIRED",
    },
  };
  const auth = {
    oauth: {
      getAuthorizationDetails: vi.fn(async () => ({
        data: details as unknown,
        error: null,
      })),
      approveAuthorization: vi.fn(),
      denyAuthorization: vi.fn(),
    },
    getUser: vi.fn(async () => ({
      data: { user: { id: actor, is_anonymous: false } },
      error: null,
    })),
    getSession: vi.fn(async () => ({
      data: { session: { access_token: "synthetic.memory.session" } },
      error: null,
    })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    signInWithOAuth: vi.fn(async () => ({
      data: {
        url:
          origin +
          "/auth/v1/authorize?" +
          new URLSearchParams({
            provider: "google",
            redirect_to: origin + "/oauth/consent/provider-callback",
            code_challenge_method: "s256",
            code_challenge: "a".repeat(43),
          }),
        flowId: "original-memory-flow",
      },
      error: null,
    })),
    exchangeCodeForSession: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ redirect_url: callback + "?code=unit&state=unit" }),
  );
  const config = {
    authOrigin: origin + "/",
    publishableKey: publicKey,
    expiresAt: Date.now() + 60000,
    businessAccess: "BETA_READ_WRITE" as const,
    consentPolicy: structuredClone(pin),
    ...(browserProviders ? { browserProviders } : {}),
  };
  const repo = createMcpOAuthConsentRepository(
    config,
    "unit-authorization",
    { auth } as unknown as SupabaseClient,
    request,
  );
  return { details, auth, request, repo, config };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([true, false])(
  "uses only the opaque ID and first-party SDK session for Managed decision %s",
  async (allow) => {
    const q = fixture(),
      id = randomUUID();
    const managedResource = "https://api-dev.xoery.art/mcp";
    const repo = createMcpOAuthConsentRepository(
      {
        ...q.config,
        authOrigin: "https://tuqigdxrvrerfewsxqgm.supabase.co/",
        publishableKey: "sb_publishable_synthetic_managed_dev_test_only",
        managedNativeOAuth: true as const,
        managedDev: { accountId: actor, clientId: client, redirectUri: callback },
        consentPolicy: { ...pin, policy: { ...pin.policy, resource: managedResource } },
      },
      id,
      { auth: q.auth } as unknown as SupabaseClient,
      q.request,
      true,
    );
    await expect(repo.decide(allow)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
    q.request.mockResolvedValueOnce(
      Response.json({
        id,
        accountId: actor,
        state: "PENDING",
        policy: {
          policyId: pin.policy.id,
          policyVersion: pin.policy.version,
          policyHash: pin.policyHash,
        },
      }),
    );
    expect(await repo.load()).toMatchObject({
      kind: "CONSENT",
      businessAccess: "MANAGED_READ",
    });
    const decision = allow ? "APPROVED" : "DENIED";
    q.request.mockResolvedValueOnce(Response.json({ id, decision }));
    expect(await repo.decide(allow)).toEqual({ kind: "DECIDED", decision });
    expect(q.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled();
    expect(q.auth.oauth.approveAuthorization).not.toHaveBeenCalled();
    expect(
      q.request.mock.calls.map(([url, init]) => [
        String(url),
        JSON.parse(String(init?.body)),
        new Headers(init?.headers).get("authorization"),
      ]),
    ).toEqual([
      [
        "https://api-dev.xoery.art/oauth/consent",
        { action: "inspect", id },
        "Bearer synthetic.memory.session",
      ],
      [
        "https://api-dev.xoery.art/oauth/consent",
        { action: "decide", id, allow },
        "Bearer synthetic.memory.session",
      ],
    ]);
    await expect(repo.decide(allow)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  },
);

it.each([true, false])(
  "posts the displayed issuer decision once for allow=%s without a second code-issuing details GET",
  async (allow) => {
    const q = fixture();
    expect(await q.repo.load()).toMatchObject({
      kind: "CONSENT",
      accountId: actor,
      businessAccess: "BETA_READ_WRITE",
    });
    q.request.mockResolvedValueOnce(
      Response.json({
        redirect_url:
          callback +
          (allow ? "?code=unit&state=unit" : "?error=access_denied&state=unit"),
      }),
    );
    expect(await q.repo.decide(allow)).toMatchObject({ kind: "REDIRECT" });
    expect(q.auth.oauth.getAuthorizationDetails).toHaveBeenCalledOnce();
    expect(q.request).toHaveBeenCalledOnce();
    const [url, init] = q.request.mock.calls[0];
    expect(url).toBe(origin + "/auth/v1/oauth/authorizations/unit-authorization/consent");
    expect(JSON.parse(String(init?.body))).toEqual({
      action: allow ? "approve" : "deny",
      decision_id: q.details.consent.decision_id,
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("X-OTR-Consent-Version")).toBe("1");
    expect(headers.get("Authorization")).toBe("Bearer synthetic.memory.session");
    expect(init).toMatchObject({ redirect: "error", credentials: "omit" });
    await expect(q.repo.decide(allow)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
    expect(q.auth.oauth.approveAuthorization).not.toHaveBeenCalled();
    expect(q.auth.oauth.denyAuthorization).not.toHaveBeenCalled();
    await q.repo.close();
    expect(q.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  },
);

it("accepts policy-qualified full-context reuse after OTP, with no approval POST", async () => {
  const q = fixture();
  q.auth.oauth.getAuthorizationDetails.mockResolvedValueOnce({
    data: {
      ...q.details,
      consent: {
        ...q.details.consent,
        decision: "SATISFIED",
        basis: "CURRENT_POLICY_GRANT",
        grant_id: randomUUID(),
      },
      redirect_url: callback + "?code=unit&state=unit",
    },
    error: null,
  });
  expect(await q.repo.verifyCode("unit@example.invalid", "12345678")).toEqual({
    kind: "REDIRECT",
    url: callback + "?code=unit&state=unit",
  });
  expect(q.request).not.toHaveBeenCalled();
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  await q.repo.close();
});

it.each([
  "version",
  "account",
  "resource",
  "policyHash",
  "policyPermissions",
  "policyVersion",
  "scope",
  "expiry",
  "requiredRedirect",
  "requiredGrant",
  "redirectOnly",
  "reuseMissingGrant",
  "reuseWrongCallback",
])("fails closed on %s before presenting or posting", async (change) => {
  const q = fixture();
  let d: Record<string, unknown> = structuredClone(q.details);
  switch (change) {
    case "version":
      d.contract_version = 2;
      break;
    case "account":
      d.user = { id: randomUUID() };
      break;
    case "resource":
      d.resource = "https://other.invalid/mcp";
      break;
    case "policyHash":
      d.policy_hash = "b".repeat(64);
      break;
    case "policyPermissions":
      d.policy = { ...q.details.policy, permissions: ["otr.trip.delete"] };
      break;
    case "policyVersion":
      d.consent = { ...q.details.consent, policy_version: "other" };
      break;
    case "scope":
      d.scope = "openid profile";
      break;
    case "expiry":
      d.expires_at = new Date(Date.now() - 1000).toISOString();
      break;
    case "requiredRedirect":
      d.redirect_url = callback + "?code=unit";
      break;
    case "requiredGrant":
      d.consent = { ...q.details.consent, grant_id: randomUUID() };
      break;
    case "redirectOnly":
      d = { redirect_url: callback + "?code=unit" };
      break;
    case "reuseMissingGrant":
      d.consent = {
        ...q.details.consent,
        decision: "SATISFIED",
        basis: "CURRENT_POLICY_GRANT",
      };
      d.redirect_url = callback + "?code=unit";
      break;
    case "reuseWrongCallback":
      d.consent = {
        ...q.details.consent,
        decision: "SATISFIED",
        basis: "CURRENT_POLICY_GRANT",
        grant_id: randomUUID(),
      };
      d.redirect_url = "https://other.invalid/cb?code=unit";
      break;
  }
  q.auth.oauth.getAuthorizationDetails.mockResolvedValueOnce({ data: d, error: null });
  await expect(q.repo.load()).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  expect(q.request).not.toHaveBeenCalled();
  await q.repo.close();
});

it("rejects an account switch and expired displayed context without posting", async () => {
  const q = fixture();
  await q.repo.load();
  q.auth.getUser.mockResolvedValueOnce({
    data: { user: { id: randomUUID(), is_anonymous: false } },
    error: null,
  });
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 61000);
  await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "CLOSED" });
  expect(q.request).not.toHaveBeenCalled();
  await q.repo.close();
});

it("does not retry a stale server decision or an uncertain transport response", async () => {
  for (const failure of [
    new Response(null, { status: 409 }),
    new Response(null, { status: 503 }),
  ]) {
    const q = fixture();
    await q.repo.load();
    q.request.mockResolvedValueOnce(failure);
    await expect(q.repo.decide(true)).rejects.toMatchObject({
      code: failure.status === 409 ? "REQUEST_CHANGED" : "UNAVAILABLE",
    });
    await expect(q.repo.decide(true)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
    expect(q.request).toHaveBeenCalledOnce();
    await q.repo.close();
  }
});

it("strictly qualifies the new full-context wire and trusted resource pin", () => {
  const q = fixture();
  expect(mcpConsentDetailsSchema.safeParse(q.details).success).toBe(true);
  expect(() =>
    createMcpOAuthConsentRepository(
      {
        ...q.config,
        consentPolicy: {
          ...pin,
          policy: { ...pin.policy, resource: "https://other.invalid/mcp" },
        },
      },
      "unit-authorization",
    ),
  ).toThrow();
});

it("uses the existing real SDK memory session and adds version1 to the actual details/decision transport", async () => {
  const q = fixture();
  const payload = {
    sub: actor,
    aud: "authenticated",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  const token =
    Buffer.from('{"alg":"HS256"}').toString("base64url") +
    "." +
    Buffer.from(JSON.stringify(payload)).toString("base64url") +
    ".synthetic";
  const user = {
    id: actor,
    is_anonymous: false,
    aud: "authenticated",
    role: "authenticated",
    email: "unit@example.invalid",
    created_at: new Date().toISOString(),
  };
  const request = vi.fn<typeof fetch>(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/verify"))
      return Response.json({
        access_token: token,
        refresh_token: "synthetic-refresh",
        token_type: "bearer",
        expires_in: 60,
        user,
      });
    if (path.endsWith("/user")) return Response.json(user);
    if (path.endsWith("/consent"))
      return Response.json({ redirect_url: callback + "?code=unit&state=unit" });
    if (path.endsWith("/logout")) return new Response(null, { status: 204 });
    return Response.json(q.details);
  });
  const repo = createMcpOAuthConsentRepository(
    q.config,
    "unit-authorization",
    undefined,
    request,
  );
  expect(await repo.verifyCode("unit@example.invalid", "12345678")).toMatchObject({
    kind: "CONSENT",
  });
  expect(await repo.decide(true)).toMatchObject({ kind: "REDIRECT" });
  const versioned = request.mock.calls.filter(([url]) =>
    String(url).includes("/oauth/authorizations/"),
  );
  expect(versioned).toHaveLength(2);
  for (const [, init] of versioned)
    expect(new Headers(init?.headers).get("X-OTR-Consent-Version")).toBe("1");
  await repo.close();
});

it("expires the displayed authorization before the longer browser configuration deadline", async () => {
  const q = fixture();
  q.details.expires_at = new Date(Date.now() + 1000).toISOString();
  await q.repo.load();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 2000);
  await expect(q.repo.decide(false)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  expect(q.request).not.toHaveBeenCalled();
  await q.repo.close();
});

it("rejects a success code for Deny, an error for Approve, and an invalid reuse redirect", async () => {
  for (const allow of [true, false]) {
    const q = fixture();
    await q.repo.load();
    q.request.mockResolvedValueOnce(
      Response.json({
        redirect_url: callback + (allow ? "?error=access_denied" : "?code=unit"),
      }),
    );
    await expect(q.repo.decide(allow)).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
    await q.repo.close();
  }
  const q = fixture();
  q.auth.oauth.getAuthorizationDetails.mockResolvedValueOnce({
    data: {
      ...q.details,
      consent: {
        ...q.details.consent,
        decision: "SATISFIED",
        basis: "CURRENT_POLICY_GRANT",
        grant_id: randomUUID(),
      },
      redirect_url: callback + "?error=access_denied",
    },
    error: null,
  });
  await expect(q.repo.load()).rejects.toMatchObject({ code: "REQUEST_CHANGED" });
  await q.repo.close();
});

it("exchanges only the original memory PKCE flow, then uses the fresh owning account and v1 consent", async () => {
  const q = fixture(["google", "apple"]);
  const popup = { receive: vi.fn(async () => "one-use-auth-code"), close: vi.fn() };
  expect(await q.repo.signInProvider("google", popup)).toMatchObject({
    kind: "CONSENT",
    accountId: actor,
  });
  expect(q.auth.signInWithOAuth).toHaveBeenCalledWith({
    provider: "google",
    options: {
      redirectTo: origin + "/oauth/consent/provider-callback",
      skipBrowserRedirect: true,
    },
  });
  expect(q.auth.exchangeCodeForSession).toHaveBeenCalledWith("one-use-auth-code", {
    flowId: "original-memory-flow",
  });
  expect(q.auth.getUser).toHaveBeenCalledOnce();
  expect(popup.close).toHaveBeenCalledOnce();
  expect(q.auth.oauth.approveAuthorization).not.toHaveBeenCalled();
  await q.repo.close();
});
it("keeps providers default closed and closes even an unused popup", async () => {
  const q = fixture();
  const popup = { receive: vi.fn(), close: vi.fn() };
  await expect(q.repo.signInProvider("google", popup)).rejects.toMatchObject({
    code: "CLOSED",
  });
  expect(q.auth.signInWithOAuth).not.toHaveBeenCalled();
  expect(popup.close).toHaveBeenCalledOnce();
  await q.repo.close();
});
it.each([
  "origin",
  "return",
  "plain",
  "missingFlow",
  "duplicateProvider",
  "implicitToken",
])(
  "rejects changed provider handoff %s before popup navigation/exchange",
  async (kind) => {
    const q = fixture(["google"]);
    const data = (await q.auth.signInWithOAuth()).data;
    const u = new URL(data.url);
    if (kind === "origin") u.hostname = "other.invalid";
    if (kind === "return") u.searchParams.set("redirect_to", origin + "/other");
    if (kind === "plain") u.searchParams.set("code_challenge_method", "plain");
    if (kind === "duplicateProvider") u.searchParams.append("provider", "apple");
    if (kind === "implicitToken") u.hash = "access_token=not-permitted";
    q.auth.signInWithOAuth.mockResolvedValueOnce({
      data: { url: u.href, flowId: kind === "missingFlow" ? "" : data.flowId },
      error: null,
    });
    const popup = { receive: vi.fn(), close: vi.fn() };
    await expect(q.repo.signInProvider("google", popup)).rejects.toBeDefined();
    expect(popup.receive).not.toHaveBeenCalled();
    expect(q.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    await q.repo.close();
  },
);
it("closing a pending popup aborts before exchange and cleans up the same memory session", async () => {
  const q = fixture(["google"]);
  const popup = {
    receive: vi.fn(
      (_url: string, signal: AbortSignal) =>
        new Promise<string>((_ok, no) =>
          signal.addEventListener("abort", () => no(Error("cancelled")), { once: true }),
        ),
    ),
    close: vi.fn(),
  };
  const login = q.repo.signInProvider("google", popup);
  const rejected = expect(login).rejects.toMatchObject({ code: "CLOSED" });
  await vi.waitFor(() => expect(popup.receive).toHaveBeenCalledOnce());
  const other = { receive: vi.fn(), close: vi.fn() };
  await expect(q.repo.signInProvider("google", other)).rejects.toMatchObject({
    code: "BUSY",
  });
  await q.repo.close();
  await rejected;
  expect(q.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(q.auth.signOut).toHaveBeenCalledOnce();
});
it("does not treat provider or exchange failure as a signed-in consent", async () => {
  const q = fixture(["google"]);
  q.auth.exchangeCodeForSession.mockResolvedValueOnce({
    error: { message: "explicit linking required" },
  } as never);
  const popup = { receive: vi.fn(async () => "one-code"), close: vi.fn() };
  await expect(q.repo.signInProvider("google", popup)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(q.auth.getUser).not.toHaveBeenCalled();
  expect(q.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled();
  await q.repo.close();
});

it.each(["google", "apple"] as const)(
  "uses the installed memory-only PKCE SDK for %s and normal v1 details (synthetic transport only)",
  async (provider) => {
    const q = fixture([provider]);
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const token = [
      Buffer.from('{"alg":"HS256"}').toString("base64url"),
      Buffer.from(
        JSON.stringify({
          sub: actor,
          exp: Math.floor(Date.now() / 1000) + 600,
          session_id: randomUUID(),
        }),
      ).toString("base64url"),
      "synthetic",
    ].join(".");
    const request = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ path, body });
      if (path.endsWith("/token"))
        return Response.json({
          access_token: token,
          refresh_token: "synthetic-memory-only",
          expires_in: 600,
          token_type: "bearer",
          user: { id: actor, is_anonymous: false },
        });
      if (path.endsWith("/user"))
        return Response.json({ id: actor, is_anonymous: false });
      if (path.endsWith("/unit-authorization")) return Response.json(q.details);
      if (path.endsWith("/logout")) return new Response(null, { status: 204 });
      throw Error("unexpected SDK request");
    });
    const repo = createMcpOAuthConsentRepository(
      { ...q.config, identityLinkEnabled: true as const },
      "unit-authorization",
      undefined,
      request,
    );
    const popup = {
      receive: vi.fn(async (raw: string) => {
        const url = new URL(raw);
        expect(url.searchParams.get("provider")).toBe(provider);
        expect(url.searchParams.get("code_challenge_method")).toBe("s256");
        expect(url.searchParams.get("code_challenge")).toHaveLength(43);
        return "original-auth-code";
      }),
      close: vi.fn(),
    };
    const view = await repo.signInProvider(provider, popup);
    expect(view).toMatchObject({
      kind: "CONSENT",
      accountId: actor,
    });
    expect(view).not.toHaveProperty("linkableProviders");
    const exchange = calls.find((c) => c.path.endsWith("/token"))!;
    expect(exchange.body.auth_code).toBe("original-auth-code");
    expect(exchange.body.code_verifier).toEqual(
      expect.stringMatching(/^[A-Za-z0-9_-]{43,128}$/),
    );
    expect(calls.filter((c) => c.path.endsWith("/token"))).toHaveLength(1);
    await repo.close();
  },
);
it("new PKCE-enabled config retains the installed SDK's normal OTP verification path (synthetic transport only)", async () => {
  const q = fixture(["google", "apple"]);
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const token = "synthetic.memory.session";
  const request = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, body });
    if (path.endsWith("/otp")) return Response.json({});
    if (path.endsWith("/verify"))
      return Response.json({
        access_token: token,
        refresh_token: "synthetic-memory-only",
        expires_in: 600,
        token_type: "bearer",
        user: { id: actor, is_anonymous: false },
      });
    if (path.endsWith("/user"))
      return Response.json({
        id: actor,
        is_anonymous: false,
        identities: [{ provider: "google" }],
      });
    if (path.endsWith("/unit-authorization")) return Response.json(q.details);
    if (path.endsWith("/logout")) return new Response(null, { status: 204 });
    throw Error("unexpected OTP request");
  });
  const repo = createMcpOAuthConsentRepository(
    { ...q.config, identityLinkEnabled: true as const },
    "unit-authorization",
    undefined,
    request,
  );
  await repo.requestCode("qa@example.invalid");
  expect(calls[0].body).toMatchObject({
    email: "qa@example.invalid",
    create_user: false,
    code_challenge_method: "s256",
  });
  expect(await repo.verifyCode("qa@example.invalid", "12345678")).toMatchObject({
    kind: "CONSENT",
    accountId: actor,
    linkableProviders: ["apple"],
  });
  expect(calls.find((c) => c.path.endsWith("/verify"))?.body).toMatchObject({
    email: "qa@example.invalid",
    token: "12345678",
    type: "email",
  });
  await repo.close();
});

it("provider enablement requires the full v1 policy and rejects duplicated providers", () => {
  const q = fixture(["google"]);
  expect(() =>
    createMcpOAuthConsentRepository(
      { ...q.config, consentPolicy: undefined },
      "unit-authorization",
    ),
  ).toThrow();
  expect(() =>
    createMcpOAuthConsentRepository(
      { ...q.config, browserProviders: ["google" as const, "google" as const] },
      "unit-authorization",
    ),
  ).toThrow();
});

it.each(["google", "apple"] as const)(
  "binds %s with the actual SDK to the confirmed account and verifies the original receipt",
  async (provider) => {
    const q = fixture([provider]);
    const originalState = randomUUID();
    const verifiedUser = { id: actor, is_anonymous: false };
    const token = "synthetic.memory.session";
    const sdkSession = {
      access_token: token,
      refresh_token: "synthetic-memory-only",
      expires_in: 600,
      token_type: "bearer",
      user: verifiedUser,
    };
    const providerRedirect = new URL(
      provider === "google"
        ? "https://accounts.google.com/o/oauth2/v2/auth"
        : "https://appleid.apple.com/auth/authorize",
    );
    providerRedirect.search = new URLSearchParams({
      state: originalState,
      redirect_uri: origin + "/auth/v1/callback",
      response_type: "code",
    }).toString();
    const request = vi.fn<typeof fetch>(async (raw, init) => {
      const url = new URL(String(raw));
      if (url.pathname.endsWith("/verify")) return Response.json(sdkSession);
      if (url.pathname.endsWith("/user")) return Response.json(verifiedUser);
      if (url.pathname.endsWith("/unit-authorization")) return Response.json(q.details);
      if (url.pathname.endsWith("/identities/authorize")) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer " + token);
        expect(url.searchParams.get("otr_link_confirmed")).toBe("true");
        expect(url.searchParams.get("otr_link_account_id")).toBe(actor);
        expect(url.searchParams.get("code_challenge_method")).toBe("s256");
        expect(url.searchParams.get("code_challenge")).toHaveLength(43);
        return Response.json({ url: providerRedirect.href });
      }
      if (url.pathname.endsWith("/token")) {
        const body = JSON.parse(String(init?.body));
        expect(body.auth_code).toBe("original-auth-code");
        expect(body.code_verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
        return Response.json(sdkSession);
      }
      if (url.pathname.endsWith("/link-status")) {
        expect(url.searchParams.get("flow_id")).toBe(originalState);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer " + token);
        return Response.json({
          status: "LINKED",
          flow_id: originalState,
          account_id: actor,
          provider,
          identity_id: randomUUID(),
          audit_event_id: randomUUID(),
        });
      }
      if (url.pathname.endsWith("/logout")) return new Response(null, { status: 204 });
      throw Error("unexpected SDK request");
    });
    const repo = createMcpOAuthConsentRepository(
      { ...q.config, identityLinkEnabled: true as const },
      "unit-authorization",
      undefined,
      request,
    );
    const popup = { receive: vi.fn(async () => "original-auth-code"), close: vi.fn() };
    await repo.verifyCode("unit@example.invalid", "12345678");
    await expect(repo.linkProvider(provider, client, popup)).rejects.toMatchObject({
      code: "REQUEST_CHANGED",
    });
    await expect(repo.linkProvider(provider, actor, popup)).resolves.toBeUndefined();
    expect(popup.receive).toHaveBeenCalledOnce();
    await expect(repo.linkProvider(provider, actor, popup)).rejects.toMatchObject({
      code: "LINK_UNRESOLVED",
    });
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/identities/authorize")),
    ).toHaveLength(1);
    expect(
      request.mock.calls.filter(([url]) =>
        String(url).includes("/identities/link-status"),
      ),
    ).toHaveLength(1);
    expect(request.mock.calls.some(([url]) => String(url).endsWith("/consent"))).toBe(
      false,
    );
    await repo.close();
  },
);
