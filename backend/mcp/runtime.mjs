import {
  createMcpHandler,
  createOAuthAuthorizer,
  protectedResourceMetadata,
} from "@otr/mcp"; // eslint-disable-line import/no-unresolved -- Build script pins this alias to the reviewed MCP artifact, outside Mobile dependencies.
import { createRemoteJWKSet } from "jose";

// Separately bundled Node target. No SDK dependency enters the Mobile TypeScript graph.
export function createReadRuntime({ issuer, resource, isGrantActive, bindBackend }) {
  const key = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"), {
    timeoutDuration: 5000,
  });
  const authorize = createOAuthAuthorizer({
    issuer,
    resource,
    key,
    isGrantActive,
    bindBackend,
  });
  return createMcpHandler({
    resource,
    authorize,
    oauth: protectedResourceMetadata(resource, issuer, { read: ["openid"] }),
  });
}
