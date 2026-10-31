import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { SDK_QA_CALLBACK, sdkQaCallback, withSdkQaOAuthRead } from "./sdkOAuthQa";

afterEach(() => vi.unstubAllGlobals());

it("rejects callback substitution, duplicate values and issuer mix-up", () => {
  const url = new URL(SDK_QA_CALLBACK + "?state=expected&code=one");
  expect(sdkQaCallback(url, "expected")).toEqual({ code: "one", iss: undefined });
  for (const value of [
    url.href.replace("expected", "other"),
    url.href + "&code=two",
    url.href + "&iss=https%3A%2F%2Fwrong.invalid",
    url.href.replace("/callback", "/elsewhere"),
    url.href.replace("127.0.0.1", "localhost"),
  ])
    expect(() => sdkQaCallback(new URL(value), "expected")).toThrow();
  expect(
    sdkQaCallback(
      new URL(SDK_QA_CALLBACK + "?state=expected&error=access_denied"),
      "expected",
    ),
  ).toBeNull();
});

it.each(["verifyFailure", "deny", "hang"] as const)(
  "uses SDK code/S256 and cleans memory custody on verification failure or deny (%s)",
  async (mode) => {
    const deny = mode === "deny",
      hang = mode === "hang";
    const controller = new AbortController();
    let resume!: () => void;
    const originalFetch = globalThis.fetch;
    const issuer = "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1";
    const resource = "https://api-dev.xoery.art/mcp";
    const clientId = "c8a38e5a-7b36-4474-a22f-4b2afdd69c25";
    let challenge = "";
    let exchanged = false;
    const cleanup = vi.fn(async () => {});
    const run = vi.fn(async () => {});
    const verifyTokens = vi.fn(async () => {
      throw Error("QA_TOKEN_CHECK_STOP");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" || input instanceof URL ? input : input.url,
        );
        if (
          url.origin === "https://api-dev.xoery.art" &&
          url.pathname.startsWith("/.well-known/")
        )
          return Response.json({
            resource,
            authorization_servers: [issuer],
            scopes_supported: ["openid", "offline_access"],
          });
        if (
          url.origin === new URL(issuer).origin &&
          url.pathname.includes("/.well-known/")
        )
          return Response.json({
            issuer,
            authorization_endpoint: issuer + "/oauth/authorize",
            token_endpoint: issuer + "/oauth/token",
            response_types_supported: ["code"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
            scopes_supported: ["openid", "offline_access"],
          });
        if (url.href === issuer + "/oauth/token") {
          expect(deny).toBe(false);
          const body = new URLSearchParams(String(init?.body));
          expect(body.get("code")).toBe("test-only-code");
          expect(body.get("redirect_uri")).toBe(SDK_QA_CALLBACK);
          expect(body.get("resource")).toBe(resource);
          expect(
            createHash("sha256")
              .update(body.get("code_verifier") ?? "")
              .digest("base64url"),
          ).toBe(challenge);
          exchanged = true;
          return Response.json({
            access_token: "test-only-resource-token",
            token_type: "Bearer",
            expires_in: 60,
          });
        }
        throw Error("UNEXPECTED_TEST_NETWORK");
      }),
    );
    await expect(
      withSdkQaOAuthRead({
        clientId,
        signal: controller.signal,
        cleanup,
        run,
        verifyTokens,
        onAuthorization: async (url, signal) => {
          if (hang) {
            controller.abort();
            expect(signal.aborted).toBe(true);
            await new Promise<void>((resolve) => {
              resume = resolve;
            });
            return;
          }
          expect(url.searchParams.get("scope")).toBe("openid offline_access");
          challenge = url.searchParams.get("code_challenge") ?? "";
          expect(challenge).not.toBe("");
          const callback = new URL(SDK_QA_CALLBACK);
          callback.searchParams.set("state", url.searchParams.get("state") ?? "");
          callback.searchParams.set(
            deny ? "error" : "code",
            deny ? "access_denied" : "test-only-code",
          );
          callback.searchParams.set("iss", issuer);
          const response = await originalFetch(callback, { redirect: "error" });
          expect(response.status).toBe(200);
          expect(await response.text()).not.toContain("test-only-code");
        },
      }),
    ).rejects.toThrow(
      hang ? "REQUEST_CANCELED" : deny ? "OAUTH_USER_DENIED" : "QA_TOKEN_CHECK_STOP",
    );
    expect(exchanged).toBe(!deny && !hang);
    expect(run).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(cleanup.mock.calls[0]?.length).toBe(2);
    if (hang) {
      resume();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(exchanged).toBe(false);
      const probe = createServer();
      await new Promise<void>((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(18764, "127.0.0.1", resolve);
      });
      await new Promise<void>((resolve) => probe.close(() => resolve()));
    }
    if (deny || hang) expect(verifyTokens).not.toHaveBeenCalled();
    else expect(verifyTokens).toHaveBeenCalledOnce();
  },
);
