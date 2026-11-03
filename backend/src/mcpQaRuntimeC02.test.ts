import { afterEach, expect, it, vi } from "vitest";
import type { CoreHttpConnection } from "./tripCoreV2Http";
import { loadMcpQaRuntime } from "./mcpQaRuntime";

function fixture() {
  const handler = vi.fn(async () => new Response(null, { status: 204 }));
  const createC02ConfiguredHost = vi.fn((_input: unknown) => handler);
  const raw = JSON.stringify({ plan: { command: null }, confirmations: [] });
  const env: Record<string, string | undefined> = {
    OTR_DEV_MCP_C02_QA_CONFIG: raw,
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    OTR_DEV_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_transport_fixture_only",
  };
  const gateway = { discoverTrips: vi.fn(), canReadTrip: vi.fn() };
  const core = {
    read: {},
    commands: { withLockedCommand: vi.fn() },
  } as unknown as CoreHttpConnection;
  const files = {
    module: vi.fn(),
    c02Module: vi.fn(async () => ({ createC02ConfiguredHost })),
    asset: vi.fn(async () => new Uint8Array([1])),
  };
  return { handler, createC02ConfiguredHost, raw, env, gateway, core, files };
}
afterEach(() => vi.restoreAllMocks());
it("loads the fixed C02 host for its explicit selector without legacy SDK or new authority", async () => {
  const q = fixture();
  expect(await loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).toBe(q.handler);
  expect(q.files.module).not.toHaveBeenCalled();
  expect(q.files.c02Module).toHaveBeenCalledOnce();
  expect(q.createC02ConfiguredHost).toHaveBeenCalledWith(
    expect.objectContaining({
      rawConfig: q.raw,
      publishableKey: q.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
      ports: {
        discovery: { discoverTrips: expect.any(Function) },
        canReadTrip: expect.any(Function),
        core: q.core,
      },
      consentJavascript: new Uint8Array([1]),
    }),
  );
});
it("does no module, asset or gateway IO with all selectors absent", async () => {
  const q = fixture();
  expect(await loadMcpQaRuntime({}, q.gateway, q.core, q.files)).toBeUndefined();
  for (const fn of Object.values(q.files)) expect(fn).not.toHaveBeenCalled();
  for (const fn of Object.values(q.gateway)) expect(fn).not.toHaveBeenCalled();
});
it.each(["OTR_DEV_MCP_READ_QA_CONFIG", "OTR_DEV_MCP_WRITE_QA_CONFIG"])(
  "rejects C02 conflict with %s before any module/asset IO",
  async (key) => {
    const q = fixture();
    q.env[key] = "{}";
    await expect(loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).rejects.toThrow(
      "C02_HOST_PORT_CLOSED",
    );
    for (const fn of Object.values(q.files)) expect(fn).not.toHaveBeenCalled();
  },
);
it.each(["url", "publicKey", "coreRead", "coreCommands", "discovery", "tripReader"])(
  "rejects missing/foreign normal owning port %s before IO",
  async (kind) => {
    const q = fixture();
    if (kind === "url") q.env.OTR_DEV_SUPABASE_URL = "https://foreign.invalid";
    if (kind === "publicKey")
      q.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY = "sb_secret_not_a_public_key";
    if (kind === "coreRead") q.core.read = undefined as never;
    if (kind === "coreCommands") q.core.commands = undefined as never;
    if (kind === "discovery") q.gateway.discoverTrips = undefined as never;
    if (kind === "tripReader") q.gateway.canReadTrip = undefined as never;
    await expect(loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).rejects.toThrow(
      "C02_HOST_PORT_CLOSED",
    );
    for (const fn of Object.values(q.files)) expect(fn).not.toHaveBeenCalled();
  },
);
it("rejects invalid consent asset before constructing the configured host", async () => {
  const q = fixture();
  q.files.asset.mockResolvedValue(new Uint8Array());
  await expect(loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).rejects.toThrow(
    "MCP_QA_ASSET_INVALID",
  );
  expect(q.createC02ConfiguredHost).not.toHaveBeenCalled();
});
it("leaves raw selector validation to the fixed owning C02 module without rewriting it", async () => {
  const q = fixture();
  q.env.OTR_DEV_MCP_C02_QA_CONFIG = "invalid-private-selector";
  q.createC02ConfiguredHost.mockImplementation(() => {
    throw Error("FIXED_HOST_REJECTED");
  });
  await expect(loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).rejects.toThrow(
    "FIXED_HOST_REJECTED",
  );
  expect(q.createC02ConfiguredHost.mock.calls[0][0]).toMatchObject({
    rawConfig: "invalid-private-selector",
  });
});
it.each([
  "get_otr_operating_guide",
  "get_trip_item_edit_base",
  "review_travel_materials",
  "get_trip",
])("projects only safe request fields for C02 metadata/guide %s", async (tool) => {
  const q = fixture(),
    log = vi.spyOn(console, "info").mockImplementation(() => {});
  await loadMcpQaRuntime(q.env, q.gateway, q.core, q.files);
  const input = q.createC02ConfiguredHost.mock.calls[0][0] as {
    log(event: unknown): void;
  };
  const safe = {
    requestId: "11111111-1111-4111-8111-111111111111",
    status: 200,
    durationMs: 2,
    tool,
  };
  input.log({
    ...safe,
    accessToken: "synthetic-secret",
    rawBody: "synthetic-input",
    url: "https://private.invalid",
  });
  expect(log).toHaveBeenLastCalledWith("MCP_QA_REQUEST", JSON.stringify(safe));
  log.mockClear();
  input.log({ ...safe, tool: "unknown_tool" });
  expect(log).not.toHaveBeenCalled();
});
it("preserves exact Base/Create/Edit proof hashes but drops malformed or unqualified proof", async () => {
  const q = fixture();
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  await loadMcpQaRuntime(q.env, q.gateway, q.core, q.files);
  const { log } = q.createC02ConfiguredHost.mock.calls[0][0] as {
    log(event: unknown): void;
  };
  const base = {
    requestId: "11111111-1111-4111-8111-111111111111",
    status: 200,
    durationMs: 2,
  };
  const hashes = {
    version: "otr.mcp.response-proof/1",
    inputSHA256: "a".repeat(64),
    outputSHA256: "b".repeat(64),
  };
  for (const tool of [
    "get_trip_item_edit_base",
    "create_trip_item",
    "update_trip_item",
  ]) {
    const responseProof =
      tool === "get_trip_item_edit_base"
        ? { ...hashes, kind: "EDIT_BASE" }
        : { ...hashes, kind: "PREVIEW", previewDigest: "c".repeat(64) };
    const safe = { ...base, tool, responseProof };
    log({ ...safe, rawBody: "SECRET_CANARY" });
    expect(JSON.parse(info.mock.calls.at(-1)![1])).toEqual(safe);
    for (const changed of [
      { status: 401 },
      { errorCode: "AUTH_REQUIRED" },
      { authFailureSource: "BACKEND_401" },
      { tool: "list_trips" },
      { responseProof: { ...responseProof, inputSHA256: "SECRET_CANARY" } },
      { responseProof: { ...responseProof, rawBody: "SECRET_CANARY" } },
      { responseProof: { ...responseProof, version: "other" } },
      { responseProof: { ...responseProof, kind: "APPLIED" } },
      { responseProof: { ...responseProof, previewDigest: null } },
    ]) {
      log({ ...safe, ...changed });
      const recorded = JSON.parse(info.mock.calls.at(-1)![1]);
      expect(recorded).not.toHaveProperty("responseProof");
      expect(JSON.stringify(recorded)).not.toContain("CANARY");
    }
  }
});
