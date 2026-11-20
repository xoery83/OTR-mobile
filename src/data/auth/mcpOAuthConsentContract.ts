import { z } from "zod";

// Auth-owned wire v1; configured pins are deployment inputs, never client assertions.
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const mcpOidcScope = z.enum(["openid", "email", "offline_access"]);
const identityScopes = z
  .array(mcpOidcScope)
  .min(1)
  .max(mcpOidcScope.options.length)
  .refine((v) => v.includes("openid") && new Set(v).size === v.length);
export const mcpConsentPolicySchema = z.strictObject({
  id: z.string().min(1).max(256),
  version: z.string().min(1).max(256),
  resource: z.url(),
  permissions: z
    .array(z.string().min(1).max(256))
    .min(1)
    .max(103)
    .refine((v) => new Set(v).size === v.length),
  business_scopes: z
    .array(z.enum(["otr.trips.read", "otr.trips.write"]))
    .length(2)
    .refine((v) => new Set(v).size === v.length),
  allow_reuse: z.boolean(),
  grant_ttl_seconds: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export const mcpConsentPolicyPinSchema = z.strictObject({
  contractVersion: z.literal(1),
  policy: mcpConsentPolicySchema,
  policyHash: hash,
  identityScopes,
});
export type McpConsentPolicyPin = z.infer<typeof mcpConsentPolicyPinSchema>;
export const mcpConsentDetailsSchema = z
  .strictObject({
    contract_version: z.literal(1),
    authorization_id: z.string().min(1).max(256),
    redirect_uri: z.url(),
    client: z.strictObject({ id: z.uuid(), name: z.string().min(1).max(200) }),
    user: z.strictObject({ id: z.uuid() }),
    resource: z.url(),
    scope: z.string().min(1).max(256),
    policy: mcpConsentPolicySchema,
    policy_hash: hash,
    expires_at: z.iso.datetime({ offset: true }),
    consent: z.discriminatedUnion("decision", [
      z.strictObject({
        decision: z.literal("REQUIRED"),
        decision_id: z.uuid(),
        policy_version: z.string().min(1),
        basis: z.literal("EXPLICIT_CONSENT_REQUIRED"),
      }),
      z.strictObject({
        decision: z.literal("SATISFIED"),
        decision_id: z.uuid(),
        policy_version: z.string().min(1),
        basis: z.literal("CURRENT_POLICY_GRANT"),
        grant_id: z.uuid(),
      }),
    ]),
    redirect_url: z.url().optional(),
  })
  .refine((v) => (v.consent.decision === "SATISFIED") === (v.redirect_url !== undefined));
export type McpConsentDetails = z.infer<typeof mcpConsentDetailsSchema>;
export const mcpConsentGrantSchema = z.strictObject({
  contract_version: z.literal(1),
  grant_id: z.uuid(),
  evidence_id: z.uuid(),
  policy_id: z.string().min(1),
  policy_version: z.string().min(1),
  policy_hash: hash,
  resource: z.url(),
  expires_at: z.iso.datetime({ offset: true }),
});
export const mcpConsentClaimsSchema = z.object({
  iss: z.url(),
  aud: z.url(),
  sub: z.uuid(),
  client_id: z.uuid(),
  session_id: z.uuid(),
  scope: z.string().min(1).max(256),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  role: z.literal("authenticated"),
  otr_scopes: mcpConsentPolicySchema.shape.business_scopes,
  otr_policy: z.strictObject({ id: z.string().min(1), version: z.string().min(1), hash }),
  otr_consent_id: z.uuid(),
  otr_grant_evidence_id: z.uuid(),
});
export function matchesConsentPolicy(
  policy: z.infer<typeof mcpConsentPolicySchema>,
  policyHash: string,
  pin: McpConsentPolicyPin,
) {
  return (
    policyHash === pin.policyHash && JSON.stringify(policy) === JSON.stringify(pin.policy)
  );
}
export function isMcpOidcScopeSet(scope: unknown): boolean {
  return typeof scope === "string" && identityScopes.safeParse(scope.split(" ")).success;
}

export function matchesConsentScopes(scope: string, pin: McpConsentPolicyPin) {
  const scopes = scope.split(" ");
  return (
    scopes.length === pin.identityScopes.length &&
    isMcpOidcScopeSet(scope) &&
    pin.identityScopes.every((value) => scopes.includes(value))
  );
}
