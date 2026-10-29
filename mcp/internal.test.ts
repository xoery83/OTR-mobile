import { expect, it, vi, afterEach } from "vitest";
import { internalSessionAuthorizer, DEV_AUTH, DEV_BACKEND } from "./internal";
const account = "00000000-0000-4000-8000-000000000001";
afterEach(() => vi.unstubAllGlobals());
it("internal Auth verifies only the approved DEV issuer and fixes Account from Auth, never tool input", async () => {
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith("/auth/v1/user")
      ? Response.json({
          id: account,
          email: "private@example.invalid",
          privateMetadata: "redact",
        })
      : Response.json({ trips: [], nextCursor: null }),
  );
  vi.stubGlobal("fetch", fetcher);
  const authorize = internalSessionAuthorizer("sb_publishable_synthetic");
  expect(await authorize(new Request("http://127.0.0.1:8798/mcp"))).toBeNull();
  const result = await authorize(
    new Request("http://127.0.0.1:8798/mcp", {
      headers: { Authorization: "Bearer internal.synthetic.token" },
    }),
  );
  expect(result).toMatchObject({
    accountId: account,
    resource: "http://127.0.0.1:8798/mcp",
  });
  expect(JSON.stringify(result)).not.toContain("private@example.invalid");
  await result!.read("/v2/trips?limit=20", new AbortController().signal);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    DEV_AUTH + "/auth/v1/user",
    DEV_BACKEND + "/v2/trips?limit=20",
  ]);
  expect(() => result!.read("/v2/trips/commands", new AbortController().signal)).toThrow(
    "INTERNAL_READ_PATH_DENIED",
  );
  expect(() => internalSessionAuthorizer("sb_secret_no")).toThrow(
    "DEV_PUBLISHABLE_KEY_REQUIRED",
  );
});
it("internal invalid session cannot make any Backend request", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  const auth = await internalSessionAuthorizer("sb_publishable_synthetic")(
    new Request("http://127.0.0.1:8798/mcp", {
      headers: { Authorization: "Bearer invalid" },
    }),
  );
  expect(auth).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
