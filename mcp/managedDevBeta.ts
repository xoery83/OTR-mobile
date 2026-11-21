import { createRemoteJWKSet } from "jose";
import { z } from "zod";
import { betaCapabilities, createBetaMcpHandler } from "./beta";
import { protectedResourceMetadata } from "./oauth";
import { createManagedRenameGate } from "./managedRename";
import {
  managedNativeAuthorization,
  type ManagedNativeConsent,
} from "./managedNativeConsent";
import type { createDevBackendHandler, BackendDependencies } from "../backend/src/app";
import { createMcpConsentPage } from "../backend/src/mcpConsentPage";
import { mcpIngressBodyLimit } from "../backend/src/mcpIngress";
import { mcpBetaConsentConfigSchema } from "../src/data/auth/mcpOAuthConsentRepository";
import { isSupabaseDevPublicKey } from "../src/data/auth/devSupabasePublicKey";
import { mcpConsentPolicyPinSchema } from "../src/data/auth/mcpOAuthConsentContract";
import { createMcpRiskAdmission } from "../backend/src/mcpRiskAdmission";
import {
  createMcpOperationApprovalHandler,
  createMcpOperationApprovalService,
  createMcpOperationApprovalStore,
} from "../backend/src/mcpOperationApproval";
import type { CorePgConnection } from "../backend/src/tripCoreV2PgStorage";
import {
  createBetaOAuthHandler,
  managedDevBetaIssuer,
  managedDevBetaResource,
} from "./betaOAuth";

type ManagedDependencies = Parameters<typeof managedNativeAuthorization>[0]["dependencies"] & {
  managedMcpApprovalConnection?: CorePgConnection;
  managedTripLifecycleForGrant?: Parameters<typeof managedNativeAuthorization>[0]["lifecyclePort"];
};

// The formal Auth grant carries both scopes; the Gateway's capture gate bars writes.
export function createManagedDevBetaHandler(
  rawPolicy: unknown,
  publishableKey: string,
  dependencies: BackendDependencies,
  buildBackend?: typeof createDevBackendHandler,
  expectedPrincipal?: Readonly<{ accountId: string; clientId: string }>,
) {
  const consentPolicy = mcpConsentPolicyPinSchema.parse(rawPolicy);
  if (
    consentPolicy.policy.resource !== managedDevBetaResource ||
    !isSupabaseDevPublicKey(publishableKey)
  )
    throw Error("MANAGED_DEV_BETA_CONFIG_NOT_APPROVED");

  return createBetaOAuthHandler({
    issuer: managedDevBetaIssuer,
    resource: managedDevBetaResource,
    key: createRemoteJWKSet(new URL(managedDevBetaIssuer + "/.well-known/jwks.json")),
    publishableKey,
    consentPolicy,
    dependencies,
    buildBackend,
    expectedPrincipal,
    riskBasedWrites: true,
    acceptanceCaptureReady: () => false,
  });
}

// The existing Backend owns the mounted handler factory, Core, and network lifecycle.
export function createManagedDevConfiguredHost(
  rawConfig: string,
  publishableKey: string,
  dependencies: ManagedDependencies,
  buildBackend: typeof createDevBackendHandler,
  consentJavascript: Uint8Array,
  nativeConsent?: ManagedNativeConsent,
) {
  const { oneRename, standingWrites: rawStandingWrites, ...browserConfig } = JSON.parse(rawConfig);
  const standing = z.strictObject({ confirmationSecret: z.string().min(32) })
    .optional().parse(rawStandingWrites);
  const persistent = browserConfig.expiresAt === null;
  const config = mcpBetaConsentConfigSchema.parse({
    ...browserConfig,
    expiresAt: persistent ? Number.MAX_SAFE_INTEGER : browserConfig.expiresAt,
    authOrigin: new URL(managedDevBetaIssuer).origin + "/",
    businessAccess: "BETA_READ_WRITE",
    publishableKey,
  });
  if (
    nativeConsent &&
    (nativeConsent.version !== "managed-api-v1" ||
      [
        nativeConsent.getOrCreateChallenge,
        nativeConsent.readBinding,
        nativeConsent.decideById,
        nativeConsent.inspectById,
      ].some((member) => typeof member !== "function"))
  )
    throw Error("MANAGED_NATIVE_CONSENT_ADAPTER_INVALID");
  if (
    !config.managedDev ||
    !config.consentPolicy ||
    !isSupabaseDevPublicKey(publishableKey) ||
    config.consentPolicy.policy.permissions.length !== betaCapabilities.length ||
    betaCapabilities.some(
      (entry) => !config.consentPolicy!.policy.permissions.includes(entry.capabilityId),
    ) ||
    config.expiresAt <= Date.now() ||
    (config.managedDev.accountId === null && (!persistent || !nativeConsent)) ||
    (persistent ? oneRename !== undefined : config.expiresAt > Date.now() + 1800000) ||
    Boolean(standing) !== config.consentPolicy.policy.version.endsWith(":standing-writes") ||
    (standing && (!persistent || !nativeConsent ||
      dependencies.managedWriteAdmissionVersion !== 2 ||
      !dependencies.managedMcpApprovalConnection ||
      !dependencies.managedTripLifecycleForGrant))
  )
    throw Error("MANAGED_DEV_BETA_CONFIG_NOT_APPROVED");
  const rename = createManagedRenameGate(
    oneRename,
    config.managedDev,
    config.expiresAt,
    config.consentPolicy,
  );
  const native =
    nativeConsent &&
    managedNativeAuthorization({
      key: createRemoteJWKSet(new URL(managedDevBetaIssuer + "/.well-known/jwks.json")),
      publishableKey,
      dependencies,
      buildBackend,
      principal: config.managedDev,
      consent: nativeConsent,
      pin: config.consentPolicy,
      closesAt: config.expiresAt,
      rename,
      standingWrites: !!standing,
      lifecyclePort: standing ? dependencies.managedTripLifecycleForGrant : undefined,
    });
  const approvalConnection = standing ? dependencies.managedMcpApprovalConnection : undefined;
  const approval = standing && approvalConnection && createMcpOperationApprovalService(
    {
      accountId: config.managedDev.accountId, clientId: config.managedDev.clientId,
      kind: "TRIP_DELETE_STANDING", resource: managedDevBetaResource,
      policyHash: config.consentPolicy.policyHash,
    },
    createMcpOperationApprovalStore(approvalConnection, "MANAGED_L3_TRIP_DELETE"),
    standing.confirmationSecret,
  );
  const operationHandler = approval && native && createMcpOperationApprovalHandler({
    origin: new URL(managedDevBetaResource).origin,
    service: approval,
    authenticate: native.operationApprover,
  });
  const handler =
    native &&
    createBetaMcpHandler({
      resource: managedDevBetaResource,
      authorize: native.authorize,
      unapproved: native.unapproved,
      discoveryIdentity: native.discoveryIdentity,
      legacyTripRead: true,
      riskBasedWrites: true,
      requireFirstPartyL3: !!standing,
      preserveCompletedWriteReceipt: true,
      evidence: rename?.evidence,
      acceptanceCaptureReady: standing ? undefined : (event) => rename?.captureReady(event) === true,
      riskAdmission: approvalConnection ? createMcpRiskAdmission(approvalConnection, true) : undefined,
      operationApprovalCapability: "otr.trip.delete",
      operationApproval: approval ? approval.port : undefined,
      oauth: protectedResourceMetadata(managedDevBetaResource, managedDevBetaIssuer, {
        read: ["openid"],
        write: ["openid"],
      }),
    });
  const consent = createMcpConsentPage(
    { ...config, managedNativeOAuth: true },
    consentJavascript,
  );
  const origin = new URL(managedDevBetaResource);
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (mcpIngressBodyLimit(url.pathname, request.method, true) === null) return null;
    if (url.host !== origin.host) return new Response(null, { status: 404 });
    if (!handler || !native || Date.now() >= config.expiresAt)
      return new Response(null, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    const external = new Request(new URL(url.pathname + url.search, origin), request);
    if (operationHandler) {
      const response = await operationHandler(external);
      if (response) return response;
      if (url.pathname === "/mcp/approve" && request.method === "GET")
        return consent(new Request(new URL("/oauth/consent", origin), request));
    }
    if (url.pathname === "/oauth/consent" && request.method === "POST")
      return native.confirmation(external);
    return consent(external) ?? handler(external);
  };
}
