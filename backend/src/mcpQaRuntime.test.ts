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
  const createReadRuntime = vi.fn((_options: unknown) => handler);
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
function writeFixture() {
  const q = fixture();
  const policy = {
    version: 2,
    clientId: "d2b8167f-ee42-4ac1-b5ef-4dc003c0d141",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    expiresAt: q.expiresAt,
    consentNotBefore: Date.now() - 1000,
    businessAccess: "READ_WRITE",
    confirmations: [
      {
        operationId: "e9b4a200-3b22-461f-bf3f-f4347b9dfb67",
        previewDigest: "09afa70b340a3a296e7fc0ae728439c49c09f72940807f91afd03b99ed54edc0",
      },
      {
        operationId: "bb0cb010-0cb4-432b-8995-670aaec95b3d",
        previewDigest: "ec151a254b010eba45d83e5dc0e9416d7aa356bd5b0cbdd27824afea7069b4e7",
      },
    ],
  };
  const createWriteRuntime = vi.fn((_options: unknown) => q.handler);
  const files = {
    ...q.files,
    module: vi.fn(async () => ({
      createReadRuntime: q.createReadRuntime,
      createWriteRuntime: createWriteRuntime as typeof createWriteRuntime | undefined,
    })),
  };
  const env: Record<string, string | undefined> = {
    ...q.env,
    OTR_DEV_MCP_READ_QA_CONFIG: undefined,
    OTR_DEV_MCP_WRITE_QA_CONFIG: JSON.stringify(policy),
  };
  const core = {
    ...q.core,
    commands: { withLockedCommand: vi.fn() },
  } as CoreHttpConnection;
  return { ...q, env, policy, files, core, createWriteRuntime };
}
afterEach(() => vi.useRealTimers());
it("does no module/asset/network IO without the explicit public QA config", async () => {
  const q = fixture();
  expect(await loadMcpQaRuntime({}, q.gateway, q.core, q.files)).toBeUndefined();
  expect(q.files.module).not.toHaveBeenCalled();
  expect(q.files.asset).not.toHaveBeenCalled();
});
it("Write rejects mixed/altered policy before SDK IO and refuses an old Read-only SDK", async () => {
  const q = writeFixture();
  await expect(
    loadMcpQaRuntime(
      { ...q.env, OTR_DEV_MCP_READ_QA_CONFIG: "{}" },
      q.gateway,
      q.core,
      q.files,
    ),
  ).rejects.toThrow("CONFLICT");
  for (const change of [
    { version: 1 },
    { clientId },
    { redirectUris: ["https://other.invalid/callback"] },
    { confirmations: [] },
    { consentNotBefore: Date.now() + 60000 },
    { consentNotBefore: Date.now() - 1800000 },
    { expiresAt: Date.now() + 1800001 },
    {
      confirmations: [
        { ...q.policy.confirmations[0], previewDigest: "0".repeat(64) },
        q.policy.confirmations[1],
      ],
    },
  ])
    await expect(
      loadMcpQaRuntime(
        {
          ...q.env,
          OTR_DEV_MCP_WRITE_QA_CONFIG: JSON.stringify({ ...q.policy, ...change }),
        },
        q.gateway,
        q.core,
        q.files,
      ),
    ).rejects.toThrow();
  expect(q.files.module).not.toHaveBeenCalled();
  expect(q.files.asset).not.toHaveBeenCalled();
  q.files.module.mockResolvedValueOnce({
    createReadRuntime: q.createReadRuntime,
    createWriteRuntime: undefined,
  });
  await expect(loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).rejects.toThrow(
    "WRITE_RUNTIME_CLOSED",
  );
  expect(q.createReadRuntime).not.toHaveBeenCalled();
});

it("Write confirmation is exact and bounded; no model flag or alternate Actor can approve", async () => {
  const q = writeFixture();
  await loadMcpQaRuntime(q.env, q.gateway, q.core, q.files);
  const { confirm } = q.createWriteRuntime.mock.calls[0][0] as {
    confirm(request: unknown, signal: AbortSignal): Promise<boolean>;
  };
  const request = {
    accountId: "1f3d7935-1bdc-4952-8d7f-0f72077368c1",
    clientId: q.policy.clientId,
    resource: "https://api-dev.xoery.art/mcp",
    digest: q.policy.confirmations[0].previewDigest,
    operationIds: [q.policy.confirmations[0].operationId],
  };
  const signal = new AbortController().signal;
  expect(await confirm(request, signal)).toBe(true);
  for (const change of [
    { accountId: clientId },
    { clientId },
    { resource: "https://other.invalid/mcp" },
    { digest: "0".repeat(64), confirmed: true },
    { operationIds: [clientId], confirmed: true },
    { operationIds: q.policy.confirmations.map((entry) => entry.operationId) },
  ])
    expect(await confirm({ ...request, ...change }, signal)).toBe(false);
  expect(await confirm(null, signal)).toBe(false);
  vi.useFakeTimers();
  vi.setSystemTime(q.policy.expiresAt);
  expect(await confirm(request, signal)).toBe(false);
  const aborted = new AbortController();
  aborted.abort();
  await expect(confirm(request, aborted.signal)).rejects.toThrow();
  expect(q.core.commands.withLockedCommand).not.toHaveBeenCalled();
});

it("Write exposes explicit Consent mode without approvals and requires private Auth evidence", async () => {
  const q = writeFixture(),
    handle = (await loadMcpQaRuntime(q.env, q.gateway, q.core, q.files))!;
  const response = await handle(
    new Request("https://api-dev.xoery.art/oauth/consent/config"),
  );
  if (!response) throw Error("WRITE_CONSENT_ROUTE_NOT_HANDLED");
  const publicConfig = await response.json();
  expect(publicConfig.businessAccess).toBe("READ_WRITE");
  expect(publicConfig).not.toHaveProperty("confirmations");
  expect(publicConfig).not.toHaveProperty("consentNotBefore");
  const { bindBackend } = q.createWriteRuntime.mock.calls[0][0] as {
    bindBackend(grant: unknown, signal: AbortSignal): Promise<unknown>;
  };
  await expect(bindBackend({}, new AbortController().signal)).rejects.toThrow(
    "EVIDENCE_CLOSED",
  );
  expect(q.core.commands.withLockedCommand).not.toHaveBeenCalled();
  expect(q.createReadRuntime).not.toHaveBeenCalled();
});
it.each(["EXPIRED_BEFORE_BACKEND", "EXPIRED_AFTER_BACKEND", "BACKEND_401"])(
  "logs only bounded request metadata and the existing %s diagnostic source",
  async (authFailureSource) => {
    const q = fixture();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      await loadMcpQaRuntime(q.env, q.gateway, q.core, q.files);
      const { log } = q.createReadRuntime.mock.calls[0][0] as {
        log(event: unknown): void;
      };
      const safe = {
        requestId: clientId,
        status: 200,
        durationMs: 8,
        tool: "get_trip_item",
        errorCode: "AUTH_REQUIRED",
        authFailureSource,
      };
      log({
        ...safe,
        accessToken: "unit-secret",
        accountId: clientId,
        path: "/unit-private",
        body: "unit-private",
      });
      expect(info).toHaveBeenCalledExactlyOnceWith(
        "MCP_QA_REQUEST",
        JSON.stringify(safe),
      );
      info.mockClear();
      for (const changed of [
        { requestId: "unit-secret" },
        { tool: "unit-secret" },
        { errorCode: "unit-secret" },
        { authFailureSource: "unit-secret" },
        { status: 999 },
        { durationMs: Infinity },
      ])
        log({ ...safe, ...changed });
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  },
);
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
