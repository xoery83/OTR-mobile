import { randomUUID } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, it, vi } from "vitest";
import { createMcpHandler } from "./server";
import { loopbackServer } from "./http";

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

it.each(["create_trip_item", "get_operation_status"])(
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
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(resource)));
      const create = {
        request_id: randomUUID(),
        trip_id: tripId,
        item: {
          family: "P3",
          title: "Synthetic QA",
          dates: { start_date: "2026-12-10", end_date: "2026-12-11" },
        },
      };
      const { prepareCreate, mutationIdentity } = await import("./mutation");
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
          : { trip_id: tripId, operation_id: randomUUID(), target: "ITEM" };
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      expect(result._meta?.["mcp/www_authenticate"]).toEqual([
        expect.stringContaining('error="invalid_token"'),
      ]);
      expect(result.structuredContent).toBeUndefined();
      expect(backend).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      await client.close();
      await new Promise<void>((resolve, reject) =>
        host.close((e) => (e ? reject(e) : resolve())),
      );
    }
  },
);
