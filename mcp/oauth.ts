import { jwtVerify, type JWTVerifyGetKey, type CryptoKey } from "jose";
import { z } from "zod";
import type { BackendRead } from "./read";
import type { BackendMutation } from "./mutation";
import type { McpAuthorization } from "./server";

export type OAuthGrant = Readonly<{
  accountId: string;
  clientId: string;
  tokenId: string;
  sessionId: string;
  resource: string;
  scopes: readonly string[];
  expiresAt: number;
}>;
export type OAuthOptions = {
  issuer: string;
  resource: string;
  key: JWTVerifyGetKey | CryptoKey;
  // Auth owns grant/revocation and binding; no bearer token is forwarded to Backend.
  isGrantActive: (
    grant: OAuthGrant,
    signal: AbortSignal,
    evidence: Readonly<{ accessToken: string }>,
  ) => Promise<boolean>;
  bindBackend: (
    grant: OAuthGrant,
    signal: AbortSignal,
  ) => Promise<{ read: BackendRead; backend?: BackendMutation }>;
};
const claims = z.object({
  sub: z.uuid(),
  client_id: z.string().min(1).max(2048),
  jti: z.string().min(1).max(256).optional(),
  session_id: z.uuid(),
  otr_scopes: z
    .array(z.enum(["otr.trips.read", "otr.trips.write"]))
    .min(1)
    .max(2)
    .refine((scopes) => new Set(scopes).size === scopes.length),
  exp: z.number().int().positive(),
  role: z.literal("authenticated"),
});
export function createOAuthAuthorizer(options: OAuthOptions) {
  for (const value of [options.issuer, options.resource]) {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.hash || u.search)
      throw Error("INVALID_OAUTH_CONFIGURATION");
  }
  return async (request: Request): Promise<McpAuthorization | null> => {
    const bearer = request.headers.get("authorization");
    if (!bearer || !/^Bearer [A-Za-z0-9._~-]+$/.test(bearer) || bearer.length > 8192)
      return null;
    try {
      const { payload, protectedHeader } = await jwtVerify(
        bearer.slice(7),
        options.key as JWTVerifyGetKey,
        {
          issuer: options.issuer,
          audience: options.resource,
          algorithms: ["ES256", "RS256"],
          requiredClaims: [
            "sub",
            "aud",
            "iss",
            "exp",
            "iat",
            "client_id",
            "session_id",
            "otr_scopes",
          ],
        },
      );
      if (protectedHeader.typ !== "JWT" && protectedHeader.typ !== "at+jwt") return null;
      const c = claims.parse(payload),
        scopes = c.otr_scopes;
      if (!scopes.includes("otr.trips.read")) return null;
      const grant: OAuthGrant = Object.freeze({
        accountId: c.sub,
        clientId: c.client_id,
        tokenId: c.jti ?? c.session_id,
        sessionId: c.session_id,
        resource: options.resource,
        scopes,
        expiresAt: c.exp * 1000,
      });
      // Only the Auth-owned verifier receives the bearer, for checks with its own issuer.
      if (
        !(await options.isGrantActive(grant, request.signal, {
          accessToken: bearer.slice(7),
        }))
      )
        return null;
      const ports = await options.bindBackend(grant, request.signal);
      request.signal.throwIfAborted();
      return { ...grant, ...ports };
    } catch {
      return null;
    }
  };
}
export function protectedResourceMetadata(
  resource: string,
  issuer: string,
  authorizationScopes: { read: readonly string[]; write?: readonly string[] } = {
    read: ["otr.trips.read"],
    write: ["otr.trips.read", "otr.trips.write"],
  },
) {
  const r = new URL(resource),
    a = new URL(issuer);
  if (
    r.protocol !== "https:" ||
    r.pathname !== "/mcp" ||
    a.protocol !== "https:" ||
    [r, a].some((u) => u.username || u.password || u.hash || u.search)
  )
    throw Error("INVALID_OAUTH_CONFIGURATION");
  const scopeSet = z
    .array(z.string().regex(/^[\x21\x23-\x5B\x5D-\x7E]+$/))
    .min(1)
    .max(16);
  const scopes = Object.freeze({
    read: Object.freeze(scopeSet.parse(authorizationScopes.read)),
    ...(authorizationScopes.write
      ? { write: Object.freeze(scopeSet.parse(authorizationScopes.write)) }
      : {}),
  });
  const metadataUrl = r.origin + "/.well-known/oauth-protected-resource/mcp";
  const metadata = Object.freeze({
    resource,
    authorization_servers: [issuer],
    scopes_supported: [...new Set([...scopes.read, ...(scopes.write ?? [])])],
    bearer_methods_supported: ["header"],
  });
  return {
    metadataUrl,
    authorizationScopes: scopes,
    challenge: `Bearer resource_metadata="${metadataUrl}", scope="${scopes.read.join(" ")}"`,
    handle(request: Request): Response | null {
      const url = new URL(request.url);
      if (url.href !== metadataUrl) return null;
      return Response.json(
        request.method === "GET" ? metadata : { error: "METHOD_NOT_ALLOWED" },
        {
          status: request.method === "GET" ? 200 : 405,
          headers: {
            "Cache-Control": "no-store",
            ...(request.method === "GET" ? {} : { Allow: "GET" }),
          },
        },
      );
    },
  };
}
