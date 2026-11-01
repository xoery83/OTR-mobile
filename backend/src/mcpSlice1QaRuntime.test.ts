import { afterEach, expect, it, vi } from "vitest";
import { loadMcpQaRuntime } from "./mcpQaRuntime";
import type { CoreHttpConnection } from "./tripCoreV2Http";
import cases from "../mcp/slice1-qa-cases.json";
const calls = vi.hoisted(() => ({ backend: vi.fn(), active: vi.fn(async () => true) }));
vi.mock("./mcpAccountWriteBinding", () => ({
  createMcpAccountWriteBinding: () => async () => ({
    read: vi.fn(),
    backend: calls.backend,
  }),
}));
vi.mock("./mcpOAuthGrantVerifier", () => ({
  createSupabaseDevMcpGrantVerifier: () => calls.active,
  createSupabaseDevMcpWriteGrantVerifier: () => calls.active,
}));
const accountId = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
function fixture(round = 0, confirmed = false) {
  const qa = cases.cases[round];
  const clientId = round
    ? "83504d3f-59d4-43fd-99b1-bebc54c40f7d"
    : "d2b8167f-ee42-4ac1-b5ef-4dc003c0d141";
  const policy = {
    version: 4,
    toolProfile: "SLICE1_NOTES_EDIT",
    clientId,
    redirectUris: [
      round
        ? "https://chatgpt.com/connector/oauth/CYUxrs56rSrW"
        : "https://claude.ai/api/mcp/auth_callback",
    ],
    expiresAt: Date.now() + 60000,
    consentNotBefore: Date.now() - 1000,
    businessAccess: "READ_WRITE",
    confirmations: confirmed
      ? [
          {
            operationId: qa.command.operationId,
            previewDigest: qa.identity.preview_digest,
          },
        ]
      : [],
  };
  const env = {
    OTR_DEV_MCP_WRITE_QA_CONFIG: JSON.stringify(policy),
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    OTR_DEV_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_transport_fixture_only",
  };
  const createWriteRuntime = vi.fn((_options: unknown) => async () => new Response());
  const files = {
    module: vi.fn(async () => ({ createReadRuntime: vi.fn(), createWriteRuntime })),
    asset: vi.fn(async () => new Uint8Array([1])),
  };
  const gateway = {
    discoverTrips: vi.fn(async () => ({ trips: [], nextCursor: null })),
    canReadTrip: vi.fn(async () => false),
  };
  const core = {
    read: {},
    commands: { withLockedCommand: vi.fn() },
  } as unknown as CoreHttpConnection;
  return { qa, policy, env, files, gateway, core, createWriteRuntime };
}
async function options(q: ReturnType<typeof fixture>) {
  await loadMcpQaRuntime(q.env, q.gateway, q.core, q.files);
  return q.createWriteRuntime.mock.calls[0][0] as any;
}
const confirmation = (q: ReturnType<typeof fixture>) => ({
  accountId,
  clientId: q.policy.clientId,
  resource: "https://api-dev.xoery.art/mcp",
  digest: q.qa.identity.preview_digest,
  operationIds: [q.qa.command.operationId],
});
const binding = (o: any) =>
  o.bindBackend({ accountId }, new AbortController().signal, {
    accessToken: "unit-fixture-not-a-real-token",
  });
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it.each([0, 1])(
  "selects only the fixed round %i profile and denies empty confirmation",
  async (round) => {
    const q = fixture(round);
    const o = await options(q);
    expect(o.toolProfile).toBe("SLICE1_NOTES_EDIT");
    expect(
      await o.confirm(
        { ...confirmation(q), confirmed: true },
        new AbortController().signal,
      ),
    ).toBe(false);
    const bound = await binding(o);
    const result = await bound.backend(
      {
        method: "POST",
        path: `/v2/trips/${q.qa.command.tripId}/core/commands`,
        body: q.qa.command,
      },
      new AbortController().signal,
    );
    expect(result.status).toBe(404);
    expect(calls.backend).not.toHaveBeenCalled();
  },
);
it("rejects mismatched client, callback, profile, pair and duplicate confirmations before IO", async () => {
  for (const change of [
    { clientId: "11111111-1111-4111-8111-111111111111" },
    { toolProfile: "ALL" },
    { redirectUris: ["http://127.0.0.1:18764/callback"] },
    {
      confirmations: [
        {
          operationId: cases.cases[1].command.operationId,
          previewDigest: cases.cases[1].identity.preview_digest,
        },
      ],
    },
    {
      confirmations: Array(2).fill({
        operationId: cases.cases[0].command.operationId,
        previewDigest: cases.cases[0].identity.preview_digest,
      }),
    },
    {
      confirmations: [
        {
          operationId: "bb0cb010-0cb4-432b-8995-670aaec95b3d",
          previewDigest:
            "ec151a254b010eba45d83e5dc0e9416d7aa356bd5b0cbdd27824afea7069b4e7",
        },
      ],
    },
  ]) {
    const q = fixture();
    q.env.OTR_DEV_MCP_WRITE_QA_CONFIG = JSON.stringify({ ...q.policy, ...change });
    await expect(loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).rejects.toThrow();
    expect(q.files.module).not.toHaveBeenCalled();
  }
});
it("keeps the existing finite clock and fresh-consent requirements", async () => {
  for (const change of [
    { expiresAt: Date.now() + 1800001 },
    { expiresAt: Date.now() - 1 },
    { consentNotBefore: Date.now() + 1000 },
    { consentNotBefore: Date.now() - 1800000 },
  ]) {
    const q = fixture();
    q.env.OTR_DEV_MCP_WRITE_QA_CONFIG = JSON.stringify({ ...q.policy, ...change });
    await expect(loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).rejects.toThrow();
    expect(q.files.module).not.toHaveBeenCalled();
  }
});
it.each([0, 1])(
  "allows only the exact configured round %i command and original receipt path",
  async (round) => {
    // Unit fixture for an explicitly confirmed config, not a real Owner Notes confirmation.
    const q = fixture(round, true);
    const o = await options(q);
    const bound = await binding(o);
    calls.backend.mockImplementation(async () => Response.json({ status: "UNIT_ONLY" }));
    const path = `/v2/trips/${q.qa.command.tripId}/core/`;
    expect(await o.confirm(confirmation(q), new AbortController().signal)).toBe(true);
    await bound.backend(
      { method: "POST", path: path + "commands", body: q.qa.command },
      new AbortController().signal,
    );
    await bound.backend(
      { method: "GET", path: path + "operations/" + q.qa.command.operationId },
      new AbortController().signal,
    );
    expect(calls.backend).toHaveBeenCalledTimes(2);
    for (const change of [
      { operationId: cases.cases[1 - round].command.operationId },
      { tripId: "11111111-1111-4111-8111-111111111111" },
      { payload: { description: "Different Notes" } },
      { payload: { description: q.qa.command.payload.description, title: "Unexpected" } },
      { command: "CREATE_ITEM" },
      { baseVector: [{ ...q.qa.command.baseVector[0], revision: 999 }] },
    ]) {
      const response = await bound.backend(
        { method: "POST", path: path + "commands", body: { ...q.qa.command, ...change } },
        new AbortController().signal,
      );
      expect(response.status).toBe(404);
    }
    expect(
      (
        await bound.backend(
          {
            method: "GET",
            path: path + "operations/bb0cb010-0cb4-432b-8995-670aaec95b3d",
          },
          new AbortController().signal,
        )
      ).status,
    ).toBe(404);
    expect(calls.backend).toHaveBeenCalledTimes(2);
  },
);
it("does not approve an alternate Actor or accept confirmation after expiry", async () => {
  vi.useFakeTimers();
  const q = fixture(0, true);
  const o = await options(q);
  const signal = new AbortController().signal;
  expect(
    await o.confirm(
      { ...confirmation(q), accountId: "11111111-1111-4111-8111-111111111111" },
      signal,
    ),
  ).toBe(false);
  vi.setSystemTime(q.policy.expiresAt);
  expect(await o.confirm(confirmation(q), signal)).toBe(false);
});
it("logs guide/edit-base names through the existing safe projection only", async () => {
  const q = fixture();
  const o = await options(q);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  for (const tool of ["get_otr_operating_guide", "get_trip_item_edit_base"])
    o.log({
      requestId: "11111111-1111-4111-8111-111111111111",
      status: 200,
      durationMs: 1,
      tool,
      accessToken: "NEVER_LOG_THIS_UNIT_VALUE",
    });
  expect(log).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(log.mock.calls)).not.toContain("NEVER_LOG_THIS_UNIT_VALUE");
  log.mockRestore();
});
