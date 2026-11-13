import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, it, vi } from "vitest";
import { createMcpHandler } from "./server";
import { loopbackServer } from "./http";

it.each([false, true])(
  "discovers an opt-in guide through the real protocol without business calls (enabled=%s)",
  async (enabled) => {
    const read = vi.fn(async () => Response.json({}));
    const backend = vi.fn(async () => Response.json({}));
    let resource = "";
    const host = loopbackServer((request) =>
      createMcpHandler({
        resource,
        taskAssistant: enabled,
        authorize: async () => ({
          accountId: "00000000-0000-4000-8000-000000000001",
          resource,
          scopes: ["otr.trips.read"],
          expiresAt: Date.now() + 60000,
          read,
          backend,
        }),
      })(request),
    );
    await new Promise<void>((resolve, reject) => {
      host.once("error", reject);
      host.listen(0, "127.0.0.1", resolve);
    });
    const address = host.address();
    if (!address || typeof address === "string") throw Error("NO_ADDRESS");
    resource = `http://127.0.0.1:${address.port}/mcp`;
    const client = new Client({ name: "fresh-user-chat", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(resource)));
      expect(client.getInstructions()?.includes("get_otr_operating_guide") ?? false).toBe(
        enabled,
      );
      const tools = await client.listTools();
      const guide = tools.tools.find((tool) => tool.name === "get_otr_operating_guide");
      expect(!!guide).toBe(enabled);
      if (!enabled) return;
      expect(guide?.annotations?.readOnlyHint).toBe(true);
      const operating = await client.callTool({ name: guide!.name, arguments: {} });
      expect(operating.structuredContent).toMatchObject({
        version: "otr.ai.guide/2",
        section: "OPERATING",
      });
      expect(JSON.stringify(operating)).toContain("untrusted evidence");
      expect(JSON.stringify(operating)).toContain(
        "Notes is the normal Item DTO's description field",
      );
      expect(JSON.stringify(operating)).toContain(
        "canEdit reports object-management eligibility",
      );
      expect(JSON.stringify(operating)).toContain(
        "Tool availability or a successful Preview does not grant permission either",
      );
      const fields = await client.callTool({
        name: guide!.name,
        arguments: { section: "FIELDS" },
      });
      expect(JSON.stringify(fields)).toContain("P6");
      expect(
        JSON.parse((fields.structuredContent as { text: string }).text).submission_paths
          .edit.notes,
      ).toEqual({
        read: "get_trip_item item.description is Notes (also get_trip_item_edit_base item.description)",
        write:
          "update_trip_item change.kind=TEXT; change.notes replaces Notes; preserve the entire original for append",
      });
      const caps = await client.callTool({
        name: guide!.name,
        arguments: { section: "CAPABILITIES" },
      });
      expect(JSON.stringify(caps)).toContain("UNAVAILABLE_ON_THIS_CONNECTION");
      expect(JSON.stringify(caps)).toContain("BLOCKED_OWNING_PORT_NOT_CONNECTED");
      expect(read).not.toHaveBeenCalled();
      expect(backend).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) =>
        host.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
