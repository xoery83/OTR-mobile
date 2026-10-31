const paths = [
  "/mcp",
  "/.well-known/oauth-protected-resource/mcp",
  "/oauth/consent",
  "/oauth/consent/config",
  "/oauth/consent/app.js",
];

// Matches the owning MCP parser's 16KiB cap BEFORE Node buffers the body.
export function mcpIngressBodyLimit(path: string, method: string): number | null {
  if (!paths.includes(path)) return null;
  return path === "/mcp" && method === "POST" ? 16384 : 0;
}
