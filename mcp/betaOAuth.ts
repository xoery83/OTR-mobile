import { Buffer } from "node:buffer";
import type { RiskAdmission } from "../backend/src/mcpRiskAdmission";
import type { createInChatConfirmationProbe } from "./inChatConfirmation";
import type { BetaEvidence } from "./betaEvidence";
import { z } from "zod";
import { createRequestBoundary, readBoundedJson } from "../src/data/api/requestBoundary";
import {
  classifySupabaseAuthAccount,
  isNormalAccount,
} from "../backend/src/authAccountQualification";
import { createMcpBetaAccountBinding } from "../backend/src/mcpBetaAccountBinding";
import type { BackendDependencies } from "../backend/src/app";
import {
  createOAuthAuthorizer,
  protectedResourceMetadata,
  type OAuthGrant,
  type OAuthOptions,
} from "./oauth";
import {
  betaCapabilities,
  createBetaMcpHandler,
  parseBetaCall,
  type FirstPartyApprovalPort,
} from "./beta";

import {
  mcpConsentPolicyPinSchema,
  mcpConsentClaimsSchema,
  mcpConsentGrantSchema,
  matchesConsentScopes,
  type McpConsentPolicyPin,
} from "../src/data/auth/mcpOAuthConsentContract";

export const managedDevBetaIssuer = "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1";
export const managedDevBetaResource = "https://api-dev.xoery.art/mcp";

const userSchema = z.object({
  id: z.uuid(),
  is_anonymous: z.literal(false),
  deleted_at: z.string().nullish(),
  banned_until: z.string().nullish(),
});
const grantsSchema = z
  .array(
    z.object({
      client: z.object({ id: z.uuid() }),
      scopes: z.array(z.string()).max(32),
      granted_at: z.iso.datetime({ offset: true }),
    }),
  )
  .max(256);
export function createBetaPrincipalVerifier(
  issuer: string,
  publishableKey: string,
  request: typeof fetch = fetch,
  consentPolicy?: McpConsentPolicyPin,
) {
  const origin = new URL(issuer);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/auth/v1"
  )
    throw Error("INVALID_BETA_ISSUER");
  const pin = consentPolicy && mcpConsentPolicyPinSchema.parse(consentPolicy);
  if (
    pin &&
    pin.policy.resource !== origin.origin + "/mcp" &&
    !(issuer === managedDevBetaIssuer && pin.policy.resource === managedDevBetaResource)
  )
    throw Error("INVALID_BETA_CONSENT_POLICY");
  return async (
    grant: Pick<OAuthGrant, "accountId" | "clientId" | "resource" | "expiresAt">,
    parent: AbortSignal,
    evidence: Readonly<{ accessToken: string }>,
  ) => {
    const boundary = createRequestBoundary(10000, parent);
    try {
      const current = () => {
        boundary.assertCurrent();
        if (grant.expiresAt <= Date.now()) throw Error("MCP_GRANT_EXPIRED");
      };
      // The outer OAuth authorizer verifies this same bearer before these claims are decoded.
      const bound = pin
        ? mcpConsentClaimsSchema.parse(
            JSON.parse(
              Buffer.from(
                z
                  .string()
                  .max(8192)
                  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
                  .parse(evidence.accessToken)
                  .split(".")[1],
                "base64url",
              ).toString("utf8"),
            ),
          )
        : undefined;
      if (pin && bound) {
        const session = z
          .object({ sessionId: z.uuid(), scopes: z.array(z.string()) })
          .parse(grant);
        if (
          bound.iss !== issuer ||
          bound.aud !== pin.policy.resource ||
          grant.resource !== bound.aud ||
          bound.sub !== grant.accountId ||
          bound.client_id !== grant.clientId ||
          bound.session_id !== session.sessionId ||
          bound.exp * 1000 !== grant.expiresAt ||
          bound.iat > Math.floor(Date.now() / 1000) ||
          !matchesConsentScopes(bound.scope, pin) ||
          JSON.stringify(bound.otr_scopes) !==
            JSON.stringify(pin.policy.business_scopes) ||
          JSON.stringify(session.scopes) !== JSON.stringify(bound.otr_scopes) ||
          bound.otr_policy.id !== pin.policy.id ||
          bound.otr_policy.version !== pin.policy.version ||
          bound.otr_policy.hash !== pin.policyHash
        )
          return null;
      }
      const get = async (path: "/user" | "/user/oauth/grants") => {
        current();
        const response = await boundary.run(() =>
          request(issuer + path, {
            method: "GET",
            redirect: "error",
            signal: boundary.signal,
            headers: {
              apikey: publishableKey,
              Authorization: `Bearer ${evidence.accessToken}`,
              ...(pin ? { "X-OTR-Consent-Version": "1" } : {}),
            },
          }),
        );
        if (!response.ok) {
          await response.body?.cancel();
          throw Error("MCP_PROVIDER_REJECTED");
        }
        return readBoundedJson(response, 65536, boundary);
      };
      const user = userSchema.parse(await get("/user"));
      const account = classifySupabaseAuthAccount(user);
      if (
        !account ||
        !isNormalAccount(account) ||
        account.id !== grant.accountId ||
        user.deleted_at ||
        (user.banned_until && Date.parse(user.banned_until) > Date.now())
      )
        return null;
      const rawGrants = await get("/user/oauth/grants");
      const grants = (
        pin
          ? z
              .array(
                grantsSchema.element.extend({
                  consent: mcpConsentGrantSchema.optional(),
                }),
              )
              .max(256)
          : grantsSchema
      ).parse(rawGrants);
      const exact = grants.filter((g) => g.client.id === grant.clientId);
      current();
      if (pin && bound) {
        const metadata =
          exact.length === 1 && "consent" in exact[0]
            ? mcpConsentGrantSchema.safeParse(exact[0].consent)
            : undefined;
        if (!metadata?.success) return null;
        const c = metadata.data;
        if (
          c.grant_id !== bound.otr_consent_id ||
          c.evidence_id !== bound.otr_grant_evidence_id ||
          c.policy_id !== pin.policy.id ||
          c.policy_version !== pin.policy.version ||
          c.policy_hash !== pin.policyHash ||
          c.resource !== pin.policy.resource ||
          Date.parse(c.expires_at) <= Date.now() ||
          bound.exp * 1000 > Date.parse(c.expires_at) ||
          !matchesConsentScopes(exact[0].scopes.join(" "), pin)
        )
          return null;
      }
      return exact.length === 1 &&
        exact[0].scopes.includes("openid") &&
        Date.parse(exact[0].granted_at) <= Date.now()
        ? account
        : null;
    } catch {
      return null;
    } finally {
      boundary.close();
    }
  };
}
export function createBetaOAuthHandler(options: {
  issuer: string;
  resource: string;
  publishableKey: string;
  consentPolicy?: McpConsentPolicyPin;
  key: OAuthOptions["key"];
  dependencies: BackendDependencies;
  providerRequest?: typeof fetch;
  evidence?: (event: BetaEvidence) => void;
  acceptanceCaptureReady?: (event: BetaEvidence) => boolean;
  operationApproval?: FirstPartyApprovalPort;
  riskBasedWrites?: boolean;
  riskAdmission?: RiskAdmission;
  inChatProbe?: ReturnType<typeof createInChatConfirmationProbe>;
  metadataPort?: Parameters<typeof createMcpBetaAccountBinding>[2];
  lifecyclePort?: Parameters<typeof createMcpBetaAccountBinding>[3];
  acceptanceResponseLoss?: Parameters<typeof createMcpBetaAccountBinding>[4];
  operationApprovalCapability?: "otr.trip.update" | "otr.trip.delete";
  buildBackend?: Parameters<typeof createMcpBetaAccountBinding>[5];
  expectedPrincipal?: Readonly<{ accountId: string; clientId: string }>;
}) {
  if (options.consentPolicy) {
    if (options.consentPolicy.policy.resource !== options.resource)
      throw Error("INVALID_BETA_CONSENT_POLICY");
    const permissions = options.consentPolicy.policy.permissions;
    if (
      permissions.length !== betaCapabilities.length ||
      betaCapabilities.some((c) => !permissions.includes(c.capabilityId))
    )
      throw Error("BETA_CONSENT_CAPABILITY_PIN_MISMATCH");
  }
  const verifyCurrent = createBetaPrincipalVerifier(
    options.issuer,
    options.publishableKey,
    options.providerRequest,
    options.consentPolicy,
  );
  const expected = options.expectedPrincipal;
  const preserveCompletedWriteReceipt =
    !!expected &&
    !!options.consentPolicy &&
    options.issuer === managedDevBetaIssuer &&
    options.resource === managedDevBetaResource;
  const verify: typeof verifyCurrent = (grant, signal, evidence) =>
    expected &&
    (grant.accountId !== expected.accountId || grant.clientId !== expected.clientId)
      ? Promise.resolve(null)
      : verifyCurrent(grant, signal, evidence);
  const binding = createMcpBetaAccountBinding(
    options.dependencies,
    verify,
    options.metadataPort,
    options.lifecyclePort,
    options.acceptanceResponseLoss,
    options.buildBackend,
    preserveCompletedWriteReceipt,
  );
  const authorize = createOAuthAuthorizer({
    issuer: options.issuer,
    resource: options.resource,
    key: options.key,
    isGrantActive: async (grant, signal, evidence) =>
      (await verify(grant, signal, evidence)) !== null,
    onInactiveGrant: options.evidence
      ? (grant, request) => {
          const rpc = z
            .object({
              method: z.literal("tools/call"),
              params: z.object({
                name: z.string().max(100),
                arguments: z.object({
                  call: z.unknown(),
                  mode: z.enum(["READ", "PREVIEW", "APPLY"]).optional(),
                  idempotencyKey: z.uuid().optional(),
                  previewDigest: z
                    .string()
                    .regex(/^[a-f0-9]{64}$/)
                    .optional(),
                }),
              }),
            })
            .safeParse(request.body);
          if (!rpc.success) return;
          const parsed = parseBetaCall(rpc.data.params.arguments.call);
          if (rpc.data.params.name !== parsed.capability.toolName) return;
          options.evidence!({
            event: "AUTH_GRANT_REJECTED",
            accountId: grant.accountId,
            clientId: grant.clientId,
            resource: grant.resource,
            capabilityId: parsed.capability.capabilityId,
            data: {
              call: parsed.call,
              toolName: rpc.data.params.name,
              mode:
                rpc.data.params.arguments.mode ??
                (parsed.capability.effect === "READ" ? "READ" : "PREVIEW"),
              idempotencyKey: rpc.data.params.arguments.idempotencyKey,
              previewDigest: rpc.data.params.arguments.previewDigest,
              method: request.method,
              pathname: request.pathname,
              verifiedTokenScopes: grant.scopes,
              verifiedGrantExpiresAt: grant.expiresAt,
              reason: "SIGNATURE_VALID_CURRENT_PRINCIPAL_OR_GRANT_RECHECK_FAILED",
              executed: false,
              httpStatus: 401,
            },
          });
        }
      : undefined,
    bindBackend: binding,
  });
  return createBetaMcpHandler({
    resource: options.resource,
    authorize,
    evidence: options.evidence,
    acceptanceCaptureReady: options.acceptanceCaptureReady,
    preserveCompletedWriteReceipt,
    operationApproval: options.operationApproval,
    operationApprovalCapability: options.operationApprovalCapability,
    inChatProbe: options.inChatProbe,
    riskBasedWrites: options.riskBasedWrites,
    riskAdmission: options.riskAdmission,
    oauth: protectedResourceMetadata(options.resource, options.issuer, {
      read: ["openid"],
      write: ["openid"],
    }),
  });
}

// Advertise only identity scopes accepted by the canonical Beta consent policy.
export function betaProviderMetadata(raw: unknown, issuer: string) {
  const metadata = z
    .object({ issuer: z.literal(issuer), scopes_supported: z.array(z.string()).max(32) })
    .passthrough()
    .parse(raw);
  if (!metadata.scopes_supported.includes("openid")) throw Error("BETA_OPENID_REQUIRED");
  return {
    ...metadata,
    scopes_supported: metadata.scopes_supported.filter(
      (scope) => scope === "openid" || scope === "offline_access",
    ),
  };
}
