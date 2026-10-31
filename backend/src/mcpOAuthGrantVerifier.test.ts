import { Buffer } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import {
  createSupabaseDevMcpGrantVerifier,
  type McpVerifiedGrant,
} from "./mcpOAuthGrantVerifier";

const accountId = "26876e6e-a919-457d-bc00-78d76ba08043";
const clientId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const issuer = "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1";
const resource = "https://api-dev.xoery.art/mcp";
const policy = { clientId, publishableKey: "sb_publishable_unit_local_fixture_only" };
function sample() {
  const exp = Math.floor(Date.now() / 1000) + 300;
  const grant: McpVerifiedGrant = Object.freeze({
    accountId,
    clientId,
    sessionId,
    resource,
    scopes: Object.freeze(["otr.trips.read"]),
    expiresAt: exp * 1000,
  });
  const claims = {
    iss: issuer,
    aud: resource,
    sub: accountId,
    client_id: clientId,
    session_id: sessionId,
    role: "authenticated",
    exp,
    otr_scopes: ["otr.trips.read"],
  };
  // Local caller-contract fixture only; signature verification belongs to MCP.
  const evidence = (payload = claims) => ({
    accessToken: `unit.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.unit`,
  });
  const providerGrant = {
    client: { id: clientId },
    scopes: ["openid"],
    granted_at: "2026-10-01T00:00:00Z",
  };
  return { grant, claims, evidence, providerGrant };
}
function wire(user: unknown, grants: unknown) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(user))
    .mockResolvedValueOnce(Response.json(grants));
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("accepts only public DEV keys, never an admin credential", () => {
  const key = (role: string, ref = "tuqigdxrvrerfewsxqgm") =>
    `unit.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.unit`;
  expect(() =>
    createSupabaseDevMcpGrantVerifier({ ...policy, publishableKey: key("anon") }),
  ).not.toThrow();
  for (const publishableKey of [
    "sb_secret_unit_never_read",
    key("service_role"),
    key("anon", "other-project"),
    "malformed",
    policy.publishableKey + "\r\nInjected: true",
  ])
    expect(() =>
      createSupabaseDevMcpGrantVerifier({ ...policy, publishableKey }),
    ).toThrow();
});

it("is default closed without IO and snapshots the configured public client", async () => {
  const { grant, evidence, providerGrant } = sample();
  const request = wire({ id: accountId, is_anonymous: false }, [providerGrant]);
  const signal = new AbortController().signal;
  expect(
    await createSupabaseDevMcpGrantVerifier(undefined, request)(
      grant,
      signal,
      evidence(),
    ),
  ).toBe(false);
  expect(request).not.toHaveBeenCalled();
  const mutable = { ...policy };
  const verify = createSupabaseDevMcpGrantVerifier(mutable, request);
  mutable.clientId = otherId;
  expect(await verify(grant, signal, evidence())).toBe(true);
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    issuer + "/user",
    issuer + "/user/oauth/grants",
  ]);
  for (const [, init] of request.mock.calls) {
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: {
        apikey: policy.publishableKey,
        Authorization: `Bearer ${evidence().accessToken}`,
      },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
});

it.each([
  ["account", { accountId: otherId }],
  ["client", { clientId: otherId }],
  ["session", { sessionId: otherId }],
  ["missing session", { sessionId: undefined }],
  ["wrong resource", { resource: "https://other.invalid/mcp" }],
  ["write", { scopes: ["otr.trips.read", "otr.trips.write"] }],
  ["OIDC only", { scopes: ["openid"] }],
  ["expired", { expiresAt: 1 }],
] as const)("rejects %s before IO", async (_, changes) => {
  const { grant, evidence } = sample(),
    request = vi.fn<typeof fetch>();
  expect(
    await createSupabaseDevMcpGrantVerifier(policy, request)(
      { ...grant, ...changes } as McpVerifiedGrant,
      new AbortController().signal,
      evidence(),
    ),
  ).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

it.each([
  { sub: otherId },
  { client_id: otherId },
  { session_id: otherId },
  { aud: "authenticated" },
  { iss: "https://other.invalid/auth/v1" },
  { otr_scopes: ["openid"] },
  { role: "service_role" },
  { exp: 1 },
])("rejects substituted token claims %j before IO", async (changes) => {
  const { grant, claims, evidence } = sample(),
    request = vi.fn<typeof fetch>();
  expect(
    await createSupabaseDevMcpGrantVerifier(policy, request)(
      grant,
      new AbortController().signal,
      evidence({ ...claims, ...changes } as typeof claims),
    ),
  ).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

it.each([
  { id: otherId, is_anonymous: false },
  { id: accountId, is_anonymous: true },
  { id: accountId },
  { id: accountId, is_anonymous: false, banned_until: "2099-01-01T00:00:00Z" },
  { id: accountId, is_anonymous: false, deleted_at: "2026-01-01T00:00:00Z" },
])("rejects non-normal or inactive provider user %j", async (user) => {
  const { grant, evidence } = sample(),
    request = wire(user, []);
  expect(
    await createSupabaseDevMcpGrantVerifier(policy, request)(
      grant,
      new AbortController().signal,
      evidence(),
    ),
  ).toBe(false);
  expect(request).toHaveBeenCalledOnce();
});

it.each([
  "missing",
  "other client",
  "duplicate",
  "no OIDC consent",
  "malformed",
  "envelope",
])("rejects %s grant without inferring business scope", async (mode) => {
  const { grant, evidence, providerGrant } = sample();
  const bodies: Record<string, unknown> = {
    missing: [],
    "other client": [{ ...providerGrant, client: { id: otherId } }],
    duplicate: [providerGrant, providerGrant],
    "no OIDC consent": [{ ...providerGrant, scopes: [] }],
    malformed: [{ ...providerGrant, granted_at: "yesterday" }],
    envelope: { data: [providerGrant] },
  };
  const request = wire({ id: accountId, is_anonymous: false }, bodies[mode]);
  expect(
    await createSupabaseDevMcpGrantVerifier(policy, request)(
      grant,
      new AbortController().signal,
      evidence(),
    ),
  ).toBe(false);
});

it.each([401, 403, 429, 500, 302])(
  "fails closed on provider HTTP %s at either endpoint",
  async (status) => {
    for (const endpoint of [0, 1]) {
      const { grant, evidence } = sample(),
        request = vi.fn<typeof fetch>();
      if (endpoint)
        request.mockResolvedValueOnce(
          Response.json({ id: accountId, is_anonymous: false }),
        );
      request.mockResolvedValueOnce(new Response(null, { status }));
      expect(
        await createSupabaseDevMcpGrantVerifier(policy, request)(
          grant,
          new AbortController().signal,
          evidence(),
        ),
      ).toBe(false);
      expect(request).toHaveBeenCalledTimes(endpoint + 1);
    }
  },
);

it("rejects oversized/malformed provider responses and transport failures", async () => {
  for (const response of [new Response("["), new Response("x".repeat(65537))]) {
    const { grant, evidence } = sample();
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response);
    expect(
      await createSupabaseDevMcpGrantVerifier(policy, request)(
        grant,
        new AbortController().signal,
        evidence(),
      ),
    ).toBe(false);
  }
  const { grant, evidence } = sample();
  const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
  expect(
    await createSupabaseDevMcpGrantVerifier(policy, request)(
      grant,
      new AbortController().signal,
      evidence(),
    ),
  ).toBe(false);
});

it("bounds abort-ignoring IO and never admits a token expiring during the read", async () => {
  vi.useFakeTimers();
  const { grant, evidence } = sample();
  const signal = new AbortController();
  const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
  const result = createSupabaseDevMcpGrantVerifier(policy, request)(
    grant,
    signal.signal,
    evidence(),
  );
  await vi.advanceTimersByTimeAsync(10000);
  expect(await result).toBe(false);
  const aborted = createSupabaseDevMcpGrantVerifier(policy, request)(
    grant,
    signal.signal,
    evidence(),
  );
  signal.abort();
  expect(await aborted).toBe(false);
  const delayed = vi.fn<typeof fetch>().mockImplementationOnce(async () => {
    vi.setSystemTime(grant.expiresAt);
    return Response.json({ id: accountId, is_anonymous: false });
  });
  expect(
    await createSupabaseDevMcpGrantVerifier(policy, delayed)(
      grant,
      new AbortController().signal,
      evidence(),
    ),
  ).toBe(false);
  expect(delayed).toHaveBeenCalledOnce();
});
