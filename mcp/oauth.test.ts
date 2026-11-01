import { randomUUID } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { expect, it, vi } from "vitest";
import { createOAuthAuthorizer, protectedResourceMetadata } from "./oauth";
const resource = "https://mcp.example.invalid/mcp",
  issuer = "https://auth.example.invalid";
it("verifies genuine JWT signature/issuer/audience/expiry/client/scope plus current Auth grant", async () => {
  const keys = await generateKeyPair("ES256"),
    other = await generateKeyPair("ES256"),
    account = randomUUID();
  const active = vi.fn(
      async (_grant: unknown, _signal: AbortSignal, _evidence: { accessToken: string }) =>
        true,
    ),
    bind = vi.fn(
      async (
        _grant: unknown,
        _signal: AbortSignal,
        evidence: Readonly<{ accessToken: string }>,
      ) => ({
        read: async () => Response.json({}),
        backend: async () => Response.json({}),
        // Unexpected Auth callback fields must not replace verified identity or leak evidence.
        accountId: randomUUID(),
        scopes: ["unapproved.scope"],
        accessToken: evidence.accessToken,
      }),
    );
  const authorize = createOAuthAuthorizer({
    issuer,
    resource,
    key: keys.publicKey,
    isGrantActive: active,
    bindBackend: bind,
  });
  const token = async (patch: Record<string, unknown> = {}, key = keys.privateKey) =>
    new SignJWT({
      sub: account,
      aud: resource,
      iss: issuer,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60,
      role: "authenticated",
      client_id: "test-client",
      jti: randomUUID(),
      session_id: randomUUID(),
      scope: "openid email",
      otr_scopes: ["otr.trips.read", "otr.trips.write"],
      ...patch,
    })
      .setProtectedHeader({ alg: "ES256", typ: "at+jwt" })
      .sign(key);
  const request = (t: string) =>
    new Request(resource, { headers: { Authorization: "Bearer " + t } });
  const goodToken = await token();
  const good = await authorize(request(goodToken));
  expect(good).toMatchObject({
    accountId: account,
    clientId: "test-client",
    resource,
    scopes: ["otr.trips.read", "otr.trips.write"],
  });
  expect(active.mock.calls[0][2]).toBe(bind.mock.calls[0][2]);
  expect(Object.isFrozen(bind.mock.calls[0][2])).toBe(true);
  expect(bind.mock.calls[0][2]).toEqual({ accessToken: goodToken });
  const boundPorts = await bind.mock.results[0].value;
  expect(good?.read).toBe(boundPorts.read);
  expect(good?.backend).toBe(boundPorts.backend);
  expect(good).not.toHaveProperty("accessToken");
  expect(JSON.stringify(good)).not.toContain(goodToken);
  for (const patch of [
    { aud: "authenticated" },
    { iss: "https://wrong.invalid" },
    { exp: 1 },
    { client_id: undefined },
    { session_id: undefined },
    { otr_scopes: undefined },
    { otr_scopes: ["openid", "email"] },
    { otr_scopes: ["otr.trips.read", "unapproved.scope"] },
    { role: "service_role" },
  ])
    expect(await authorize(request(await token(patch)))).toBeNull();
  expect(await authorize(request(await token({}, other.privateKey)))).toBeNull();
  expect(
    active.mock.calls.every(([, , evidence]) => typeof evidence.accessToken === "string"),
  ).toBe(true);
  expect(
    await authorize(request(await token({ jti: undefined, session_id: randomUUID() }))),
  ).toMatchObject({ accountId: account });
  expect(bind.mock.calls[1][2]).not.toBe(bind.mock.calls[0][2]);
  const legacyAuthorize = createOAuthAuthorizer({
    issuer,
    resource,
    key: keys.publicKey,
    isGrantActive: active,
    bindBackend: async (_grant, _signal) => ({ read: async () => Response.json({}) }),
  });
  expect(await legacyAuthorize(request(await token()))).toMatchObject({
    accountId: account,
  });
  active.mockResolvedValue(false);
  expect(await authorize(request(await token()))).toBeNull();
  expect(bind).toHaveBeenCalledTimes(2);
});
it("publishes resource metadata and challenge without impersonating an authorization server", () => {
  const metadata = protectedResourceMetadata(resource, issuer);
  expect(metadata.challenge).toContain(metadata.metadataUrl);
  expect(metadata.handle(new Request(metadata.metadataUrl))?.status).toBe(200);
  expect(
    metadata.handle(new Request(metadata.metadataUrl, { method: "POST" }))?.status,
  ).toBe(405);
  expect(
    metadata.handle(new Request(issuer + "/.well-known/openid-configuration")),
  ).toBeNull();
  expect(() => protectedResourceMetadata("http://public.example/mcp", issuer)).toThrow();
});

it("advertises only provider-supported request scopes without granting business access", async () => {
  const metadata = protectedResourceMetadata(resource, issuer, { read: ["openid"] });
  const response = metadata.handle(new Request(metadata.metadataUrl))!;
  expect(await response.json()).toMatchObject({ scopes_supported: ["openid"] });
  expect(metadata.challenge).toContain('scope="openid"');
  expect(metadata.authorizationScopes.write).toBeUndefined();
  expect(() =>
    protectedResourceMetadata(resource, issuer, { read: ['openid" injected'] }),
  ).toThrow();
});
