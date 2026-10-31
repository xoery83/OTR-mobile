import { Buffer } from "node:buffer";
import { z } from "zod";
import { createRequestBoundary, readBoundedJson } from "@/data/api/requestBoundary";
import { classifySupabaseAuthAccount, isNormalAccount } from "./authAccountQualification";
import { isSupabaseDevPublicKey } from "@/data/auth/devSupabasePublicKey";

const issuer = "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1";
const resource = "https://api-dev.xoery.art/mcp";
const readScopes = z.tuple([z.literal("otr.trips.read")]);
export const mcpReadGrantSchema = z.object({
  accountId: z.uuid(),
  clientId: z.uuid(),
  sessionId: z.uuid(),
  resource: z.literal(resource),
  scopes: readScopes,
  expiresAt: z.number().int().positive(),
});
export type McpVerifiedGrant = Readonly<{
  accountId: string;
  clientId: string;
  sessionId: string;
  resource: string;
  scopes: readonly string[];
  expiresAt: number;
}>;
const tokenClaims = z.object({
  iss: z.literal(issuer),
  aud: z.literal(resource),
  sub: z.uuid(),
  client_id: z.uuid(),
  session_id: z.uuid(),
  role: z.literal("authenticated"),
  exp: z.number().int().positive(),
  otr_scopes: readScopes,
});
const userSchema = z.object({
  id: z.uuid(),
  is_anonymous: z.literal(false),
  banned_until: z.iso.datetime({ offset: true }).nullish(),
  deleted_at: z.iso.datetime({ offset: true }).nullish(),
});
// Installed auth-js OAuthGrant[]: client.id, scopes and granted_at, not an envelope.
const providerGrants = z
  .array(
    z.object({
      client: z.object({ id: z.uuid() }),
      scopes: z.array(z.string().max(256)).max(32),
      granted_at: z.iso.datetime({ offset: true }),
    }),
  )
  .max(256);

// Candidate only: no caller/mount or environment flag activates this policy.
export function createSupabaseDevMcpGrantVerifier(
  policy?: Readonly<{ clientId: string; publishableKey: string }>,
  request: typeof fetch = fetch,
) {
  const approved =
    policy &&
    z
      .object({
        clientId: z.uuid(),
        publishableKey: z
          .string()
          .min(1)
          .max(4096)
          .regex(/^[^\r\n]+$/)
          .refine(isSupabaseDevPublicKey, "PUBLIC_DEV_KEY_REQUIRED"),
      })
      .parse(policy);

  // Caller must already verify this SAME bearer's signature/issuer/audience/expiry.
  // Decoding below only detects accidental claims/bearer substitution, never grants authority.
  return async (
    input: McpVerifiedGrant,
    signal: AbortSignal,
    evidence: Readonly<{ accessToken: string }>,
  ): Promise<boolean> => {
    if (!approved) return false;
    const boundary = createRequestBoundary(10000, signal);
    try {
      const grant = mcpReadGrantSchema.parse(input);
      const token = z
        .string()
        .max(8192)
        .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
        .parse(evidence.accessToken);
      const claims = tokenClaims.parse(
        JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")),
      );
      if (
        grant.clientId !== approved.clientId ||
        claims.sub !== grant.accountId ||
        claims.client_id !== grant.clientId ||
        claims.session_id !== grant.sessionId ||
        claims.exp * 1000 !== grant.expiresAt
      )
        return false;
      const assertFresh = () => {
        boundary.assertCurrent();
        if (Date.now() >= grant.expiresAt) throw Error("MCP_GRANT_EXPIRED");
      };
      const read = async (path: "/user" | "/user/oauth/grants") => {
        assertFresh();
        const response = await boundary.run(() =>
          request(issuer + path, {
            method: "GET",
            redirect: "error",
            signal: boundary.signal,
            headers: {
              apikey: approved.publishableKey,
              Authorization: `Bearer ${token}`,
            },
          }),
        );
        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          throw Error("MCP_PROVIDER_REJECTED");
        }
        const body = await readBoundedJson(response, 65536, boundary);
        assertFresh();
        return body;
      };
      // Deployed Auth must prove its session lookup/ban enforcement before activation.
      const user = userSchema.parse(await read("/user"));
      const account = classifySupabaseAuthAccount(user);
      if (
        !account ||
        !isNormalAccount(account) ||
        account.id !== grant.accountId ||
        user.deleted_at ||
        (user.banned_until && Date.parse(user.banned_until) > Date.now())
      )
        return false;
      const matches = providerGrants
        .parse(await read("/user/oauth/grants"))
        .filter((entry) => entry.client.id === grant.clientId);
      assertFresh();
      return matches.length === 1 && matches[0].scopes.includes("openid");
    } catch {
      return false;
    } finally {
      boundary.close();
    }
  };
}
