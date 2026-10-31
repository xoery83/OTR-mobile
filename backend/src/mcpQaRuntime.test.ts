import { afterEach, expect, it, vi } from "vitest";
import { loadMcpQaRuntime } from "./mcpQaRuntime";
import type { CoreHttpConnection } from "./tripCoreV2Http";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
const clientId = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const expiresAt = Date.now() + 60000;
  const policy = {
    version: 1,
    clientId,
    redirectUris: [
      "https://chatgpt.com/connector/oauth/CYUxrs56rSrW",
      "http://127.0.0.1:18764/callback",
    ],
    expiresAt,
  };
  const env = {
    OTR_DEV_MCP_READ_QA_CONFIG: JSON.stringify(policy),
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    OTR_DEV_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_transport_fixture_only",
  };
  const handler = vi.fn(async (request: Request) =>
    Response.json({
      url: request.url,
      body: await request.text(),
      origin: request.headers.get("origin"),
    }),
  );
  const createReadRuntime = vi.fn(() => handler);
  const files = {
    module: vi.fn(async () => ({ createReadRuntime })),
    asset: vi.fn(async () => new Uint8Array([1])),
  };
  const gateway = {
    discoverTrips: vi.fn(async () => ({ trips: [], nextCursor: null })),
    canReadTrip: vi.fn(async () => false),
  };
  const core = { read: {} } as CoreHttpConnection;
  return { env, policy, files, gateway, core, handler, createReadRuntime, expiresAt };
}
afterEach(() => vi.useRealTimers());
it("does no module/asset/network IO without the explicit public QA config", async () => {
  const q = fixture();
  expect(await loadMcpQaRuntime({}, q.gateway, q.core, q.files)).toBeUndefined();
  expect(q.files.module).not.toHaveBeenCalled();
  expect(q.files.asset).not.toHaveBeenCalled();
});
it("accepts only the separate exact Claude callback profile and passes it unchanged to consent", async () => {
  const q = fixture();
  q.env.OTR_DEV_MCP_READ_QA_CONFIG = JSON.stringify({
    ...q.policy,
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  });
  const handle = (await loadMcpQaRuntime(q.env, q.gateway, q.core, q.files))!;
  const config = await (await handle(
    new Request("http://api-dev.xoery.art/oauth/consent/config"),
  ))!.json();
  expect(config.clientId).toBe(clientId);
  expect(config.redirectUris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
});
it.each([
  ["https://claude.ai/api/mcp/auth_callback/"],
  ["https://claude.ai/api/mcp/auth_callback?extra=1"],
  ["https://claude.ai.evil.invalid/api/mcp/auth_callback"],
  ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:18764/callback"],
  [
    "https://claude.ai/api/mcp/auth_callback",
    "https://chatgpt.com/connector/oauth/CYUxrs56rSrW",
  ],
  ["http://127.0.0.1:18764/callback"],
])(
  "rejects altered or mixed consumer callback profiles before importing SDK: %j",
  async (...redirectUris) => {
    const q = fixture();
    q.env.OTR_DEV_MCP_READ_QA_CONFIG = JSON.stringify({ ...q.policy, redirectUris });
    await expect(loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).rejects.toThrow();
    expect(q.files.module).not.toHaveBeenCalled();
    expect(q.files.asset).not.toHaveBeenCalled();
  },
);
it("does not reuse the existing ChatGPT client with the Claude callback", async () => {
  const q = fixture();
  q.env.OTR_DEV_MCP_READ_QA_CONFIG = JSON.stringify({
    ...q.policy,
    clientId: "83504d3f-59d4-43fd-99b1-bebc54c40f7d",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  });
  await expect(loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).rejects.toThrow();
  expect(q.files.module).not.toHaveBeenCalled();
});
it.each(["project", "secret", "scope", "deadline", "redirect", "missing core"])(
  "refuses changed %s before importing SDK",
  async (mode) => {
    const q = fixture();
    if (mode === "project") q.env.OTR_DEV_SUPABASE_URL = "https://other.invalid";
    if (mode === "secret")
      q.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY = "sb_secret_local_forbidden_1234567890";
    if (mode === "scope")
      q.env.OTR_DEV_MCP_READ_QA_CONFIG = JSON.stringify({
        ...q.policy,
        scopes: ["otr.trips.write"],
      });
    if (mode === "deadline")
      q.env.OTR_DEV_MCP_READ_QA_CONFIG = JSON.stringify({
        ...q.policy,
        expiresAt: Date.now() + 3600000,
      });
    if (mode === "redirect")
      q.env.OTR_DEV_MCP_READ_QA_CONFIG = JSON.stringify({
        ...q.policy,
        redirectUris: ["https://other.invalid"],
      });
    await expect(
      loadMcpQaRuntime(
        q.env,
        q.gateway,
        mode === "missing core" ? undefined : q.core,
        q.files,
      ),
    ).rejects.toThrow();
    expect(q.files.module).not.toHaveBeenCalled();
  },
);
it("preserves body and Origin on the qualified private HTTP hop and closes at deadline", async () => {
  const q = fixture(),
    handle = (await loadMcpQaRuntime(q.env, q.gateway, q.core, q.files))!;
  expect(await handle(new Request("http://api-dev.xoery.art/health"))).toBeNull();
  expect(
    (await handle(
      new Request("http://other.invalid/mcp", {
        headers: { "X-Forwarded-Host": "api-dev.xoery.art" },
      }),
    ))!.status,
  ).toBe(404);
  const response = (await handle(
    new Request("http://api-dev.xoery.art/mcp", {
      method: "POST",
      body: "unit-body",
      headers: { Origin: "https://other.invalid" },
    }),
  ))!;
  // Stub proves forwarding only; the actual MCP factory must reject this Origin.
  expect(await response.json()).toEqual({
    url: "https://api-dev.xoery.art/mcp",
    body: "unit-body",
    origin: "https://other.invalid",
  });
  const settings = await (await handle(
    new Request("http://api-dev.xoery.art/oauth/consent/config"),
  ))!.json();
  expect(settings.accountIds).toEqual(["1f3d7935-1bdc-4952-8d7f-0f72077368c1"]);
  vi.useFakeTimers();
  vi.setSystemTime(q.expiresAt);
  expect((await handle(new Request("http://api-dev.xoery.art/mcp")))!.status).toBe(503);
});
it("delegates only exact optional paths without bypassing ordinary authentication", async () => {
  const validateAccessToken = vi.fn(async () => null);
  const gateway = { validateAccessToken } as unknown as DevBackendGateway;
  const mcpHttp = vi.fn(async () => new Response("unit"));
  const closed = createDevBackendHandler({ gateway });
  expect((await closed(new Request("https://api-dev.xoery.art/mcp"))).status).toBe(404);
  const handle = createDevBackendHandler({ gateway, mcpHttp });
  expect(
    (await handle(new Request("https://api-dev.xoery.art/oauth/consent"))).status,
  ).toBe(200);
  expect(validateAccessToken).not.toHaveBeenCalled();
  mcpHttp.mockClear();
  expect((await handle(new Request("https://api-dev.xoery.art/v2/trips"))).status).toBe(
    401,
  );
  expect(mcpHttp).not.toHaveBeenCalled();
  expect(
    (await handle(new Request("https://api-dev.xoery.art/oauth/consent/private"))).status,
  ).toBe(404);
});
