import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createBetaMcpHandler } from "./beta";
import { createBetaLegacySessions } from "./betaLegacySessions";
import { McpServer } from "@modelcontextprotocol/server";
import { loopbackServer } from "./http";
it("supports real legacy SDK decline/approve, isolates simultaneous request contexts and expires bounded sessions", async () => {
  const evidence = JSON.parse(
    readFileSync(
      new URL("../docs/mcp/beta-layer1/TRIP_METADATA_HTTP_PG.json", import.meta.url),
      "utf8",
    ),
  );
  const sample = evidence.requests.find(
    (r: any) => r.method === "POST" && r.path === "/v2/trips" && r.status === 201,
  );
  const ids = { A: randomUUID(), B: randomUUID() },
    writes: string[] = [];
  let handle: ReturnType<typeof createBetaMcpHandler>;
  const host = loopbackServer((r) => handle(r));
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const address = host.address();
  if (!address || typeof address === "string") throw Error("PORT_REQUIRED");
  const resource = `http://127.0.0.1:${address.port}/mcp`;
  handle = createBetaMcpHandler({
    resource,
    authorize: async (r) => {
      const token = r.headers.get("Authorization")?.slice(7);
      if (token !== "A" && token !== "B") return null;
      return {
        accountId: ids[token],
        clientId: "legacy-test",
        resource,
        expiresAt: Date.now() + 600000,
        scopes: ["otr.trips.read", "otr.trips.write"],
        read: async () => Response.json({}),
        betaBackend: async () => {
          writes.push(ids[token]);
          return Response.json(sample.response, { status: 201 });
        },
      };
    },
  });
  let approve = false,
    questions = 0;
  const client = new Client(
      { name: "real-legacy-test", version: "1" },
      { capabilities: { elicitation: { form: {} } } },
    ),
    foreign = new Client({ name: "foreign-legacy-test", version: "1" });
  client.setRequestHandler("elicitation/create", async () => {
    questions++;
    return approve
      ? { action: "accept", content: { approve: true } }
      : { action: "decline" };
  });
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { Authorization: "Bearer A" } },
  });
  const otherTransport = new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { Authorization: "Bearer B" } },
  });
  try {
    await client.connect(transport);
    await foreign.connect(otherTransport);
    expect(transport.sessionId).toBeTypeOf("string");
    const contexts = await Promise.all([
      client.callTool({ name: "get_otr_account_context", arguments: {} }),
      foreign.callTool({ name: "get_otr_account_context", arguments: {} }),
    ]);
    expect(contexts.map((r) => (r.structuredContent as any).accountId)).toEqual([
      ids.A,
      ids.B,
    ]);
    const args = {
      call: {
        capabilityId: "otr.trip.create",
        toolName: "create_trip",
        pathParams: {},
        query: {},
        request: sample.request,
      },
      idempotencyKey: sample.request.operationId,
    };
    const preview = (await client.callTool({ name: "create_trip", arguments: args }))
      .structuredContent as any;
    const apply = { ...args, mode: "APPLY", previewDigest: preview.previewDigest };
    const denied = (await client.callTool({ name: "create_trip", arguments: apply }))
      .structuredContent as any;
    expect(denied.error.code).toBe("USER_DECLINED");
    expect(writes).toHaveLength(0);
    approve = true;
    const accepted = (await client.callTool({ name: "create_trip", arguments: apply }))
      .structuredContent as any;
    expect(accepted.httpStatus).toBe(201);
    expect(questions).toBe(2);
    expect(writes).toEqual([ids.A]);
    const cross = await fetch(resource, {
      headers: { Authorization: "Bearer B", "Mcp-Session-Id": transport.sessionId! },
    });
    expect(cross.status).toBe(403);
    const retiredSession = otherTransport.sessionId!;
    await otherTransport.terminateSession();
    const retired = await fetch(resource, {
      headers: { Authorization: "Bearer B", "Mcp-Session-Id": retiredSession },
    });
    expect(retired.status).toBe(404);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 600001);
    const expired = await fetch(resource, {
      headers: { Authorization: "Bearer A", "Mcp-Session-Id": transport.sessionId! },
    });
    expect(expired.status).toBe(404);
    vi.useRealTimers();
  } finally {
    vi.useRealTimers();
    await Promise.allSettled([client.close(), foreign.close()]);
    await handle.close();
    await new Promise<void>((resolve) => host.close(() => resolve()));
  }
}, 20000);

it("caps retained transport sessions and frees capacity on explicit close", async () => {
  const sessions = createBetaLegacySessions();
  const auth = {
    accountId: randomUUID(),
    clientId: "capacity-test",
    resource: "https://synthetic.invalid/mcp",
    expiresAt: Date.now() + 600000,
    scopes: ["otr.trips.read"],
    read: async () => Response.json({}),
  };
  const request = () =>
    new Request(auth.resource, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json,text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "capacity-test", version: "1" },
        },
      }),
    });
  try {
    for (let i = 0; i < 32; i++) {
      const response = await sessions.handle(
        request(),
        auth,
        () => new McpServer({ name: "capacity-test", version: "1" }),
      );
      expect(response?.status).toBe(200);
      await response?.body?.cancel();
    }
    expect(
      (
        await sessions.handle(
          request(),
          auth,
          () => new McpServer({ name: "capacity-test", version: "1" }),
        )
      )?.status,
    ).toBe(429);
    await sessions.close();
    const response = await sessions.handle(
      request(),
      auth,
      () => new McpServer({ name: "capacity-test", version: "1" }),
    );
    expect(response?.status).toBe(200);
    await response?.body?.cancel();
  } finally {
    await sessions.close();
  }
});
