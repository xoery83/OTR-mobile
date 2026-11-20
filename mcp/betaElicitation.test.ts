import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { createBetaMcpHandler, type BetaBackend } from "./beta";
const evidence = JSON.parse(
  readFileSync(
    new URL("../docs/mcp/beta-layer1/TRIP_METADATA_HTTP_PG.json", import.meta.url),
    "utf8",
  ),
);
const sample = evidence.requests.find(
  (r: any) => r.method === "POST" && r.path === "/v2/trips" && r.status === 201,
);
it("requires an integrity-bound actual MCP confirmation round, handles decline and rejects reused approval for another request", async () => {
  const resource = "https://synthetic.invalid/mcp",
    accountId = randomUUID();
  const backend = vi.fn<BetaBackend>(async () =>
    Response.json(sample.response, { status: 201 }),
  );
  const observed: any[] = [];
  const handle = createBetaMcpHandler({
    evidence: (event) => {
      observed.push(event);
      if (event.event === "TOOL_CALL") throw Error("simulated observer failure");
    },
    resource,
    authorize: async () => ({
      accountId,
      clientId: "test-client",
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 60000,
      read: async () => Response.json({}),
      betaBackend: backend,
    }),
  });
  const call = {
    capabilityId: "otr.trip.create",
    toolName: "create_trip",
    pathParams: {},
    query: {},
    request: sample.request,
  };
  const rpc = async (
    args: unknown,
    extra: Record<string, unknown> = {},
    legacy = false,
  ) => {
    const response = await handle(
      new Request(resource, {
        method: "POST",
        headers: legacy
          ? {
              "Content-Type": "application/json",
              Accept: "application/json,text/event-stream",
              "MCP-Protocol-Version": "2025-11-25",
            }
          : {
              "Content-Type": "application/json",
              Accept: "application/json,text/event-stream",
              "MCP-Protocol-Version": "2026-07-28",
              "Mcp-Method": "tools/call",
              "Mcp-Name": "create_trip",
            },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "create_trip",
            arguments: args,
            _meta: legacy
              ? undefined
              : {
                  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
                  "io.modelcontextprotocol/clientCapabilities": {
                    elicitation: { form: {} },
                  },
                },
            ...extra,
          },
        }),
      }),
    );
    const rawBody = await response.text();
    const body = JSON.parse(
      response.headers.get("content-type")?.includes("text/event-stream")
        ? rawBody
            .split("\n")
            .find((l) => l.startsWith("data: "))!
            .slice(6)
        : rawBody,
    );
    expect(response.status, JSON.stringify(body)).toBe(200);
    return body;
  };
  const args = { call, idempotencyKey: sample.request.operationId };
  const p = await rpc(args),
    apply = {
      ...args,
      mode: "APPLY",
      previewDigest: p.result.structuredContent.previewDigest,
    };
  const pending = await rpc(apply);
  expect(pending.result.resultType).toBe("input_required");
  expect(backend).not.toHaveBeenCalled();
  const state = pending.result.requestState;
  expect(typeof state).toBe("string");
  const declined = await rpc(apply, {
    requestState: state,
    inputResponses: { approveMutation: { action: "decline" } },
  });
  expect(declined.result.structuredContent.error.code).toBe("USER_DECLINED");
  expect(backend).not.toHaveBeenCalled();
  const tampered = await rpc(apply, {
    requestState: "x" + state,
    inputResponses: { approveMutation: { action: "accept", content: { approve: true } } },
  });
  expect(tampered.error.code).toBe(-32602);
  expect(backend).not.toHaveBeenCalled();
  const changed = {
    ...args,
    call: { ...call, request: { ...sample.request, name: "Changed after confirmation" } },
  };
  const changedPreview = await rpc(changed);
  const wrong = await rpc(
    {
      ...changed,
      mode: "APPLY",
      previewDigest: changedPreview.result.structuredContent.previewDigest,
    },
    {
      requestState: state,
      inputResponses: {
        approveMutation: { action: "accept", content: { approve: true } },
      },
    },
  );
  expect(wrong.result.structuredContent.error.code).toBe("CONFIRMATION_BINDING_MISMATCH");
  expect(backend).not.toHaveBeenCalled();
  const yes = await rpc(apply, {
    requestState: state,
    inputResponses: { approveMutation: { action: "accept", content: { approve: true } } },
  });
  expect(yes.result.structuredContent.outcome).toBe("SERVER_RESPONSE");
  expect(backend).toHaveBeenCalledTimes(1);
  const accepted = observed.filter((event) => event.event === "CONFIRM_BOUND_ACCEPTED");
  expect(accepted).toHaveLength(1);
  expect(
    observed.some(
      (event) =>
        event.event === "CLIENT_CAPABILITIES" &&
        event.data.source === "MODERN_REQUEST_META" &&
        event.data.formExplicit === true,
    ),
  ).toBe(true);
  expect(accepted[0].data.verifiedBinding.digest).toBe(
    p.result.structuredContent.previewDigest,
  );
  expect(accepted[0].data.verifiedBinding.operationIds).toEqual([
    sample.request.operationId,
  ]);
  expect(observed.filter((event) => event.event === "APPLY_DISPATCHED")).toHaveLength(1);
  const legacy = await rpc(apply, {}, true);
  expect(legacy.result.structuredContent.error.code).toBe(
    "CONFIRMATION_PROTOCOL_REQUIRED",
  );
  expect(backend).toHaveBeenCalledTimes(1);
});
