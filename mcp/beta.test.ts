import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { tripDiscoveryBoundary } from "../backend/src/tripDiscovery";
import {
  betaCapabilities,
  betaRequest,
  createBetaMcpHandler,
  type BetaBackend,
} from "./beta";
import type { McpAuthorization } from "./server";
const resource = "https://layer3.example.invalid/mcp";
const artifact = JSON.parse(
  readFileSync(
    new URL("../docs/mcp/beta-layer1/TRIP_METADATA_HTTP_PG.json", import.meta.url),
    "utf8",
  ),
);
const create = artifact.requests.find(
  (r: any) => r.method === "POST" && r.path === "/v2/trips" && r.status === 201,
);
const call = {
  capabilityId: "otr.trip.create",
  toolName: "create_trip",
  pathParams: {},
  query: {},
  request: create.request,
};
function fixture() {
  const backend = vi.fn<BetaBackend>(async () =>
    Response.json(create.response, { status: 201 }),
  );
  const confirm = vi.fn(async () => true);
  const auth: McpAuthorization = {
    accountId: randomUUID(),
    clientId: "synthetic-client",
    resource,
    scopes: ["otr.trips.read", "otr.trips.write"],
    expiresAt: Date.now() + 60000,
    read: async () => Response.json({}),
    betaBackend: backend,
  };
  const handle = createBetaMcpHandler({ resource, authorize: async () => auth, confirm });
  const rpc = async (method: string, params?: unknown) => {
    const response = await handle(
      new Request(resource, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    expect(response.status).toBe(200);
    const wire = await response.text();
    return JSON.parse(
      response.headers.get("Content-Type")?.includes("text/event-stream")
        ? wire
            .split("\n")
            .find((line) => line.startsWith("data:"))!
            .slice(5)
        : wire,
    );
  };
  const tool = async (name: string, args: unknown) =>
    (await rpc("tools/call", { name, arguments: args })).result;
  return { backend, confirm, auth, rpc, tool, handle };
}

it("passes the default Trip List through the authenticated discovery contract", async () => {
  const f = fixture();
  const trip = {
    id: randomUUID(),
    name: "QA Trip",
    destination: null,
    startDate: null,
    endDate: null,
    createdAt: null,
    lifecycleState: "ACTIVE",
    metadataRevision: 4,
  };
  const page = { trips: [trip], nextCursor: null };
  const discoverTrips = vi.fn(async () => page);
  f.backend.mockImplementation(({ path, method }) =>
    tripDiscoveryBoundary(
      new Request(new URL(path, resource), { method }),
      f.auth.accountId,
      { discoverTrips },
    ),
  );
  const response = await f.tool("list_trips", {
    call: {
      capabilityId: "otr.trip.list",
      toolName: "list_trips",
      pathParams: {},
      query: {},
      request: {},
    },
  });
  expect(response.structuredContent).toMatchObject({
    outcome: "SERVER_RESPONSE",
    httpStatus: 200,
    result: page,
  });
  expect(discoverTrips).toHaveBeenCalledWith(f.auth.accountId, null, 20, "ACTIVE");
});

it("discovers exactly all 103 frozen capabilities with concrete schemas and the original Guide", async () => {
  const f = fixture();
  const listed = await f.rpc("tools/list");
  const tools = listed.result.tools;
  const ids = tools.flatMap((t: any) => t._meta?.capabilityIds ?? []);
  expect(ids.sort()).toEqual(betaCapabilities.map((c) => c.capabilityId).sort());
  expect(new Set(ids).size).toBe(103);
  for (const t of tools) expect(t.inputSchema.type).toBe("object");
  for (const section of ["OPERATING", "FIELDS", "CAPABILITIES", "ALL"]) {
    const g = await f.tool("get_otr_operating_guide", { section });
    expect(g.isError).not.toBe(true);
    expect(g.structuredContent.text.length).toBeGreaterThan(100);
  }
  const raw = await f.tool("get_otr_operating_guide", { section: "ALL" });
  expect(raw.structuredContent.text).toBe(
    readFileSync(new URL("../docs/mcp/beta-layer2/GUIDE.md", import.meta.url), "utf8"),
  );
  const unsupported = tools.filter((t: any) =>
    /settlement|personal_payment|personal_review/.test(t.name),
  );
  expect(unsupported.every((t: any) => t.annotations.readOnlyHint === true)).toBe(true);
  expect(f.backend).not.toHaveBeenCalled();
});
it("binds Preview and trusted confirmation to the exact downstream request/account/client/resource", async () => {
  const f = fixture();
  const args = { call, idempotencyKey: create.request.operationId };
  const p = await f.tool("create_trip", args);
  expect(p.structuredContent.outcome).toBe("PREVIEW");
  expect(f.backend).not.toHaveBeenCalled();
  const digest = p.structuredContent.previewDigest;
  const missing = await f.tool("create_trip", { ...args, mode: "APPLY" });
  expect(missing.structuredContent.outcome).toBe("NEEDS_CONFIRMATION");
  const changed = await f.tool("create_trip", {
    ...args,
    call: { ...call, request: { ...create.request, name: "Changed" } },
    mode: "APPLY",
    previewDigest: digest,
  });
  expect(changed.isError).toBe(true);
  expect(f.backend).not.toHaveBeenCalled();
  const applied = await f.tool("create_trip", {
    ...args,
    mode: "APPLY",
    previewDigest: digest,
  });
  expect(applied.structuredContent).toMatchObject({
    outcome: "SERVER_RESPONSE",
    result: create.response,
  });
  expect(f.confirm).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId: f.auth.accountId,
      clientId: f.auth.clientId,
      resource,
      digest,
      operationIds: [create.request.operationId],
    }),
    expect.any(AbortSignal),
  );
  expect(f.backend.mock.calls[0][0]).toEqual(
    betaRequest(call, create.request.operationId),
  );
});
it("rejects declined confirmation, future references and mismatched operation identity without dispatch", async () => {
  const f = fixture(),
    args = { call, idempotencyKey: create.request.operationId };
  const p = await f.tool("create_trip", args);
  f.confirm.mockResolvedValue(false);
  const declined = await f.tool("create_trip", {
    ...args,
    mode: "APPLY",
    previewDigest: p.structuredContent.previewDigest,
  });
  expect(declined.structuredContent.error.code).toBe("USER_DECLINED");
  const reference = await f.tool("create_trip", {
    ...args,
    call: {
      ...call,
      request: {
        ...create.request,
        tripId: { $result: { stepId: "future", pointer: "/tripId" } },
      },
    },
  });
  expect(reference.isError).toBe(true);
  expect(() => betaRequest(call, randomUUID())).toThrow("OPERATION_IDENTITY_MISMATCH");
  expect(f.backend).not.toHaveBeenCalled();
});
it("preserves UNKNOWN recovery identity after response loss and token expiry, including repeats", async () => {
  const f = fixture(),
    args = { call, idempotencyKey: create.request.operationId };
  const p = await f.tool("create_trip", args);
  f.backend.mockRejectedValueOnce(Error("RESPONSE_LOST"));
  const input = {
    ...args,
    mode: "APPLY",
    previewDigest: p.structuredContent.previewDigest,
  };
  const unknown = await f.tool("create_trip", input);
  expect(unknown.structuredContent).toMatchObject({
    outcome: "UNKNOWN",
    recovery: { call, idempotencyKey: create.request.operationId },
  });
  await f.tool("create_trip", input);
  expect(f.backend.mock.calls[0][0]).toEqual(f.backend.mock.calls[1][0]);
  f.backend.mockImplementationOnce(async () => {
    f.auth.expiresAt = 0;
    return Response.json(create.response, { status: 201 });
  });
  const expired = await f.tool("create_trip", input);
  expect(expired.structuredContent.outcome).toBe("UNKNOWN");
  expect(expired.structuredContent).not.toHaveProperty("result");
});
it("denies missing read/write scopes and a foreign resource", async () => {
  const f = fixture();
  f.auth.scopes = ["otr.trips.read"];
  const denied = await f.tool("create_trip", {
    call,
    idempotencyKey: create.request.operationId,
  });
  expect(denied.structuredContent.error.code).toBe("WRITE_SCOPE_REQUIRED");
  expect(f.backend).not.toHaveBeenCalled();
  f.auth.resource = "https://foreign.example.invalid/mcp";
  expect((await f.handle(new Request(resource, { method: "POST" }))).status).toBe(401);
});
