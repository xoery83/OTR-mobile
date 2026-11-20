import { mcpProviderCallbackPath } from "@/data/auth/mcpBrowserProvider";
import {
  mcpConsentConfigSchema,
  mcpBetaConsentConfigSchema,
  type McpBetaConsentConfig,
  type McpConsentConfig,
} from "@/data/auth/mcpOAuthConsentRepository";

// Explicit policy only: legacy QA retains its gate; isolated Beta supplies its own issuer.
export function createMcpConsentPage(
  config?: McpConsentConfig | McpBetaConsentConfig,
  javascript?: Uint8Array,
) {
  const beta =
    config && "authOrigin" in config ? mcpBetaConsentConfigSchema.parse(config) : null;
  const parsed = beta ?? (config && mcpConsentConfigSchema.parse(config));
  const expectedOrigin = beta
    ? new URL(beta.consentPolicy?.policy.resource ?? beta.authOrigin).origin
    : "https://api-dev.xoery.art";
  const script = javascript && new Uint8Array(javascript).buffer;
  const paths = new Set([
    "/oauth/consent",
    "/oauth/consent/config",
    "/oauth/consent/app.js",
  ]);
  if (beta?.browserProviders) paths.add(mcpProviderCallbackPath);
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": beta && !beta.managedDev
      ? "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
      : "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self' https://tuqigdxrvrerfewsxqgm.supabase.co; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  };
  return (request: Request): Response | null => {
    const url = new URL(request.url);
    if (
      (beta ? url.origin !== expectedOrigin : url.host !== "api-dev.xoery.art") ||
      !paths.has(url.pathname) ||
      !parsed ||
      !script
    )
      return null;
    if (request.method !== "GET")
      return new Response(null, { status: 405, headers: { ...headers, Allow: "GET" } });
    if (Date.now() >= parsed.expiresAt)
      return new Response(null, { status: 503, headers });
    if (url.pathname === "/oauth/consent/config")
      return Response.json(parsed, { headers });
    if (url.pathname === "/oauth/consent/app.js")
      return new Response(script, {
        headers: { ...headers, "Content-Type": "text/javascript; charset=utf-8" },
      });
    return new Response(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OTR</title><style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style></head><body><div id="root"></div><script type="module" src="/oauth/consent/app.js"></script></body></html>',
      { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } },
    );
  };
}
