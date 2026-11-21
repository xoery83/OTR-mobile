import { expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  managedNativeAuthorization,
  type ManagedNativeConsent,
} from "./managedNativeConsent";
import type { BackendDependencies } from "../backend/src/app";
import { adaptLegacyTripRead, betaCapabilities, betaRequest, createBetaMcpHandler, parseBetaCall } from "./beta";
import {
  createBetaPrincipalVerifier,
  managedDevBetaIssuer,
  managedDevBetaResource,
} from "./betaOAuth";
import {
  createManagedDevBetaHandler,
  createManagedDevConfiguredHost,
} from "./managedDevBeta";

const publicKey = "sb_publishable_synthetic_managed_dev_test_only";
const policy = {
  contractVersion: 1 as const,
  policy: {
    id: "otr.beta",
    version: "unit",
    resource: managedDevBetaResource,
    permissions: betaCapabilities.map((entry) => entry.capabilityId),
    business_scopes: ["otr.trips.read", "otr.trips.write"],
    allow_reuse: false,
    grant_ttl_seconds: 600,
  },
  policyHash: "a".repeat(64),
  identityScopes: ["openid", "offline_access"],
};
const dependencies = {} as BackendDependencies;

it("requires all owning ports for standing writes and never serves the confirmation secret", async () => {
  const secret = "unit-test-private-confirmation-secret";
  const adapter: ManagedNativeConsent = {
    version: "managed-api-v1",
    getOrCreateChallenge: vi.fn(),
    readBinding: vi.fn(),
    inspectById: vi.fn(),
    decideById: vi.fn(),
  };
  const candidate = {
    expiresAt: null,
    standingWrites: { confirmationSecret: secret },
    managedDev: {
      accountId: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      redirectUri: "https://chatgpt.com/connector/oauth/unit",
    },
    consentPolicy: {
      ...policy,
      policy: { ...policy.policy, version: "unit:standing-writes" },
    },
  };
  const make = (
    deps: Parameters<typeof createManagedDevConfiguredHost>[2],
    raw = candidate,
  ) => createManagedDevConfiguredHost(
    JSON.stringify(raw), publicKey, deps, vi.fn(() => vi.fn()), new Uint8Array([4]), adapter,
  );
  const qualified = {
    ...dependencies,
    managedWriteAdmissionVersion: 2 as const,
    managedMcpApprovalConnection: { withLease: vi.fn() },
    managedTripLifecycleForGrant: vi.fn(),
  };
  expect(() => make(dependencies)).toThrow("MANAGED_DEV_BETA_CONFIG_NOT_APPROVED");
  expect(() => make(qualified, { ...candidate, consentPolicy: policy })).toThrow();
  const host = make(qualified);
  const configuration = await host(new Request("https://api-dev.xoery.art/oauth/consent/config"));
  expect(configuration?.status).toBe(200);
  expect(await configuration?.text()).not.toContain(secret);
  expect((await host(new Request("https://api-dev.xoery.art/mcp/approve")))?.status).toBe(200);
  const anonymous = await host(new Request(
    "https://api-dev.xoery.art/mcp/operation-approvals/11111111-1111-4111-8111-111111111111",
  ));
  expect(anonymous?.status).toBe(401);
  expect(qualified.managedMcpApprovalConnection.withLease).not.toHaveBeenCalled();
});

it("uses only the managed DEV issuer for protected resource discovery and denies anonymous tools", async () => {
  const handler = createManagedDevBetaHandler(policy, publicKey, dependencies);
  const discovery = await handler(
    new Request("https://api-dev.xoery.art/.well-known/oauth-protected-resource/mcp"),
  );
  expect(await discovery.json()).toMatchObject({
    resource: managedDevBetaResource,
    authorization_servers: [managedDevBetaIssuer],
  });
  expect(
    (await handler(new Request(managedDevBetaResource, { method: "POST" }))).status,
  ).toBe(401);
});

it("requires the full formal policy and a public key without falling back to legacy consent", () => {
  expect(() => createManagedDevBetaHandler(undefined, publicKey, dependencies)).toThrow();
  expect(() =>
    createManagedDevBetaHandler(
      policy,
      "sb_secret_synthetic_do_not_send_anywhere",
      dependencies,
    ),
  ).toThrow();
  expect(() =>
    createManagedDevBetaHandler(
      {
        ...policy,
        policy: { ...policy.policy, resource: "https://elsewhere.invalid/mcp" },
      },
      publicKey,
      dependencies,
    ),
  ).toThrow();
  expect(() =>
    createBetaPrincipalVerifier(
      "https://different.invalid/auth/v1",
      publicKey,
      fetch,
      policy as Parameters<typeof createBetaPrincipalVerifier>[3],
    ),
  ).toThrow("INVALID_BETA_CONSENT_POLICY");
});

it("mounts the formal consent routes and rejects anonymous or foreign traffic", async () => {
  const issuerOrigin = new URL(managedDevBetaIssuer).origin;
  const backendFactory = vi.fn(() => vi.fn());
  const adapter: ManagedNativeConsent = {
    version: "managed-api-v1",
    getOrCreateChallenge: vi.fn(),
    readBinding: vi.fn(),
    inspectById: vi.fn(),
    decideById: vi.fn(),
  };
  const candidate = {
    expiresAt: Date.now() + 60_000,
    managedDev: {
      accountId: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      redirectUri: "https://chatgpt.com/connector/oauth/unit",
    },
    consentPolicy: {
      ...policy,
      policy: { ...policy.policy, business_scopes: ["otr.trips.read"] },
    },
  };
  const makeHost = (native?: ManagedNativeConsent) =>
    createManagedDevConfiguredHost(
      JSON.stringify(candidate),
      publicKey,
      dependencies,
      backendFactory,
      new Uint8Array([4]),
      native,
    );
  expect(makeHost).toThrow();
  candidate.consentPolicy = policy;
  expect((await makeHost()(new Request(managedDevBetaResource)))?.status).toBe(503);
  const host = makeHost(adapter);
  const page = await host(
    new Request("http://api-dev.xoery.art/oauth/consent?authorization_id=synthetic"),
  );
  expect(page?.status).toBe(200);
  expect(page?.headers.get("content-security-policy")).toContain(issuerOrigin);
  expect(await host(new Request("http://api-dev.xoery.art/health"))).toBeNull();
  expect((await host(new Request("http://foreign.invalid/oauth/consent")))?.status).toBe(
    404,
  );
  expect(
    (await host(new Request("http://api-dev.xoery.art/mcp", { method: "POST" })))?.status,
  ).toBe(401);
  expect(backendFactory).not.toHaveBeenCalled();
  const decision = "http://api-dev.xoery.art/oauth/consent";
  expect((await host(new Request(decision, { method: "POST" })))?.status).toBe(403);
  const anonymous = await host(
    new Request(decision, {
      method: "POST",
      headers: {
        Origin: "https://api-dev.xoery.art",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
  );
  expect(anonymous?.status).toBe(401);
  expect(anonymous?.headers.get("referrer-policy")).toBe("no-referrer");
  expect(adapter.inspectById).not.toHaveBeenCalled();
});

it("keeps explicit persistent read-only deployment distinct from the temporary write window", async () => {
  const now = Date.now();
  const config = {
    expiresAt: null,
    managedDev: {
      accountId: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      redirectUri: "https://chatgpt.com/connector/oauth/unit",
    },
    consentPolicy: policy,
  };
  const adapter: ManagedNativeConsent = {
    version: "managed-api-v1",
    getOrCreateChallenge: vi.fn(),
    readBinding: vi.fn(),
    inspectById: vi.fn(),
    decideById: vi.fn(),
  };
  const makeHost = (input: object) => createManagedDevConfiguredHost(
    JSON.stringify(input), publicKey, dependencies, vi.fn(), new Uint8Array([4]), adapter,
  );
  expect(() => makeHost({ ...config, oneRename: {} })).toThrow("MANAGED_DEV_BETA_CONFIG_NOT_APPROVED");
  expect(() => makeHost({ ...config, expiresAt: now + 3_600_000 })).toThrow("MANAGED_DEV_BETA_CONFIG_NOT_APPROVED");
  expect(() => makeHost({
    ...config, expiresAt: now + 60_000, managedDev: { ...config.managedDev, accountId: null },
  })).toThrow("MANAGED_DEV_BETA_CONFIG_NOT_APPROVED");
  const host = makeHost(config);
  const temporary = makeHost({ ...config, expiresAt: now + 60_000 });
  const discovery = () => new Request(`${new URL(managedDevBetaResource).origin}/.well-known/oauth-protected-resource/mcp`);
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + 3_600_000);
  try {
    expect((await temporary(discovery()))?.status).toBe(503);
    expect((await host(discovery()))?.status).toBe(200);
    expect((await host(new Request(managedDevBetaResource, { method: "POST" })))?.status).toBe(401);
    expect(adapter.readBinding).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
  }
});

it("uses the same signed native session for live user and private Consent and stays read-only", async () => {
  const { privateKey, publicKey: key } = await generateKeyPair("ES256");
  const accountId = "11111111-1111-4111-8111-111111111111";
  const clientId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "33333333-3333-4333-8333-333333333333";
  const attemptId = "44444444-4444-4444-8444-444444444444";
  const closesAt = Date.now() + 60000;
  const sign = async (audience: string, firstParty = false, subject = accountId, scope = "openid email offline_access") =>
    new SignJWT({
      ...(firstParty ? {} : { client_id: clientId, scope }),
      session_id: sessionId,
      role: "authenticated",
      is_anonymous: false,
    })
      .setAudience(audience)
      .setIssuer(managedDevBetaIssuer)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime("1m")
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .sign(privateKey);
  const token = await sign(managedDevBetaResource);
  let revoked = false;
  let firstParty: string;
  let activeGrant = true;
  let grantScopes = ["openid", "email", "offline_access"];
  const getUser = vi.fn<typeof fetch>(async (url, init) => {
    const bearer = new Headers(init?.headers).get("authorization");
    if (url === managedDevBetaIssuer + "/user/oauth/grants") {
      expect(bearer).toBe(`Bearer ${firstParty}`);
      return Response.json(
        activeGrant
          ? [
              {
                client: { id: clientId },
                scopes: grantScopes,
                granted_at: new Date().toISOString(),
              },
            ]
          : [],
      );
    }
    expect(bearer).toBe(`Bearer ${token}`);
    if (url === managedDevBetaIssuer + "/oauth/userinfo") {
      return revoked
        ? Response.json({ error_code: "session_not_found" }, { status: 403 })
        : Response.json({ sub: accountId });
    }
    expect(url).toBe(managedDevBetaIssuer + "/user");
    return Response.json({ id: accountId, is_anonymous: false });
  });
  const adapter: ManagedNativeConsent = {
    version: "managed-api-v1",
    getOrCreateChallenge: vi.fn(async () => ({
      id: attemptId,
      expiresAt: Date.now() + 10000,
    })),
    readBinding: vi.fn(async () => null),
    inspectById: vi.fn(async () => ({
      id: attemptId,
      accountId,
      state: "PENDING",
      expiresAt: closesAt,
      policy: {
        policyId: policy.policy.id,
        policyVersion: policy.policy.version,
        policyHash: policy.policyHash,
      },
    })),
    decideById: vi.fn(async () => ({ id: attemptId, decision: "APPROVED" })),
  };
  const validateAccessToken = vi.fn(async () => ({
    id: accountId,
    accountClass: "NORMAL_ACCOUNT" as const,
  }));
  const nativeOptions = {
    key,
    principal: { accountId, clientId },
    publishableKey: publicKey,
    dependencies: { gateway: { validateAccessToken } } as unknown as BackendDependencies,
    buildBackend: undefined,
    consent: adapter,
    pin: policy as Parameters<typeof managedNativeAuthorization>[0]["pin"],
    closesAt,
    providerRequest: getUser,
  } satisfies Parameters<typeof managedNativeAuthorization>[0];
  const native = managedNativeAuthorization(nativeOptions);
  const call = (bearer = token, method = "tools/call") =>
    new Request(managedDevBetaResource, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method }),
    });
  const invalid = call("invalid");
  expect(await native.authorize(invalid)).toBeNull();
  expect(await native.unapproved(invalid, invalid.signal)).toBeNull();
  const legacyScopes = call(await sign(managedDevBetaResource, false, accountId, "openid otr.trips.read"), "initialize");
  expect(await native.authorize(legacyScopes)).toBeNull();
  const defaultAudience = call(await sign("authenticated"), "initialize");
  expect(await native.authorize(defaultAudience)).toBeNull();
  expect(await native.unapproved(defaultAudience, defaultAudience.signal)).toBeNull();
  expect(getUser).not.toHaveBeenCalled();
  expect(adapter.getOrCreateChallenge).not.toHaveBeenCalled();
  const ping = call(token, "ping");
  expect(await native.authorize(ping)).toBeNull();
  expect(await native.unapproved(ping, ping.signal)).toBeNull();
  expect(adapter.getOrCreateChallenge).not.toHaveBeenCalled();

  const handleDiscovery = createBetaMcpHandler({
    resource: managedDevBetaResource,
    authorize: native.authorize,
    unapproved: native.unapproved,
    discoveryIdentity: native.discoveryIdentity,
  });
  const discoveryResponse = await handleDiscovery(call(token, "tools/list"));
  expect(discoveryResponse.status).toBe(200);
  const discoveryWire = await discoveryResponse.text();
  const discovery = JSON.parse(discoveryResponse.headers.get("content-type")?.includes("text/event-stream")
    ? discoveryWire.split("\n").find((line) => line.startsWith("data:"))!.slice(5)
    : discoveryWire);
  expect(discovery.result.tools).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "get_trip" }),
  ]));
  expect(await (await handleDiscovery(call("invalid", "tools/list"))).json())
    .toEqual({ error: { code: "AUTH_REQUIRED" } });
  expect(adapter.getOrCreateChallenge).not.toHaveBeenCalled();
  const mixed = new Request(managedDevBetaResource, {
    method: "POST",
    headers: call().headers,
    body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "tools/call" }]),
  });
  expect((await handleDiscovery(mixed)).status).toBe(401);
  const pending = call(token, "tools/call");
  expect(await native.authorize(pending)).toBeNull();
  const link = await native.unapproved(pending, pending.signal);
  const { error } = await link!.json();
  expect(error.message).toBe("OTR_CONSENT_REQUIRED");
  const url = new URL(error.data.consentUrl);
  expect(url.origin + url.pathname + url.search).toBe(
    "https://api-dev.xoery.art/oauth/consent",
  );
  expect(url.hash).toBe(`#managed=${attemptId}`);
  const retry = call(token, "initialize");
  expect(await native.authorize(retry)).toBeNull();
  const retryLink = await native.unapproved(retry, retry.signal);
  const extension = call(token, "tools/get");
  expect(await native.authorize(extension)).toBeNull();
  expect(await (await native.unapproved(extension, extension.signal))?.json()).toMatchObject({
    error: { message: "OTR_CONSENT_REQUIRED" },
  });
  expect((await retryLink!.json()).error.data.consentUrl).toBe(url.href);
  firstParty = await sign("authenticated", true);
  const decideCall = (
    bearer: string,
    body: object = { action: "decide", id: attemptId, allow: true },
  ) =>
    new Request("https://api-dev.xoery.art/oauth/consent", {
      method: "POST",
      headers: {
        Origin: "https://api-dev.xoery.art",
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify(body),
    });
  expect((await native.confirmation(decideCall(token))).status).toBe(403);
  expect(
    (await native.confirmation(decideCall(await sign("authenticated")))).status,
  ).toBe(403);
  const otherAccount = await sign("authenticated", true, clientId);
  expect((await native.confirmation(decideCall(otherAccount))).status).toBe(401);
  expect(validateAccessToken).not.toHaveBeenCalled();
  expect(
    (
      await native.confirmation(
        decideCall(firstParty, {
          action: "decide",
          id: attemptId,
          allow: true,
          secret: "forged",
        }),
      )
    ).status,
  ).toBe(403);
  expect(adapter.decideById).not.toHaveBeenCalled();
  activeGrant = false;
  expect((await native.confirmation(decideCall(firstParty))).status).toBe(403);
  expect(adapter.decideById).not.toHaveBeenCalled();
  activeGrant = true;
  grantScopes = ["openid", "otr.trips.read"];
  expect((await native.confirmation(decideCall(firstParty))).status).toBe(403);
  expect(adapter.decideById).not.toHaveBeenCalled();
  grantScopes = ["openid", "email", "offline_access"];
  vi.mocked(adapter.inspectById).mockRejectedValueOnce(new Error("MCP_CONSENT_STORE_UNAVAILABLE"));
  const unavailable = await native.confirmation(decideCall(firstParty));
  expect(unavailable.status).toBe(503);
  expect(adapter.decideById).not.toHaveBeenCalled();
  const inspected = await native.confirmation(
    decideCall(firstParty, { action: "inspect", id: attemptId }),
  );
  expect(await inspected.json()).toMatchObject({ id: attemptId, state: "PENDING" });
  const decided = await native.confirmation(decideCall(firstParty));
  expect(await decided.json()).toEqual({ id: attemptId, decision: "APPROVED" });
  expect(validateAccessToken).toHaveBeenCalledWith(firstParty);
  expect(adapter.decideById).toHaveBeenCalledExactlyOnceWith(
    { accountId, kind: "FIRST_PARTY" },
    attemptId,
    true,
    expect.any(AbortSignal),
  );
  const verifiedBinding = {
    issuer: managedDevBetaIssuer,
    accountId,
    clientId,
    sessionId,
    expiresAt: closesAt,
    evidenceId: clientId,
    policyHash: policy.policyHash,
    policyId: policy.policy.id,
    policyVersion: policy.policy.version,
  };
  vi.mocked(adapter.readBinding).mockResolvedValue({
    ...verifiedBinding,
    sessionId: clientId,
  });
  expect(await native.authorize(call())).toBeNull();
  vi.mocked(adapter.readBinding).mockResolvedValue(verifiedBinding);
  getUser.mockClear();
  vi.mocked(adapter.readBinding).mockClear();
  const confirmed = await native.authorize(call());
  expect(getUser).toHaveBeenCalledTimes(2);
  expect(adapter.readBinding).toHaveBeenCalledOnce();
  expect(confirmed?.scopes).toEqual(["otr.trips.read"]);
  expect(getUser).toHaveBeenCalledWith(managedDevBetaIssuer + "/user", expect.anything());
  const otherSubject = "55555555-5555-4555-8555-555555555555";
  const otherToken = await sign(managedDevBetaResource, false, otherSubject);
  const general = managedNativeAuthorization({
    ...nativeOptions, principal: { clientId, accountId: null },
  });
  const verifyOtherAccount = () => getUser
    .mockResolvedValueOnce(Response.json({ sub: otherSubject }))
    .mockResolvedValueOnce(Response.json({ id: otherSubject, is_anonymous: false }));
  expect(await native.authorize(call(otherToken))).toBeNull();
  verifyOtherAccount();
  expect(await general.authorize(call(otherToken))).toBeNull();
  verifyOtherAccount();
  vi.mocked(adapter.readBinding).mockResolvedValueOnce({ ...verifiedBinding, accountId: otherSubject });
  expect(await general.authorize(call(otherToken))).toMatchObject({
    accountId: otherSubject, clientId, scopes: ["otr.trips.read"],
  });
  const otherFirstParty = await sign("authenticated", true, otherSubject);
  validateAccessToken.mockResolvedValueOnce({ id: otherSubject, accountClass: "NORMAL_ACCOUNT" });
  getUser.mockResolvedValueOnce(Response.json([{
    client: { id: clientId }, scopes: ["openid"], granted_at: new Date().toISOString(),
  }]));
  const foreignConsent = await general.confirmation(decideCall(otherFirstParty, {
    action: "inspect", id: attemptId,
  }));
  expect(foreignConsent.status).toBe(404);
  expect(adapter.inspectById).toHaveBeenLastCalledWith(
    { accountId: otherSubject, kind: "FIRST_PARTY" }, attemptId, expect.any(AbortSignal),
  );
  const jwk = await exportJWK(key);
  vi.stubGlobal("fetch", async (input: URL | string, init?: RequestInit) =>
    String(input) === managedDevBetaIssuer + "/.well-known/jwks.json"
      ? Response.json({ keys: [jwk] })
      : getUser(input, init),
  );
  try {
    const host = createManagedDevConfiguredHost(
      JSON.stringify({
        expiresAt: null,
        managedDev: { accountId, clientId, redirectUri: "https://chatgpt.com/connector/oauth/unit" },
        consentPolicy: policy,
      }),
      publicKey,
      nativeOptions.dependencies,
      vi.fn(),
      new Uint8Array([4]),
      adapter,
    );
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    };
    const response = await host(new Request(managedDevBetaResource, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list" }),
    }));
    expect(response?.status).toBe(200);
    const wire = await response!.text();
    const reply = JSON.parse(response!.headers.get("content-type")?.includes("text/event-stream")
      ? wire.split("\n").find((line) => line.startsWith("data:"))!.slice(5)
      : wire);
    const listed = reply.result.tools as Array<{
      name: string;
      _meta?: { securitySchemes?: Array<{ type: string; scopes: string[] }> };
    }>;
    expect(listed.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["get_trip", "update_trip"]),
    );
    expect(listed.find((tool) => tool.name === "update_trip")?._meta?.securitySchemes)
      .toEqual([{ type: "oauth2", scopes: ["openid"] }]);
    for (const { _meta } of listed) {
      for (const scheme of _meta?.securitySchemes ?? []) expect(scheme.scopes).toEqual(["openid"]);
    }
  } finally {
    vi.unstubAllGlobals();
  }
  const buildBackend = vi.fn(() => async () => new Response(null, { status: 204 }));
  const standing = managedNativeAuthorization({ ...nativeOptions, standingWrites: true, buildBackend });
  const standingGrant = await standing.authorize(call());
  expect(standingGrant?.scopes).toContain("otr.trips.write");
  vi.mocked(adapter.readBinding).mockResolvedValue({ ...verifiedBinding, evidenceId: attemptId });
  expect((await standingGrant!.betaBackend!(
    { method: "GET", path: "/v2/trips" }, AbortSignal.timeout(2000),
  )).status).toBe(401);
  expect(buildBackend).not.toHaveBeenCalled();

  getUser.mockResolvedValueOnce(new Response(null, { status: 503 }));
  const issuerUnavailable = await handleDiscovery(call());
  expect(issuerUnavailable.status).toBe(503);
  expect(issuerUnavailable.headers.has("www-authenticate")).toBe(false);

  vi.mocked(adapter.readBinding).mockRejectedValueOnce(new Error("Consent unavailable"));
  const consentUnavailable = await handleDiscovery(call());
  expect(consentUnavailable.status).toBe(503);
  expect(consentUnavailable.headers.has("www-authenticate")).toBe(false);

  revoked = true;
  vi.mocked(adapter.readBinding).mockClear();
  const denied = await handleDiscovery(call());
  expect(denied.status).toBe(401);
  expect(denied.headers.has("www-authenticate")).toBe(true);
  const revokedRequest = call();
  expect(await native.authorize(revokedRequest)).toBeNull();
  expect(await native.unapproved(revokedRequest, revokedRequest.signal)).toBeNull();
  expect(adapter.readBinding).not.toHaveBeenCalled();
});


it("adapts only the two valid legacy Trip-read shapes to the current owning contract", () => {
  const tripId = "cc44a705-6f43-41e0-a2f9-16f334b2a6b2";
  const wire = (name: string, args: object) => Buffer.from(JSON.stringify({
    jsonrpc: "2.0", method: "tools/call", id: "read", params: { name, arguments: args },
  }));
  const adapt = (input: Uint8Array) => JSON.parse(Buffer.from(adaptLegacyTripRead(input)).toString());
  const get = adapt(wire("get_trip", { trip_id: tripId }));
  expect(parseBetaCall(get.params.arguments.call).call.pathParams).toEqual({ tripId });
  expect(betaRequest(get.params.arguments.call)).toEqual({
    method: "GET",
    path: `/v2/trips/${tripId}/metadata`,
    headers: { "OTR-Trip-Metadata-Version": "3", "OTR-Metadata-Operation-Id": expect.stringMatching(/^[a-f0-9-]{36}$/) },
  });
  const list = adapt(wire("list_trips", { limit: 20 }));
  expect(parseBetaCall(list.params.arguments.call).call.query).toEqual({ limit: 20, lifecycle: "ACTIVE" });
  for (const original of [wire("list_trips", { limit: 50 }), wire("get_trip", { trip_id: "invalid" }),
    wire("get_trip", { trip_id: tripId, call: {} }), wire("delete_trip", { trip_id: tripId })]) {
    expect(adaptLegacyTripRead(original)).toBe(original);
  }
});
