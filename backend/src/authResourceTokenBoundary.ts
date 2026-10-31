import { Buffer } from "node:buffer";

// Additive rejection only. Passing this check NEVER authenticates a bearer.
export function isOAuthResourceToken(token: string): boolean {
  try {
    const c: unknown = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    if (!c || typeof c !== "object" || Array.isArray(c)) return false;
    const claims = c as Record<string, unknown>;
    return (
      claims.client_id != null ||
      Object.hasOwn(claims, "otr_scopes") ||
      claims.aud === "https://api-dev.xoery.art/mcp" ||
      (Array.isArray(claims.aud) && claims.aud.includes("https://api-dev.xoery.art/mcp"))
    );
  } catch {
    return false;
  }
}
