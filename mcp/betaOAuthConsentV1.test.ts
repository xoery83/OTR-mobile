import { randomUUID } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { expect, it, vi } from "vitest";
import { createBetaPrincipalVerifier, createBetaOAuthHandler } from "./betaOAuth";
import { createOAuthAuthorizer } from "./oauth";
import type { McpConsentPolicyPin } from "../src/data/auth/mcpOAuthConsentContract";

async function fixture() {
  const issuer = "https://isolated.invalid/auth/v1",
    resource = "https://isolated.invalid/mcp";
  const keys = await generateKeyPair("ES256"),
    account = randomUUID(),
    client = randomUUID();
  const pin: McpConsentPolicyPin = {
    contractVersion: 1,
    policy: {
      id: "otr.beta",
      version: "unit-risk1.1",
      resource,
      permissions: ["otr.trip.update"],
      business_scopes: ["otr.trips.read", "otr.trips.write"],
      allow_reuse: true,
      grant_ttl_seconds: 3600,
    },
    policyHash: "a".repeat(64),
    identityScopes: ["openid", "offline_access"],
  };
  const claims = {
    iss: issuer,
    aud: resource,
    sub: account,
    client_id: client,
    session_id: randomUUID(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
    role: "authenticated",
    scope: "openid offline_access",
    otr_scopes: pin.policy.business_scopes,
    otr_policy: { id: pin.policy.id, version: pin.policy.version, hash: pin.policyHash },
    otr_consent_id: randomUUID(),
    otr_grant_evidence_id: randomUUID(),
  };
  const metadata = {
    contract_version: 1,
    grant_id: claims.otr_consent_id,
    evidence_id: claims.otr_grant_evidence_id,
    policy_id: pin.policy.id,
    policy_version: pin.policy.version,
    policy_hash: pin.policyHash,
    resource,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  let rows: unknown = [
    {
      client: { id: client },
      scopes: ["openid", "offline_access"],
      granted_at: new Date(Date.now() - 1000).toISOString(),
      consent: metadata,
    },
  ];
  const request = vi.fn<typeof fetch>(async (input) =>
    Response.json(
      String(input).endsWith("/user") ? { id: account, is_anonymous: false } : rows,
    ),
  );
  const verify = createBetaPrincipalVerifier(
    issuer,
    "synthetic-public-key",
    request,
    pin,
  );
  const bind = vi.fn(async () => ({ read: async () => Response.json({}) }));
  const authorize = createOAuthAuthorizer({
    issuer,
    resource,
    key: keys.publicKey,
    isGrantActive: async (...args) => (await verify(...args)) !== null,
    bindBackend: bind,
  });
  const token = (patch: Record<string, unknown> = {}, key = keys.privateKey) =>
    new SignJWT({ ...claims, ...patch })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .sign(key);
  const call = async (value: string) =>
    authorize(new Request(resource, { headers: { Authorization: "Bearer " + value } }));
  return {
    issuer,
    resource,
    pin,
    claims,
    metadata,
    request,
    bind,
    token,
    call,
    keys,
    setRows(v: unknown) {
      rows = v;
    },
  };
}

it("binds a genuinely verified JWT to the same-bearer version1 live grant without exposing tokens to Backend", async () => {
  const q = await fixture(),
    token = await q.token();
  expect(await q.call(token)).toMatchObject({ accountId: q.claims.sub });
  expect(q.request).toHaveBeenCalledTimes(2);
  for (const [url, init] of q.request.mock.calls) {
    expect(String(url)).toMatch(
      /^https:\/\/isolated.invalid\/auth\/v1\/(user|user\/oauth\/grants)$/,
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer " + token);
    expect(new Headers(init?.headers).get("X-OTR-Consent-Version")).toBe("1");
    expect(init?.redirect).toBe("error");
  }
  expect(await q.call(token)).not.toHaveProperty("accessToken");
  expect(q.bind).toHaveBeenCalledTimes(2);
});

it.each([
  "policy",
  "grant",
  "evidence",
  "scope",
  "missingPolicy",
  "missingEvidence",
  "futureIat",
  "foreignIssuer",
  "badSignature",
])("rejects signed-context problem %s before granting Backend ports", async (change) => {
  const q = await fixture();
  const patch: Record<string, unknown> = {};
  switch (change) {
    case "policy":
      patch.otr_policy = { ...q.claims.otr_policy, hash: "b".repeat(64) };
      break;
    case "grant":
      patch.otr_consent_id = randomUUID();
      break;
    case "evidence":
      patch.otr_grant_evidence_id = randomUUID();
      break;
    case "scope":
      patch.scope = "openid profile";
      break;
    case "missingPolicy":
      patch.otr_policy = undefined;
      break;
    case "missingEvidence":
      patch.otr_grant_evidence_id = undefined;
      break;
    case "futureIat":
      patch.iat = q.claims.iat + 600;
      break;
    case "foreignIssuer":
      patch.iss = "https://foreign.invalid/auth/v1";
      break;
  }
  const key =
    change === "badSignature"
      ? (await generateKeyPair("ES256")).privateKey
      : q.keys.privateKey;
  expect(await q.call(await q.token(patch, key))).toBeNull();
  expect(q.bind).not.toHaveBeenCalled();
  if (change === "badSignature" || change === "foreignIssuer")
    expect(q.request).not.toHaveBeenCalled();
});

it.each([
  "missing",
  "revoked",
  "evidence",
  "grant",
  "policy",
  "resource",
  "expiry",
  "scope",
  "duplicate",
  "tooShortLifetime",
])("rejects live grant %s despite a valid signed token", async (change) => {
  const q = await fixture();
  const metadata = { ...q.metadata };
  let row: Record<string, unknown> = {
    client: { id: q.claims.client_id },
    scopes: ["openid", "offline_access"],
    granted_at: new Date(Date.now() - 1000).toISOString(),
    consent: metadata,
  };
  switch (change) {
    case "missing":
      delete row.consent;
      break;
    case "evidence":
      metadata.evidence_id = randomUUID();
      break;
    case "grant":
      metadata.grant_id = randomUUID();
      break;
    case "policy":
      metadata.policy_hash = "b".repeat(64);
      break;
    case "resource":
      metadata.resource = "https://other.invalid/mcp";
      break;
    case "expiry":
      metadata.expires_at = new Date(Date.now() - 1000).toISOString();
      break;
    case "scope":
      row = { ...row, scopes: ["openid"] };
      break;
    case "tooShortLifetime":
      metadata.expires_at = new Date(Date.now() + 1000).toISOString();
      break;
  }
  q.setRows(change === "revoked" ? [] : change === "duplicate" ? [row, row] : [row]);
  expect(await q.call(await q.token())).toBeNull();
  expect(q.bind).not.toHaveBeenCalled();
});

it("refuses host activation when policy permissions do not exactly match the frozen capabilities", async () => {
  const q = await fixture();
  expect(() =>
    createBetaOAuthHandler({
      issuer: q.issuer,
      resource: q.resource,
      publishableKey: "synthetic-public-key",
      key: q.keys.publicKey,
      consentPolicy: q.pin,
      dependencies: {} as never,
    }),
  ).toThrow("BETA_CONSENT_CAPABILITY_PIN_MISMATCH");
});
