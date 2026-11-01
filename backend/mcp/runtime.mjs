import {
  createMcpHandler,
  createOAuthAuthorizer,
  protectedResourceMetadata,
} from "@otr/mcp"; // eslint-disable-line import/no-unresolved -- Build script pins this alias to the reviewed MCP artifact, outside Mobile dependencies.
import { createRemoteJWKSet } from "jose";

// Separately bundled Node target. No SDK dependency enters the Mobile TypeScript graph.
function createRuntime(
  { issuer, resource, isGrantActive, bindBackend, log, confirm },
  scopes,
) {
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
    log,
    confirm,
    oauth: protectedResourceMetadata(resource, issuer, scopes),
  });
}

export function createReadRuntime({ issuer, resource, isGrantActive, bindBackend, log }) {
  return createRuntime(
    { issuer, resource, isGrantActive, bindBackend, log },
    { read: ["openid"] },
  );
}

export function createWriteRuntime(options) {
  if (typeof options.confirm !== "function") throw Error("MCP_WRITE_CONFIRM_CLOSED");
  // OIDC scopes are not business permission; Auth verifies signed Write plus fresh consent.
  return createRuntime(options, {
    read: ["openid"],
    write: ["openid", "offline_access"],
  });
}
