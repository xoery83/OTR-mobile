import { tripMetadataRevisionedUpdateSchema } from "../../src/domain/trip/tripMetadataV2Contract";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import intent from "./__fixtures__/mcpOperationApprovalIntent.json";
import { parseBetaCall, betaRequest } from "../../mcp/beta";
import { contentDigest } from "../../mcp/mutation";
import {
  type OperationApprovalRecord,
  createMcpOperationApprovalStore,
  createMcpOperationApprovalService,
  createMcpOperationApprovalHandler,
  createApprovalBoundMetadataPort,
} from "./mcpOperationApproval";
const scope = Object.fromEntries(
  [
    "accountId",
    "clientId",
    "resource",
    "tripId",
    "operationId",
    "oldName",
    "newName",
  ].map((k) => [k, (intent as Record<string, unknown>)[k]]),
);
const request = tripMetadataRevisionedUpdateSchema.parse({
  formatVersion: 3,
  operationId: intent.operationId,
  tripId: intent.tripId,
  expectedMetadataRevision: 2,
  before: intent.before,
  after: intent.after,
});
const call = parseBetaCall({
  capabilityId: "otr.trip.update",
  toolName: "update_trip",
  pathParams: { tripId: intent.tripId },
  query: {},
  request,
}).call;
const approval = {
  accountId: intent.accountId,
  clientId: intent.clientId,
  resource: intent.resource,
  operationIds: [intent.operationId],
  summary: "",
  digest: contentDigest({
    accountId: intent.accountId,
    clientId: intent.clientId,
    resource: intent.resource,
    call,
    request: betaRequest(call, intent.operationId),
  }),
};
function fixture() {
  let row: OperationApprovalRecord & { id: string; expiresAt: string } = {
    id: randomUUID(),
    state: "PENDING",
    accountId: intent.accountId,
    clientId: intent.clientId,
    clientName: "Synthetic app",
    resource: intent.resource,
    tripId: intent.tripId,
    operationId: intent.operationId,
    digest: approval.digest,
    call,
    completed: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    decisionAt: null as string | null,
    normalSessionId: null as string | null,
  };
  const store = vi.fn(
    async (
      action: string,
      _actor: string,
      _id: string | null,
      _context: unknown,
      decision: boolean | null,
      session: string | null,
    ) => {
      if (action === "DECIDE")
        row = {
          ...row,
          state: decision ? "APPROVED" : "DECLINED",
          normalSessionId: session,
          decisionAt: new Date().toISOString(),
        };
      return row;
    },
  );
  const service = createMcpOperationApprovalService(scope, store, "s".repeat(48));
  return {
    service,
    store,
    row: () => row,
    set: (x: Partial<typeof row>) => {
      row = { ...row, ...x };
    },
  };
}
it("binds the whole structured request and refuses model-changed identity, operation, digest and fields before storing", async () => {
  const f = fixture(),
    signal = new AbortController().signal;
  await f.service.port.prepare(approval, call, signal);
  expect(f.store).toHaveBeenCalledTimes(1);
  for (const changed of [
    { ...approval, accountId: randomUUID() },
    { ...approval, clientId: randomUUID() },
    { ...approval, resource: "https://other.invalid/mcp" },
    { ...approval, digest: "a".repeat(64) },
    { ...approval, operationIds: [randomUUID()] },
  ])
    await expect(f.service.port.prepare(changed, call, signal)).rejects.toThrow();
  await expect(
    f.service.port.prepare(
      approval,
      { ...call, request: { ...request, after: { ...intent.after, destinations: [] } } },
      signal,
    ),
  ).rejects.toThrow();
  expect(f.store).toHaveBeenCalledTimes(1);
});
it("normal first-party CSRF context binds account/session/request and cannot be replayed by another session", async () => {
  const f = fixture(),
    signal = new AbortController().signal,
    principal = { accountId: intent.accountId, sessionId: randomUUID() };
  const view = await f.service.view(f.row().id, principal, signal);
  await expect(
    f.service.decide(
      f.row().id,
      { ...principal, sessionId: randomUUID() },
      view.csrfContext!,
      true,
      signal,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    f.service.decide(
      f.row().id,
      { ...principal, accountId: randomUUID() },
      view.csrfContext!,
      true,
      signal,
    ),
  ).rejects.toMatchObject({ status: 404 });
  expect(f.store.mock.calls.some((c) => c[0] === "DECIDE")).toBe(false);
  const decision = await f.service.decide(
    f.row().id,
    principal,
    view.csrfContext!,
    true,
    signal,
  );
  expect(decision.state).toBe("APPROVED");
  expect((await f.service.port.check(approval, call, signal)).approved).toBe(true);
  f.set({ expiresAt: new Date(Date.now() - 1000).toISOString() });
  expect((await f.service.port.check(approval, call, signal)).approved).toBe(false);
});
it("a declined server decision never authorizes Apply and GET does not return session credentials", async () => {
  const f = fixture(),
    signal = new AbortController().signal,
    principal = { accountId: intent.accountId, sessionId: randomUUID() };
  const view = await f.service.view(f.row().id, principal, signal);
  expect(view).not.toHaveProperty("normalSessionId");
  await f.service.decide(f.row().id, principal, view.csrfContext!, false, signal);
  expect((await f.service.port.check(approval, call, signal)).approved).toBe(false);
});
it("HTTP rejects MCP audience via normal-auth verifier, cross-origin, unsigned decision and cross-account access", async () => {
  const f = fixture(),
    principal = { accountId: intent.accountId, sessionId: randomUUID() },
    base = new URL(intent.resource).origin;
  const handler = createMcpOperationApprovalHandler({
    origin: base,
    service: f.service,
    authenticate: async (token) =>
      token === "normal"
        ? principal
        : token === "outside"
          ? { ...principal, accountId: randomUUID() }
          : null,
  });
  const url = base + "/mcp/operation-approvals/" + f.row().id;
  const send = (
    token: string,
    method = "GET",
    headers: Record<string, string> = {},
    body?: unknown,
  ) =>
    handler(
      new Request(url, {
        method,
        headers: { Authorization: "Bearer " + token, ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  expect((await send("mcp"))?.status).toBe(401);
  expect((await send("outside"))?.status).toBe(404);
  expect(
    (
      await send(
        "normal",
        "POST",
        { Origin: "https://other.invalid" },
        { decision: "APPROVE" },
      )
    )?.status,
  ).toBe(403);
  expect(
    (await send("normal", "POST", { Origin: base }, { decision: "APPROVE" }))?.status,
  ).toBe(403);
  const view = await (await send("normal"))!.json();
  expect(
    (
      await send(
        "normal",
        "POST",
        { Origin: base, "X-OTR-Operation-Context": view.csrfContext },
        { decision: "APPROVE" },
      )
    )?.status,
  ).toBe(200);
});
it("metadata guard fails before entering the original writer and rolls back; accepted admission uses the same original transaction", async () => {
  const result = {
    ...request,
    actorAccountId: intent.accountId,
    resultMetadataRevision: 3,
  };
  let allowed = false;
  const query = vi.fn(async (sql: string) => ({
    rows:
      sql.includes("approval_for_metadata") || sql.includes("finite_scope_allowed")
        ? [{ allowed: sql.includes("approval_for_metadata") ? allowed : true }]
        : sql.startsWith("SELECT")
          ? [{ result }]
          : [],
  }));
  const connection = {
    withLease: async <T>(work: (lease: any) => Promise<T>) =>
      work({ query, retire: vi.fn() }),
  };
  const port = createApprovalBoundMetadataPort(connection, {
    accountId: intent.accountId,
    clientId: intent.clientId,
    resource: intent.resource,
  });
  await expect(port.update(intent.accountId, request)).rejects.toMatchObject({
    code: "OPERATION_APPROVAL_REQUIRED",
  });
  expect(query.mock.calls.some(([s]) => s.includes("update_command"))).toBe(false);
  expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  allowed = true;
  query.mockClear();
  expect(await port.update(intent.accountId, request)).toEqual(result);
  const sql = query.mock.calls.map(([s]) => s);
  expect(sql[0]).toBe("BEGIN");
  expect(sql[1]).toContain("approval_for_metadata");
  expect(sql.some((s) => s.includes("update_command"))).toBe(true);
  expect(sql.at(-1)).toBe("COMMIT");
});

it("ends every approval storage lease explicitly and rolls back invalid records", async () => {
  const sql: string[] = [];
  let value: unknown = fixture().row();
  const store = createMcpOperationApprovalStore({
    withLease: async (work) =>
      work({
        retire: async () => {},
        query: async (statement) => {
          sql.push(statement);
          return { rows: [{ result: value }] };
        },
      }),
  });
  await store("CHECK", intent.accountId, null, {}, null, null);
  expect(sql[0]).toBe("BEGIN");
  expect(sql.at(-1)).toBe("COMMIT");
  sql.length = 0;
  value = {};
  await expect(store("CHECK", intent.accountId, null, {}, null, null)).rejects.toThrow(
    "OPERATION_APPROVAL_UNAVAILABLE",
  );
  expect(sql.at(-1)).toBe("ROLLBACK");
});
