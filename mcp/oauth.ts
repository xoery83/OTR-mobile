import { jwtVerify, type JWTVerifyGetKey, type CryptoKey } from "jose";
import { z } from "zod";
import type { BackendRead } from "./read";
import type { BackendMutation } from "./mutation";
import type { McpAuthorization } from "./server";

export type OAuthGrant = Readonly<{
  accountId: string;
  clientId: string;
  tokenId: string;
  resource: string;
  scopes: readonly string[];
  expiresAt: number;
}>;
export type OAuthOptions = {
  issuer: string;
  resource: string;
  key: JWTVerifyGetKey | CryptoKey;
  // Auth owns grant/revocation and binding; no bearer token is forwarded to Backend.
  isGrantActive: (grant: OAuthGrant, signal: AbortSignal) => Promise<boolean>;
  bindBackend: (
    grant: OAuthGrant,
    signal: AbortSignal,
  ) => Promise<{ read: BackendRead; backend?: BackendMutation }>;
};
const claims = z.object({
  sub: z.uuid(),
  client_id: z.string().min(1).max(2048),
  jti: z.string().min(1).max(256).optional(),
  session_id: z.uuid().optional(),
  scope: z.string().max(1024),
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
          requiredClaims: ["sub", "aud", "iss", "exp", "iat", "client_id", "scope"],
        },
      );
      if (protectedHeader.typ !== "JWT" && protectedHeader.typ !== "at+jwt") return null;
      const c = claims.parse(payload),
        scopes = [...new Set(c.scope.split(" ").filter(Boolean))];
      if (!scopes.includes("otr.trips.read") || !(c.jti ?? c.session_id)) return null;
      const grant: OAuthGrant = Object.freeze({
        accountId: c.sub,
        clientId: c.client_id,
        tokenId: (c.jti ?? c.session_id)!,
        resource: options.resource,
        scopes,
        expiresAt: c.exp * 1000,
      });
      if (!(await options.isGrantActive(grant, request.signal))) return null;
      const ports = await options.bindBackend(grant, request.signal);
      request.signal.throwIfAborted();
      return { ...grant, ...ports };
    } catch {
      return null;
    }
  };
}
export function protectedResourceMetadata(resource: string, issuer: string) {
  const r = new URL(resource),
    a = new URL(issuer);
  if (
    r.protocol !== "https:" ||
    r.pathname !== "/mcp" ||
    a.protocol !== "https:" ||
    [r, a].some((u) => u.username || u.password || u.hash || u.search)
  )
    throw Error("INVALID_OAUTH_CONFIGURATION");
  const metadataUrl = r.origin + "/.well-known/oauth-protected-resource/mcp";
  const metadata = Object.freeze({
    resource,
    authorization_servers: [issuer],
    scopes_supported: ["otr.trips.read", "otr.trips.write"],
    bearer_methods_supported: ["header"],
  });
  return {
    metadataUrl,
    challenge: `Bearer resource_metadata="${metadataUrl}", scope="otr.trips.read"`,
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
