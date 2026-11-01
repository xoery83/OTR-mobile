import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { loadMcpQaRuntime } from "./mcpQaRuntime";
import type { CoreHttpConnection } from "./tripCoreV2Http";
import fresh from "../mcp/slice1-fresh-qa-cases.json";

// Fixture substitution only. The production loader still imports the unchanged old asset.
vi.mock("../mcp/slice1-qa-cases.json", () => import("../mcp/slice1-fresh-qa-cases.json"));
const calls = vi.hoisted(() => ({
  backend: vi.fn(async () => Response.json({ status: "UNIT_ONLY" })),
}));
vi.mock("./mcpAccountWriteBinding", () => ({
  createMcpAccountWriteBinding: () => async () => ({
    read: vi.fn(),
    backend: calls.backend,
  }),
}));
vi.mock("./mcpOAuthGrantVerifier", () => ({
  createSupabaseDevMcpGrantVerifier: () => vi.fn(async () => true),
  createSupabaseDevMcpWriteGrantVerifier: () => vi.fn(async () => true),
}));
const oldBytes = readFileSync(new URL("../mcp/slice1-qa-cases.json", import.meta.url));
const old = JSON.parse(oldBytes.toString()) as typeof fresh;
const signal = () => new AbortController().signal;
function fixture(round = 0, confirmed = false) {
  const qa = fresh.cases[round];
  const policy = {
    version: 4,
    toolProfile: "SLICE1_NOTES_EDIT",
    clientId: round
      ? "83504d3f-59d4-43fd-99b1-bebc54c40f7d"
      : "d2b8167f-ee42-4ac1-b5ef-4dc003c0d141",
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
  const module = vi.fn((_options: unknown) => async () => new Response());
  const files = {
    module: vi.fn(async () => ({
      createReadRuntime: vi.fn(),
      createWriteRuntime: module,
    })),
    asset: vi.fn(async () => new Uint8Array([1])),
  };
  const env = {
    OTR_DEV_MCP_WRITE_QA_CONFIG: JSON.stringify(policy),
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    OTR_DEV_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_transport_fixture_only",
  };
  const gateway = {
    discoverTrips: vi.fn(async () => ({ trips: [], nextCursor: null })),
    canReadTrip: vi.fn(async () => false),
  };
  const core = {
    read: {},
    commands: { withLockedCommand: vi.fn() },
  } as unknown as CoreHttpConnection;
  return { qa, policy, files, env, gateway, core, module };
}
async function options(q: ReturnType<typeof fixture>) {
  await loadMcpQaRuntime(q.env, q.gateway, q.core, q.files);
  return q.module.mock.calls[0][0] as any;
}
const confirmation = (q: ReturnType<typeof fixture>) => ({
  accountId: fresh.accountId,
  clientId: q.policy.clientId,
  resource: "https://api-dev.xoery.art/mcp",
  digest: q.qa.identity.preview_digest,
  operationIds: [q.qa.command.operationId],
});
const binding = (o: any) =>
  o.bindBackend({ accountId: fresh.accountId }, signal(), {
    accessToken: "unit-only-not-a-token",
  });
afterEach(() => vi.clearAllMocks());

it("pins the independent proposed fixture and preserves the old UNKNOWN fixture bytes", () => {
  const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  expect(
    hash(readFileSync(new URL("../mcp/slice1-fresh-qa-cases.json", import.meta.url))),
  ).toBe("6d5d4e07b14c5a5e9c692e3db24040a7dd076edddbcf8f743bbb86007169d6da");
  expect(hash(oldBytes)).toBe(
    "c87a647ed92806a85a910cf480512bdf8095570e3c453f610caa5bbb2ee7ce32",
  );
  expect(fresh.status).toBe("PROPOSED_INDEPENDENT_FRESH_CASE_NOT_AUTHORIZED_FOR_WRITE");
  expect(fresh.itemId).not.toBe(old.itemId);
});
it.each([0, 1])(
  "round %i empty confirmation refuses the exact fresh command",
  async (round) => {
    const q = fixture(round),
      o = await options(q),
      bound = await binding(o);
    expect(await o.confirm(confirmation(q), signal())).toBe(false);
    expect(
      (
        await bound.backend(
          {
            method: "POST",
            path: `/v2/trips/${fresh.tripId}/core/commands`,
            body: q.qa.command,
          },
          signal(),
        )
      ).status,
    ).toBe(404);
    expect(calls.backend).not.toHaveBeenCalled();
  },
);
it.each([0, 1])(
  "round %i unit-confirmed fresh guard accepts only exact canonical command and receipt",
  async (round) => {
    const q = fixture(round, true),
      o = await options(q),
      bound = await binding(o);
    expect(await o.confirm(confirmation(q), signal())).toBe(true);
    const path = `/v2/trips/${fresh.tripId}/core/`;
    // Object key ordering changes, not command content.
    const { payload, ...rest } = q.qa.command;
    expect(
      (
        await bound.backend(
          { method: "POST", path: path + "commands", body: { payload, ...rest } },
          signal(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await bound.backend(
          { method: "GET", path: path + "operations/" + q.qa.command.operationId },
          signal(),
        )
      ).status,
    ).toBe(200);
    for (const body of [
      old.cases[round].command,
      { ...q.qa.command, target: old.cases[round].command.target },
      { ...q.qa.command, operationId: old.cases[round].command.operationId },
      { ...q.qa.command, payload: { ...payload, title: "Extra field" } },
      { ...q.qa.command, baseVector: [{ ...q.qa.command.baseVector[0], revision: 999 }] },
    ])
      expect(
        (await bound.backend({ method: "POST", path: path + "commands", body }, signal()))
          .status,
      ).toBe(404);
    expect(
      (
        await bound.backend(
          {
            method: "GET",
            path: path + "operations/" + old.cases[round].command.operationId,
          },
          signal(),
        )
      ).status,
    ).toBe(404);
    expect(
      await o.confirm(
        {
          ...confirmation(q),
          operationIds: [old.cases[round].command.operationId],
          digest: old.cases[round].identity.preview_digest,
        },
        signal(),
      ),
    ).toBe(false);
    expect(calls.backend).toHaveBeenCalledTimes(2);
  },
);
it("rejects old, cross-client and multiple confirmation entries before module IO", async () => {
  const pair = (entry: (typeof fresh.cases)[number]) => ({
    operationId: entry.command.operationId,
    previewDigest: entry.identity.preview_digest,
  });
  for (const confirmations of [
    [pair(old.cases[0])],
    [pair(fresh.cases[1])],
    [pair(fresh.cases[0]), pair(fresh.cases[0])],
  ]) {
    const q = fixture();
    q.env.OTR_DEV_MCP_WRITE_QA_CONFIG = JSON.stringify({ ...q.policy, confirmations });
    await expect(loadMcpQaRuntime(q.env, q.gateway, q.core, q.files)).rejects.toThrow();
    expect(q.files.module).not.toHaveBeenCalled();
  }
});
