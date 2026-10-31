import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createRequestBoundary } from "../src/data/api/requestBoundary";
import {
  auth,
  Client,
  StreamableHTTPClientTransport,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthTokens,
} from "@modelcontextprotocol/client";

export const SDK_QA_CALLBACK = "http://127.0.0.1:18764/callback";
const RESOURCE = "https://api-dev.xoery.art/mcp";
const ISSUER = "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1";

export function sdkQaCallback(url: URL, state: string) {
  assert.equal(url.origin + url.pathname, SDK_QA_CALLBACK);
  for (const key of ["state", "code", "error", "iss"])
    assert(url.searchParams.getAll(key).length <= 1);
  assert.equal(url.searchParams.get("state"), state);
  const iss = url.searchParams.get("iss") ?? undefined;
  if (iss !== undefined) assert.equal(iss, ISSUER);
  if (url.searchParams.has("error")) return null;
  const code = url.searchParams.get("code");
  assert(code && code.length <= 4096);
  return { code, iss };
}

// QA-only: static client, exact callback and memory custody; Auth owns token checks/revoke.
export async function withSdkQaOAuthRead(options: {
  clientId: string;
  signal?: AbortSignal;
  onAuthorization(url: URL, signal: AbortSignal): Promise<void>;
  verifyTokens(tokens: StoredOAuthTokens, signal: AbortSignal): Promise<void>;
  run(client: Client, provider: OAuthClientProvider, signal: AbortSignal): Promise<void>;
  cleanup(tokens: StoredOAuthTokens | undefined, signal: AbortSignal): Promise<void>;
}) {
  assert.match(options.clientId, /^[0-9a-f-]{36}$/);
  const state = randomBytes(32).toString("base64url");
  let tokens: StoredOAuthTokens | undefined;
  let verifier: string | undefined;
  let discovery: OAuthDiscoveryState | undefined;
  let consumed = false;
  let resolveCallback!: (value: ReturnType<typeof sdkQaCallback>) => void;
  const callback = new Promise<ReturnType<typeof sdkQaCallback>>((resolve) => {
    resolveCallback = resolve;
  });
  let closed = false;
  const boundary = createRequestBoundary(15 * 60 * 1000, options.signal, () =>
    assert(!closed),
  );
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      boundary.assertCurrent();
      assert.equal(request.method, "GET");
      assert.equal(request.headers.host, "127.0.0.1:18764");
      assert.equal(request.socket.remoteAddress, "127.0.0.1");
      assert(!consumed);
      assert(request.url && request.url.length <= 8192);
      const result = sdkQaCallback(new URL(request.url, SDK_QA_CALLBACK), state);
      consumed = true;
      resolveCallback(result);
      response.end("OTR QA callback received. You may close this tab.");
    } catch {
      response.writeHead(400).end("OTR QA callback rejected.");
    }
  });
  const provider: OAuthClientProvider = {
    redirectUrl: SDK_QA_CALLBACK,
    clientMetadata: {
      redirect_uris: [SDK_QA_CALLBACK],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "openid",
    },
    state: () => state,
    clientInformation: (context) => {
      boundary.assertCurrent();
      assert.equal(context?.issuer, ISSUER);
      return { client_id: options.clientId, issuer: ISSUER };
    },
    tokens: (context) => {
      boundary.assertCurrent();
      if (context) assert.equal(context.issuer, ISSUER);
      return tokens;
    },
    saveTokens: async (value, context) => {
      boundary.assertCurrent();
      assert.equal(context?.issuer, ISSUER);
      tokens = value;
      await options.verifyTokens(value, boundary.signal);
      boundary.assertCurrent();
    },
    redirectToAuthorization: async (url) => {
      boundary.assertCurrent();
      assert.equal(url.origin, new URL(ISSUER).origin);
      assert.equal(url.searchParams.get("redirect_uri"), SDK_QA_CALLBACK);
      assert.equal(url.searchParams.get("client_id"), options.clientId);
      assert.equal(url.searchParams.get("state"), state);
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.equal(url.searchParams.get("resource"), RESOURCE);
      // SDK adds offline_access for the registered refresh grant; no business scope expansion.
      assert.match(
        url.searchParams.get("scope") ?? "",
        /^(openid offline_access|offline_access openid)$/,
      );
      await options.onAuthorization(url, boundary.signal);
      boundary.assertCurrent();
    },
    saveCodeVerifier: (value) => {
      boundary.assertCurrent();
      verifier = value;
    },
    codeVerifier: () => {
      boundary.assertCurrent();
      assert(verifier);
      return verifier;
    },
    saveDiscoveryState: (value) => {
      boundary.assertCurrent();
      assert.equal(value.authorizationServerUrl, ISSUER);
      assert.equal(value.authorizationServerMetadata?.issuer, ISSUER);
      for (const key of ["authorization_endpoint", "token_endpoint"] as const)
        assert.equal(
          new URL(value.authorizationServerMetadata[key]).origin,
          new URL(ISSUER).origin,
        );
      assert.equal(value.resourceMetadata?.resource, RESOURCE);
      discovery = value;
    },
    discoveryState: () => {
      boundary.assertCurrent();
      return discovery;
    },
    validateResourceURL: async (serverUrl, resource) => {
      assert.equal(String(serverUrl), RESOURCE);
      assert.equal(resource, RESOURCE);
      return new URL(RESOURCE);
    },
  };
  const client = new Client({ name: "otr-dev-sdk-oauth-qa", version: "1" });
  const fetchFn: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.any([
        boundary.signal,
        AbortSignal.timeout(50000),
        ...(init?.signal ? [init.signal] : []),
      ]),
    });
  try {
    await boundary.run(async () => {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(18764, "127.0.0.1", resolve);
      });
      assert.equal(
        await auth(provider, { serverUrl: RESOURCE, scope: "openid", fetchFn }),
        "REDIRECT",
      );
      const result = await callback;
      assert(result, "OAUTH_USER_DENIED");
      assert.equal(
        await auth(provider, {
          serverUrl: RESOURCE,
          scope: "openid",
          authorizationCode: result.code,
          iss: result.iss,
          fetchFn,
        }),
        "AUTHORIZED",
      );
      await client.connect(
        new StreamableHTTPClientTransport(new URL(RESOURCE), {
          authProvider: provider,
          fetch: fetchFn,
        }),
      );
      await options.run(client, provider, boundary.signal);
    });
  } finally {
    closed = true;
    boundary.close();
    try {
      await client.close();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      const cleanupBoundary = createRequestBoundary(50000);
      try {
        await cleanupBoundary.run(() => options.cleanup(tokens, cleanupBoundary.signal));
      } finally {
        cleanupBoundary.close();
        tokens = undefined;
        verifier = undefined;
        discovery = undefined;
      }
    }
  }
}
