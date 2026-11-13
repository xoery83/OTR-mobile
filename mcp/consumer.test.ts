import { randomUUID } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, it, vi } from "vitest";
import { createMcpHandler } from "./server";
import { loopbackServer } from "./http";
import type { BackendMutation } from "./mutation";

it.each([false, true])(
  "advertises provider-compatible OAuth policy (readOnly=%s) without dispatch",
  async (providerReadOnly) => {
    const backend = vi.fn(async () => Response.json({}, { status: 503 }));
    let resource = "";
    const host = loopbackServer((r) =>
      createMcpHandler({
        resource,
        oauth: providerReadOnly
          ? {
              authorizationScopes: { read: ["openid"] },
              metadataUrl:
                "https://mcp.example.invalid/.well-known/oauth-protected-resource/mcp",
              challenge: 'Bearer scope="openid"',
              handle: () => null,
            }
          : undefined,
        authorize: async () => ({
          accountId: randomUUID(),
          clientId: "protocol-test",
          resource,
          scopes: ["otr.trips.read"],
          expiresAt: Date.now() + 60000,
          read: async () => Response.json({}),
          backend,
        }),
      })(r),
    );
    await new Promise<void>((resolve, reject) => {
      host.once("error", reject);
      host.listen(0, "127.0.0.1", resolve);
    });
    const address = host.address();
    if (!address || typeof address === "string") throw Error("NO_ADDRESS");
    resource = `http://127.0.0.1:${address.port}/mcp`;
    const client = new Client({ name: "consumer-protocol-only", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(resource)));
      const listed = await client.listTools();
      expect(
        listed.tools.find((t) => t.name === "list_trips")?._meta?.securitySchemes,
      ).toEqual([
        { type: "oauth2", scopes: providerReadOnly ? ["openid"] : ["otr.trips.read"] },
      ]);
      expect(
        listed.tools.find((t) => t.name === "get_operation_status")?._meta
          ?.securitySchemes,
      ).toEqual([
        { type: "oauth2", scopes: providerReadOnly ? ["openid"] : ["otr.trips.read"] },
      ]);
      if (providerReadOnly) {
        expect(
          listed.tools.some((t) =>
            [
              "create_trip",
              "create_trip_item",
              "update_trip_item",
              "apply_trip_changes",
            ].includes(t.name),
          ),
        ).toBe(false);
        expect(backend).not.toHaveBeenCalled();
        return;
      }
      expect(
        listed.tools.find((t) => t.name === "create_trip_item")?._meta?.securitySchemes,
      ).toEqual([{ type: "oauth2", scopes: ["otr.trips.read", "otr.trips.write"] }]);
      const denied = await client.callTool({
        name: "create_trip_item",
        arguments: {
          request_id: randomUUID(),
          trip_id: randomUUID(),
          item: {
            family: "P3",
            title: "Synthetic QA",
            dates: { start_date: "2026-12-10", end_date: "2026-12-11" },
          },
        },
      });
      expect(denied.isError).toBe(true);
      expect(denied._meta?.["mcp/www_authenticate"]).toEqual([
        expect.stringContaining('error="insufficient_scope"'),
      ]);
      expect(denied._meta?.["mcp/www_authenticate"]).toEqual([
        expect.stringContaining('scope="otr.trips.read otr.trips.write"'),
      ]);
      expect(backend).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) =>
        host.close((e) => (e ? reject(e) : resolve())),
      );
    }
  },
);

it.each(["create_trip_item", "update_trip_item", "create_trip", "get_operation_status"])(
  "re-links when authorization expires during %s",
  async (name) => {
    const accountId = randomUUID(),
      tripId = randomUUID();
    const realNow = Date.now.bind(Date),
      expiresAt = realNow() + 60000;
    let resource = "";
    const backend = vi.fn(async () => {
      vi.spyOn(Date, "now").mockReturnValue(expiresAt + 1);
      return Response.json({}, { status: 503 });
    });
    const host = loopbackServer((r) =>
      createMcpHandler({
        resource,
        authorize: async () => ({
          accountId,
          clientId: "protocol-test",
          resource,
          scopes: ["otr.trips.read", "otr.trips.write"],
          expiresAt,
          read: async () => Response.json({}),
          backend,
        }),
        confirm: async () => true,
      })(r),
    );
    await new Promise<void>((resolve, reject) => {
      host.once("error", reject);
      host.listen(0, "127.0.0.1", resolve);
    });
    const address = host.address();
    if (!address || typeof address === "string") throw Error("NO_ADDRESS");
    resource = `http://127.0.0.1:${address.port}/mcp`;
    const client = new Client({ name: "expiry-protocol-only", version: "1" });
    const onUnauthorized = vi.fn(async () => {});
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(resource), {
        authProvider: { token: async () => "synthetic-test-token", onUnauthorized },
      }));
      const create = {
        request_id: randomUUID(),
        trip_id: tripId,
        item: {
          family: "P3",
          title: "Synthetic QA",
          dates: { start_date: "2026-12-10", end_date: "2026-12-11" },
        },
      };
      const { prepareCreate, prepareUpdate, prepareTrip, mutationIdentity } =
        await import("./mutation");
      const update = {
        request_id: randomUUID(),
        trip_id: tripId,
        item_id: randomUUID(),
        expected_revision: 1,
        change: { kind: "TEXT", title: "Private edit input" },
      };
      const tripCreate = {
        request_id: randomUUID(),
        name: "Private trip input",
        destinations: [],
      };
      const args =
        name === "create_trip_item"
          ? {
              ...create,
              mode: "APPLY",
              preview_digest: mutationIdentity(
                accountId,
                prepareCreate(accountId, create),
              ).preview_digest,
            }
          : name === "update_trip_item"
            ? {
                ...update,
                mode: "APPLY",
                preview_digest: mutationIdentity(
                  accountId,
                  prepareUpdate(accountId, update),
                ).preview_digest,
              }
            : name === "create_trip"
              ? {
                  ...tripCreate,
                  mode: "APPLY",
                  preview_digest: mutationIdentity(
                    accountId,
                    prepareTrip(accountId, tripCreate),
                  ).preview_digest,
                }
              : { trip_id: tripId, operation_id: randomUUID(), target: "ITEM" };
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      expect(result._meta?.["mcp/www_authenticate"]).toEqual([
        expect.stringContaining('error="invalid_token"'),
      ]);
      if (name === "get_operation_status")
        expect(result.structuredContent).toBeUndefined();
      else {
        expect(result.structuredContent).toMatchObject({
          outcome: "UNKNOWN",
          operation_id:
            name === "create_trip_item"
              ? create.request_id
              : name === "update_trip_item"
                ? update.request_id
                : tripCreate.request_id,
          current_revision: null,
          summary: "",
        });
        expect(JSON.stringify(result)).not.toContain("Private");
      }
      expect(backend).toHaveBeenCalledTimes(1);
      expect(onUnauthorized).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      await client.close();
      await new Promise<void>((resolve, reject) =>
        host.close((e) => (e ? reject(e) : resolve())),
      );
    }
  },
);

it("a mixed read/write batch never challenges or replays its submitted write", async () => {
  const accountId = randomUUID(), tripId = randomUUID();
  const resource = "https://mcp.example.invalid/mcp";
  const backend = vi.fn<BackendMutation>(async (request) =>
    Response.json({}, { status: request.method === "GET" ? 404 : 503 }),
  );
  const handler = createMcpHandler({
    resource,
    authorize: async () => ({
      accountId, clientId: "mixed-batch-test", resource,
      scopes: ["otr.trips.read", "otr.trips.write"], expiresAt: Date.now() + 60000,
      read: async () => new Response(null, { status: 401 }), backend,
    }),
    confirm: async () => true,
  });
  const { prepareTrip, mutationIdentity } = await import("./mutation");
  const input = { request_id: randomUUID(), name: "Synthetic batch", destinations: [] };
  const digest = mutationIdentity(accountId, prepareTrip(accountId, input)).preview_digest;
  const onUnauthorized = vi.fn(async () => {});
  const statuses: number[] = [], messages: unknown[] = [];
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    authProvider: { token: async () => "synthetic-test-token", onUnauthorized },
    fetch: async (url, init) => {
      const response = await handler(new Request(url, init));
      statuses.push(response.status);
      return response;
    },
  });
  transport.onmessage = (message) => messages.push(message);
  try {
    await transport.start();
    await transport.send([
      { jsonrpc: "2.0", id: "read", method: "tools/call", params: {
        name: "get_trip_item", arguments: { trip_id: tripId, item_id: randomUUID() },
      } },
      { jsonrpc: "2.0", id: "write", method: "tools/call", params: {
        name: "create_trip", arguments: { ...input, mode: "APPLY", preview_digest: digest },
      } },
    ]);
    expect(statuses).toEqual([200]);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(backend.mock.calls.map(([request]) => request.method)).toEqual(["GET", "POST"]);
    expect(backend.mock.calls.filter(([request]) => request.method === "POST")).toHaveLength(1);
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "read", result: expect.objectContaining({ isError: true }) }),
      expect.objectContaining({ id: "write", result: expect.objectContaining({
        structuredContent: expect.objectContaining({
          outcome: "UNKNOWN", operation_id: input.request_id, error_code: "QUERY_SAME_OPERATION",
        }),
      }) }),
    ]));
  } finally { await transport.close(); }
});
