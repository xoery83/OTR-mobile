import { mcpProviderCallbackPath } from "../../src/data/auth/mcpBrowserProvider";

const paths = [
  "/mcp",
  "/mcp/approve",
  "/.well-known/oauth-protected-resource/mcp",
  "/oauth/consent",
  "/oauth/consent/config",
  "/oauth/consent/app.js",
];

// Matches the owning MCP parser's 16KiB cap BEFORE Node buffers the body.
export function mcpIngressBodyLimit(path: string, method: string, managedNative = false): number | null {
  if (managedNative && /^\/mcp\/operation-approvals\/[0-9a-f-]{36}$/.test(path))
    return method === "POST" ? 4096 : 0;
  if (managedNative && path === mcpProviderCallbackPath) return 0;
  if (!paths.includes(path)) return null;
  if (managedNative && path === "/oauth/consent" && method === "POST") return 4096;
  return path === "/mcp" && method === "POST" ? 16384 : 0;
}
