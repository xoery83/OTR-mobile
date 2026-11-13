// Optional Host composition only. No caller/config means no C02 routes; Root owns installation.
import { createRemoteJWKSet } from "jose";
import {
  createMcpAccountWriteBinding,
  type McpWriteStageDiagnostic,
} from "../backend/src/mcpAccountWriteBinding";
import { createSupabaseDevMcpWriteGrantVerifier } from "../backend/src/mcpOAuthGrantVerifier";
import { createMcpConsentPage } from "../backend/src/mcpConsentPage";
import type { ReadPorts } from "../backend/src/mcpAccountReadBinding";
import { createOAuthAuthorizer, protectedResourceMetadata } from "./oauth";
import { createMcpHandler, type McpOptions } from "./server";
import { c02ExecutionPlan, restrictC02Execution } from "./c02Execution";
import { z } from "zod";
import { mutationIdentity } from "./mutation";

export const c02HostConfig = z
  .strictObject({
    plan: c02ExecutionPlan,
    confirmations: z
      .array(
        z.strictObject({
          gateSHA256: z.string().regex(/^[0-9a-f]{64}$/),
          operationId: z.uuid(),
          previewDigest: z.string().regex(/^[0-9a-f]{64}$/),
          sourceThreadId: z.enum([
            "01a18663-48af-7b80-9fac-408bfa98e2fb",
            "01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232",
          ]),
          sourceMessageId: z.uuid(),
          sourceEvidenceSHA256: z.string().regex(/^[0-9a-f]{64}$/),
        }),
      )
      .max(1),
  })
  .superRefine((c, ctx) => {
    const command = c.plan.command;
    if (
      c.confirmations.some(
        (q) =>
          !command ||
          q.gateSHA256 !== c.plan.gateSHA256 ||
          q.operationId !== command.operationId ||
          q.previewDigest !==
            mutationIdentity("1f3d7935-1bdc-4952-8d7f-0f72077368c1", {
              kind: "ITEM",
              command,
              summary: "",
            }).preview_digest,
      )
    )
      ctx.addIssue({ code: "custom", message: "C02_CONFIRMATION_BINDING_REQUIRED" });
  });

// Only Root's protected private config may supply this record after verifying the human source bytes.
export function createC02ConfiguredHost(input?: {
  rawConfig: string;
  ports: ReadPorts;
  publishableKey: string;
  consentJavascript: Uint8Array;
  log?: McpOptions["log"];
  diagnostic?(event: McpWriteStageDiagnostic): void;
}) {
  if (!input) return createC02Host();
  const config = c02HostConfig.parse(JSON.parse(input.rawConfig));
  return createC02Host({
    ...input,
    plan: config.plan,
    confirm: async (q) =>
      config.confirmations.some(
        (c) =>
          c.operationId === q.operationIds[0] &&
          q.operationIds.length === 1 &&
          c.previewDigest === q.digest,
      ),
  });
}

export function createC02Host(input?: {
  plan: unknown;
  ports: ReadPorts;
  publishableKey: string;
  consentJavascript: Uint8Array;
  // Pure trusted confirmation-table lookup; not a browser prompt or model boolean.
  confirm: NonNullable<McpOptions["confirm"]>;
  log?: McpOptions["log"];
  diagnostic?(event: McpWriteStageDiagnostic): void;
}): (request: Request) => Promise<Response | null> {
  if (!input) return async () => null;
  const plan = c02ExecutionPlan.parse(input.plan);
  const resource = "https://api-dev.xoery.art/mcp";
  const issuer = "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1";
  const clientId = "83504d3f-59d4-43fd-99b1-bebc54c40f7d";
  const accountId = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
  const active = createSupabaseDevMcpWriteGrantVerifier({
    clientId,
    publishableKey: input.publishableKey,
    consentNotBefore: plan.startsAt,
  });
  const authorize = createOAuthAuthorizer({
    issuer,
    resource,
    key: createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"), {
      timeoutDuration: 5000,
    }),
    isGrantActive: (grant, signal, evidence) =>
      grant.accountId === accountId && Date.now() < plan.normalCloseAt
        ? active(grant, signal, evidence)
        : Promise.resolve(false),
    bindBackend: async (grant, signal, evidence) =>
      createMcpAccountWriteBinding({
        ...input.ports,
        diagnostic: input.diagnostic,
        isWriteGrantCurrent: (current, checkSignal) =>
          current.accountId === accountId && Date.now() < plan.normalCloseAt
            ? active(current, checkSignal, evidence)
            : Promise.resolve(false),
      })(grant, signal),
  });
  const mcp = createMcpHandler(
    restrictC02Execution(
      {
        resource,
        authorize,
        confirm: input.confirm,
        log: input.log,
        oauth: protectedResourceMetadata(resource, issuer, {
          read: ["openid"],
          write: ["openid", "offline_access"],
        }),
      },
      plan,
    ),
  );
  const page = createMcpConsentPage(
    {
      clientId,
      redirectUris: ["https://chatgpt.com/connector/oauth/CYUxrs56rSrW"],
      accountIds: [accountId],
      publishableKey: input.publishableKey,
      qaEmail: "otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app",
      expiresAt: plan.normalCloseAt,
      businessAccess: "READ_WRITE",
    },
    input.consentJavascript,
  );
  return async (request) => {
    const url = new URL(request.url);
    if (
      ![
        "/mcp",
        "/.well-known/oauth-protected-resource/mcp",
        "/oauth/consent",
        "/oauth/consent/config",
        "/oauth/consent/app.js",
      ].includes(url.pathname)
    )
      return null;
    if (url.host !== "api-dev.xoery.art") return new Response(null, { status: 404 });
    if (Date.now() < plan.startsAt || Date.now() >= plan.normalCloseAt)
      return Response.json({ error: "C02_CLOSED" }, { status: 503 });
    // Same qualified private HTTP hop as existing Host; never trust Forwarded headers.
    const external = new Request(new URL(url.pathname + url.search, resource), request);
    const response = page(external) ?? (await mcp(external));
    if (Date.now() >= plan.normalCloseAt) {
      await response.body?.cancel().catch(() => undefined);
      return Response.json({ error: "C02_CLOSED" }, { status: 503 });
    }
    return response;
  };
}
