import { jwtVerify } from "jose";
import { z } from "zod";
import { authenticateNormalAccount } from "../backend/src/app";
import {
  classifySupabaseAuthAccount,
  isNormalAccount,
} from "../backend/src/authAccountQualification";
import { createMcpBetaAccountBinding } from "../backend/src/mcpBetaAccountBinding";
import { createRequestBoundary, readBoundedJson } from "../src/data/api/requestBoundary";
import { type McpConsentPolicyPin } from "../src/data/auth/mcpOAuthConsentContract";
import {
  managedDevBetaIssuer as issuer,
  managedDevBetaResource as resource,
} from "./betaOAuth";
import type { OAuthGrant, OAuthOptions } from "./oauth";
import type { ManagedRenameGate } from "./managedRename";

type Session = {
  issuer: typeof issuer;
  accountId: string;
  clientId: string;
  sessionId: string;
  expiresAt: number;
};
type FirstParty = Readonly<{ accountId: string; kind: "FIRST_PARTY" }>;
export type ManagedNativeConsent = {
  version: "managed-api-v1";
  getOrCreateChallenge(
    session: Session,
    signal: AbortSignal,
  ): Promise<{ id: string; expiresAt: number }>;
  readBinding(session: Session, signal: AbortSignal): Promise<unknown>;
  inspectById(principal: FirstParty, id: string, signal: AbortSignal): Promise<unknown>;
  decideById(
    principal: FirstParty,
    id: string,
    allow: boolean,
    signal: AbortSignal,
  ): Promise<unknown>;
};

const jwtOptions = {
  issuer,
  algorithms: ["ES256", "RS256"],
  requiredClaims: ["sub", "iss", "aud", "exp", "iat"],
};
const browserAudience = "authenticated";
const firstPartyClaims = z.object({
  sub: z.uuid(),
  session_id: z.uuid(),
  iat: z.number().int(),
  exp: z.number().int(),
  role: z.literal("authenticated"),
  is_anonymous: z.literal(false),
  client_id: z.undefined().optional(),
  scope: z.undefined().optional(),
  aud: z.union([z.literal(browserAudience), z.tuple([z.literal(browserAudience)])]),
});
const bearerToken = (request: Request) => {
  const value = request.headers.get("authorization");
  return value &&
    value.length <= 8192 &&
    /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
    ? value.slice(7)
    : null;
};
const action = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("inspect"), id: z.uuid() }),
  z.strictObject({ action: z.literal("decide"), id: z.uuid(), allow: z.boolean() }),
]);
const inspection = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  policy: z.object({
    policyId: z.string(),
    policyVersion: z.string(),
    policyHash: z.string(),
  }),
  state: z.enum(["PENDING", "APPROVED", "DENIED"]),
  expiresAt: z.number().int().positive(),
});
const decision = z.object({ id: z.uuid(), decision: z.enum(["APPROVED", "DENIED"]) });
const claims = z.object({
  sub: z.uuid(),
  client_id: z.uuid(),
  session_id: z.uuid(),
  scope: z.string().max(4096).optional(),
  role: z.literal("authenticated"),
  is_anonymous: z.literal(false),
  iat: z.number().int(),
  exp: z.number().int(),
  aud: z.union([z.literal(resource), z.tuple([z.literal(resource)])]),
});
const user = z.object({
  id: z.uuid(),
  is_anonymous: z.literal(false),
  deleted_at: z.string().nullish(),
  banned_until: z.iso.datetime({ offset: true }).nullish(),
});
const binding = z.object({
  issuer: z.literal(issuer),
  accountId: z.uuid(),
  clientId: z.uuid(),
  sessionId: z.uuid(),
  evidenceId: z.uuid(),
  policyId: z.string(),
  policyVersion: z.string(),
  policyHash: z.string(),
  expiresAt: z.number().int().positive(),
});
export function managedNativeAuthorization(options: {
  key: OAuthOptions["key"];
  publishableKey: string;
  principal: { accountId: string; clientId: string };
  consent: ManagedNativeConsent;
  pin: McpConsentPolicyPin;
  closesAt: number;
  dependencies: Parameters<typeof createMcpBetaAccountBinding>[0];
  buildBackend: Parameters<typeof createMcpBetaAccountBinding>[5];
  providerRequest?: typeof fetch;
  rename?: ManagedRenameGate;
  standingWrites?: boolean;
  lifecyclePort?: Parameters<typeof createMcpBetaAccountBinding>[3];
}) {
  const pending = new WeakMap<Request, Session>();
  const readAuth = async (
    token: string,
    path: "/oauth/userinfo" | "/user" | "/user/oauth/grants",
    boundary: ReturnType<typeof createRequestBoundary>,
  ) => {
    const response = await boundary.run(() =>
      (options.providerRequest ?? fetch)(issuer + path, {
        headers: { apikey: options.publishableKey, Authorization: `Bearer ${token}` },
        cache: "no-store",
        redirect: "error",
        signal: boundary.signal,
      }),
    );
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429 || response.status >= 500)
        throw Error("MCP_ISSUER_UNAVAILABLE");
      return null;
    }
    return readBoundedJson(response, 65536, boundary);
  };
  const liveAccount = async (token: string, session: Session, signal: AbortSignal) => {
    if (Date.now() >= Math.min(session.expiresAt, options.closesAt)) return null;
    const boundary = createRequestBoundary(10000, signal);
    try {
      // The OAuth bearer must still resolve at the issuer before OTR can use its consent.
      const identity = z
        .object({ sub: z.uuid() })
        .safeParse(await readAuth(token, "/oauth/userinfo", boundary));
      if (!identity.success || identity.data.sub !== session.accountId) return null;
      const profile = await readAuth(token, "/user", boundary);
      if (profile === null) return null;
      const current = user.parse(profile);
      const account = classifySupabaseAuthAccount(current);
      return account &&
        isNormalAccount(account) &&
        account.id === session.accountId &&
        !current.deleted_at &&
        !(current.banned_until && Date.parse(current.banned_until) > Date.now())
        ? account
        : null;
    } finally {
      boundary.close();
    }
  };
  const approved = async (session: Session, signal: AbortSignal) => {
    const found = binding.safeParse(await options.consent.readBinding(session, signal));
    signal.throwIfAborted();
    if (!found.success) return null;
    const b = found.data;
    return (
      b.accountId === session.accountId &&
      b.clientId === session.clientId &&
      b.sessionId === session.sessionId &&
      b.policyHash === options.pin.policyHash &&
      b.policyId === options.pin.policy.id &&
      b.policyVersion === options.pin.policy.version &&
      b.expiresAt > Date.now() &&
      b.expiresAt <= options.closesAt
    ) ? b : null;
  };
  return {
    async operationApprover(token: string, signal: AbortSignal) {
      const boundary = createRequestBoundary(10000, signal);
      try {
        const signed = await boundary.run(() =>
          jwtVerify(token, options.key as Parameters<typeof jwtVerify>[1], {
            ...jwtOptions, audience: browserAudience,
          }),
        );
        const claims = firstPartyClaims.parse(signed.payload);
        if (signed.protectedHeader.typ !== "JWT" || claims.sub !== options.principal.accountId)
          return null;
        const current = user.parse(await readAuth(token, "/user", boundary));
        const live = classifySupabaseAuthAccount(current);
        if (!live || !isNormalAccount(live) || live.id !== claims.sub ||
            current.deleted_at || (current.banned_until && Date.parse(current.banned_until) > Date.now())) return null;
        const grants = z.array(z.object({
          client: z.object({ id: z.uuid() }),
          scopes: z.array(z.string()),
        })).parse(await readAuth(token, "/user/oauth/grants", boundary));
        boundary.signal.throwIfAborted();
        return grants.filter((entry) =>
          entry.client.id === options.principal.clientId && entry.scopes.includes("openid"),
        ).length === 1 ? { accountId: claims.sub, sessionId: claims.session_id } : null;
      } catch {
        return null;
      } finally {
        boundary.close();
      }
    },
    async confirmation(request: Request) {
      const boundary = createRequestBoundary(15000, request.signal);
      const started = Date.now();
      let stage = "request";
      let decisionId: string | undefined;
      const reply = (status: number, payload: unknown) =>
        Response.json(payload, {
          status,
          headers: {
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      try {
        const target = new URL("/oauth/consent", resource);
        if (
          request.url !== target.href ||
          request.method !== "POST" ||
          request.headers.get("origin") !== target.origin ||
          request.headers.get("content-type")?.split(";")[0].trim() !== "application/json"
        )
          return reply(403, { error: "OTR_CONSENT_UNAVAILABLE" });
        const token = bearerToken(request);
        if (!token) return reply(401, { error: "AUTH_REQUIRED" });
        stage = "first_party_jwt";
        const signed = await boundary.run(() =>
          jwtVerify(token, options.key as Parameters<typeof jwtVerify>[1], {
            ...jwtOptions,
            audience: browserAudience,
          }),
        );
        if (signed.protectedHeader.typ !== "JWT")
          return reply(401, { error: "AUTH_REQUIRED" });
        const signedAccount = firstPartyClaims.parse(signed.payload);
        if (
          signedAccount.sub !== options.principal.accountId ||
          signedAccount.iat > Math.floor(Date.now() / 1000)
        )
          return reply(401, { error: "AUTH_REQUIRED" });
        stage = "first_party_account";
        const live = await boundary.run(() =>
          authenticateNormalAccount(request, options.dependencies.gateway),
        );
        if (live.id !== signedAccount.sub) return reply(401, { error: "AUTH_REQUIRED" });
        const principal = { accountId: live.id, kind: "FIRST_PARTY" as const };
        const input = action.parse(
          await readBoundedJson(new Response(request.body), 4096, boundary),
        );
        if (input.action === "decide") decisionId = input.id;
        stage = "issuer_grant";
        // This endpoint accepts the authenticated first-party token only.
        const grants = z
          .array(
            z.object({
              client: z.object({ id: z.uuid() }),
              scopes: z.array(z.string()).max(32),
              granted_at: z.iso.datetime({ offset: true }),
            }),
          )
          .safeParse(await readAuth(token, "/user/oauth/grants", boundary));
        if (
          !grants.success ||
          grants.data.filter(
            (grant) =>
              grant.client.id === options.principal.clientId &&
              grant.scopes.includes("openid"),
          ).length !== 1
        )
          return reply(403, { error: "OTR_CONSENT_UNAVAILABLE" });
        stage = "consent_read";
        const shown = inspection.parse(
          await boundary.run(() =>
            options.consent.inspectById(principal, input.id, boundary.signal),
          ),
        );
        if (
          Date.now() >= Math.min(signedAccount.exp * 1000, options.closesAt) ||
          shown.id !== input.id ||
          shown.accountId !== live.id ||
          shown.policy.policyId !== options.pin.policy.id ||
          shown.policy.policyVersion !== options.pin.policy.version ||
          shown.policy.policyHash !== options.pin.policyHash ||
          (shown.state === "PENDING" && shown.expiresAt <= Date.now())
        )
          return reply(404, { error: "OTR_CONSENT_UNAVAILABLE" });
        if (input.action === "inspect")
          return reply(200, {
            ...shown,
            ...(options.standingWrites ? { managedWrite: true } : {}),
            ...(options.rename?.live() ? { rename: options.rename.disclosure } : {}),
          });
        if (shown.state !== "PENDING")
          return reply(409, { error: "OTR_CONSENT_UNAVAILABLE" });
        stage = "consent_decision";
        const result = decision.parse(
          await boundary.run(() =>
            options.consent.decideById(principal, input.id, input.allow, boundary.signal),
          ),
        );
        return result.id === input.id &&
          result.decision === (input.allow ? "APPROVED" : "DENIED")
          ? reply(200, result)
          : reply(409, { error: "OTR_CONSENT_UNAVAILABLE" });
      } catch (error) {
        if (decisionId) {
          console.info(JSON.stringify({
            event: "mcp_managed_consent_confirmation_failed",
            decisionId,
            stage,
            aborted: boundary.signal.aborted,
            durationMs: Date.now() - started,
          }));
        }
        const unavailable = error instanceof Error &&
          (error.message === "MCP_CONSENT_STORE_UNAVAILABLE" ||
           error.message === "MCP_ISSUER_UNAVAILABLE");
        return reply(unavailable ? 503 : 403, { error: "OTR_CONSENT_UNAVAILABLE" });
      } finally {
        boundary.close();
      }
    },
    async authorize(request: Request) {
      const token = bearerToken(request),
        signal = request.signal;
      if (!token) return null;
      let stage: "jwt" | "issuer" | "consent" | "binding" = "jwt";
      try {
        const { payload, protectedHeader } = await jwtVerify(
          token,
          options.key as Parameters<typeof jwtVerify>[1],
          {
            ...jwtOptions,
            audience: resource,
          },
        );
        if (protectedHeader.typ !== "JWT" && protectedHeader.typ !== "at+jwt")
          return null;
        const c = claims.parse(payload);
        if (
          c.sub !== options.principal.accountId ||
          c.client_id !== options.principal.clientId ||
          c.iat > Math.floor(Date.now() / 1000) ||
          (c.scope !== undefined && !c.scope.split(/\s+/).includes("openid"))
        )
          return null;
        const session: Session = {
          issuer,
          accountId: c.sub,
          clientId: c.client_id,
          sessionId: c.session_id,
          expiresAt: c.exp * 1000,
        };
        stage = "issuer";
        const verifiedAccount = await liveAccount(token, session, signal);
        if (!verifiedAccount) return null;
        stage = "consent";
        const consent = await approved(session, signal);
        if (!consent) {
          pending.set(request, session);
          return null;
        }
        const grant: OAuthGrant = {
          ...(options.standingWrites ? { managedConsent: {
            evidenceId: consent.evidenceId, sessionId: consent.sessionId, policyHash: consent.policyHash,
          } } : {}),
          accountId: session.accountId,
          clientId: session.clientId,
          tokenId: session.sessionId,
          sessionId: session.sessionId,
          resource,
          expiresAt: Math.min(session.expiresAt, options.closesAt),
          scopes: options.standingWrites || options.rename?.live()
            ? ["otr.trips.read", "otr.trips.write"]
            : ["otr.trips.read"],
        };
        stage = "binding";
        let ingressAccount: typeof verifiedAccount | null = verifiedAccount;
        const bind = createMcpBetaAccountBinding(
          options.dependencies,
          async (_grant, currentSignal) => {
            // Binding creation consumes this request's proof. Dispatch and admission recheck live.
            if (ingressAccount) {
              const initial = ingressAccount;
              ingressAccount = null;
              return initial;
            }
            const account = await liveAccount(token, session, currentSignal);
            if (!account) return null;
            const latest = await approved(session, currentSignal);
            return latest && (!grant.managedConsent || latest.evidenceId === grant.managedConsent.evidenceId)
              ? account : null;
          },
          undefined,
          options.lifecyclePort,
          undefined,
          options.buildBackend,
          true,
          (input, currentGrant) =>
            options.standingWrites === true || options.rename?.allowWrite(input, currentGrant) === true,
        );
        return { ...grant, ...(await bind(grant, signal, { accessToken: token })) };
      } catch (error) {
        if (stage === "jwt") return null;
        console.info(JSON.stringify({ event: "mcp_managed_authorization_unavailable", stage }));
        throw error;
      }
    },
    async unapproved(request: Request, signal: AbortSignal) {
      const session = pending.get(request);
      pending.delete(request);
      if (!session || request.method !== "POST") return null;
      const boundary = createRequestBoundary(10000, signal);
      try {
        const rpc = z
          .object({
            jsonrpc: z.literal("2.0"),
            method: z.string().regex(/^[A-Za-z0-9_./:-]{1,64}$/)
              .refine((method) => method !== "ping" && !method.startsWith("notifications/")),
            id: z.union([z.string().max(256), z.number().int()]),
          })
          .parse(await readBoundedJson(new Response(request.body), 16384, boundary));
        const original = await boundary.run(() =>
          options.consent.getOrCreateChallenge(session, boundary.signal),
        );
        if (
          !z.uuid().safeParse(original.id).success ||
          !Number.isSafeInteger(original.expiresAt) ||
          original.expiresAt <= Date.now() ||
          original.expiresAt >
            Math.min(session.expiresAt, options.closesAt, Date.now() + 300000)
        )
          return null;
        const url = new URL("/oauth/consent", resource);
        // The Auth Store gives the browser an opaque reference, never a proof of authority.
        url.hash = `managed=${original.id}`;
        return Response.json(
          {
            jsonrpc: "2.0",
            id: rpc.id,
            error: {
              code: -32001,
              message: "OTR_CONSENT_REQUIRED",
              data: { consentUrl: url.href, expiresAt: original.expiresAt },
            },
          },
          {
            headers: {
              "Cache-Control": "private, no-store",
              "Referrer-Policy": "no-referrer",
              Vary: "Authorization",
            },
          },
        );
      } catch {
        return null;
      } finally {
        boundary.close();
      }
    },
  };
}
