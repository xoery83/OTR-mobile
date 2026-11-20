import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createBetaPrincipalVerifier } from "./betaOAuth";
import type { OAuthGrant } from "./oauth";
it("binds the current normal user and exact live OAuth grant, rejects revocation/foreign identities and never forwards to another resource", async () => {
  const grant: OAuthGrant = {
    accountId: randomUUID(),
    clientId: randomUUID(),
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    resource: "https://isolated.invalid/mcp",
    scopes: ["otr.trips.read", "otr.trips.write"],
    expiresAt: Date.now() + 60000,
  };
  const user = { id: grant.accountId, is_anonymous: false };
  const grants = [
    {
      client: { id: grant.clientId },
      scopes: ["openid"],
      granted_at: new Date(Date.now() - 1000).toISOString(),
    },
  ];
  const request = vi.fn<typeof fetch>(async (input) =>
    Response.json(String(input).endsWith("/user") ? user : grants),
  );
  const verify = createBetaPrincipalVerifier(
    "https://isolated.invalid/auth/v1",
    "public-anon-key",
    request,
  );
  expect(
    await verify(grant, new AbortController().signal, {
      accessToken: "same-signed-token",
    }),
  ).toEqual({ id: grant.accountId, accountClass: "NORMAL_ACCOUNT" });
  expect(request.mock.calls.map((c) => String(c[0]))).toEqual([
    "https://isolated.invalid/auth/v1/user",
    "https://isolated.invalid/auth/v1/user/oauth/grants",
  ]);
  request.mockImplementation(async (input) =>
    Response.json(String(input).endsWith("/user") ? user : []),
  );
  expect(
    await verify(grant, new AbortController().signal, {
      accessToken: "same-signed-token",
    }),
  ).toBeNull();
  request.mockImplementation(async () => Response.json({ ...user, id: randomUUID() }));
  expect(
    await verify(grant, new AbortController().signal, {
      accessToken: "same-signed-token",
    }),
  ).toBeNull();
  expect(
    await verify({ ...grant, expiresAt: 0 }, new AbortController().signal, {
      accessToken: "same-signed-token",
    }),
  ).toBeNull();
});

it("advertises exactly the supported consent identity scopes while retaining issuer/endpoints", async () => {
  const { betaProviderMetadata } = await import("./betaOAuth");
  const issuer = "https://isolated.invalid/auth/v1",
    raw = {
      issuer,
      scopes_supported: ["openid", "profile", "email", "phone", "offline_access"],
      authorization_endpoint: issuer + "/oauth/authorize",
    };
  expect(betaProviderMetadata(raw, issuer)).toEqual({
    ...raw,
    scopes_supported: ["openid", "email", "offline_access"],
  });
  expect(() =>
    betaProviderMetadata({ ...raw, issuer: "https://foreign.invalid" }, issuer),
  ).toThrow();
  expect(() =>
    betaProviderMetadata({ ...raw, scopes_supported: ["profile"] }, issuer),
  ).toThrow();
});
