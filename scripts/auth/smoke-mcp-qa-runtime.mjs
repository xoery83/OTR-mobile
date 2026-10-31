import { createReadRuntime } from "../../dist/mcp/runtime.mjs";
import assert from "node:assert/strict";
globalThis.fetch = async () => {
  throw Error("NETWORK_NOT_EXPECTED_IN_CLOSED_SMOKE");
};
const resource = "https://api-dev.xoery.art/mcp";
const issuer = "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1";
const handle = createReadRuntime({
  issuer,
  resource,
  isGrantActive: async () => false,
  bindBackend: async () => {
    throw Error("BIND_MUST_NOT_RUN_WITHOUT_AUTH");
  },
});
const metadata = await handle(
  new Request("https://api-dev.xoery.art/.well-known/oauth-protected-resource/mcp"),
);
assert.equal(metadata.status, 200);
assert.deepEqual((await metadata.json()).scopes_supported, ["openid"]);
const unauthenticated = await handle(
  new Request(resource, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  }),
);
assert.equal(unauthenticated.status, 401);
assert.match(unauthenticated.headers.get("WWW-Authenticate"), /scope="openid"/);
assert.doesNotMatch(unauthenticated.headers.get("WWW-Authenticate"), /otr\.trips/);
const foreign = await handle(
  new Request(resource, { method: "POST", headers: { Origin: "https://other.invalid" } }),
);
assert.equal(foreign.status, 403);
console.log(
  JSON.stringify({
    status: "COMPILED_NODE_PUBLIC_METADATA_AND_DENIAL_PASS",
    meaning:
      "Actual reviewed MCP SDK/Authorizer bridge, no token or provider calls; not OAuth E2E",
    checks: 3,
  }),
);
