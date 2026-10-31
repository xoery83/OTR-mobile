import { expect, it } from "vitest";
import { checkOAuthQaReads, checkOAuthQaToken } from "../../scripts/auth/mcp-oauth-qa-checks";
import { registeredHostQa } from "../../scripts/auth/registered-qa-host-session";

it("refuses a different verified Account and any write grant", async () => {
  const grant = { accountId: registeredHostQa.accountId, clientId: "qa-client",
    resource: "https://api-dev.xoery.art/mcp", scopes: ["otr.trips.read"],
    expiresAt: Date.now() + 30000 };
  const signal = new AbortController().signal;
  await checkOAuthQaToken("opaque-unit-evidence", "qa-client", async () => grant, signal);
  await expect(checkOAuthQaToken("opaque-unit-evidence", "qa-client", async () => ({
    ...grant, accountId: "26876e6e-a919-457d-bc00-78d76ba08043",
  }), signal)).rejects.toThrow();
  await expect(checkOAuthQaToken("opaque-unit-evidence", "qa-client", async () => ({
    ...grant, scopes: ["otr.trips.read", "otr.trips.write"],
  }), signal)).rejects.toThrow();
});

it("requires the owning NOT_VISIBLE receipt rather than an unavailable read or foreign payload", async () => {
  let denial: unknown = { isError: true, content: [{ type: "text", text: JSON.stringify({
    version: "otr.mcp.read/1", error: { code: "NOT_VISIBLE" },
  }) }] };
  const client = {
    listTools: async () => ({ tools: ["list_trips", "get_trip", "list_trip_items", "get_trip_item"]
      .map((name) => ({ name })) }),
    callTool: async ({ name, arguments: args }: { name: string; arguments: Record<string, unknown> }) => {
      if (args.trip_id === "9d10b9d7-6744-4355-b05d-728bf929d208") return denial;
      const values: Record<string, unknown> = {
        list_trips: { trips: [{ id: registeredHostQa.tripId }] },
        get_trip: { trip: { id: registeredHostQa.tripId } },
        list_trip_items: { items: [] },
        get_trip_item: { item: { itemId: "612d7e55-cfa8-4ba7-a625-5e0d622679da",
          tripId: registeredHostQa.tripId, family: "P3", itemRevision: 2 } },
      };
      return { content: [], structuredContent: values[name] };
    },
  };
  const signal = new AbortController().signal;
  await checkOAuthQaReads(client, signal);
  denial = { isError: true, content: [{ type: "text", text: JSON.stringify({
    version: "otr.mcp.read/1", error: { code: "BACKEND_UNAVAILABLE" },
  }) }] };
  await expect(checkOAuthQaReads(client, signal)).rejects.toThrow();
  denial = { isError: true, structuredContent: { item: "leaked" }, content: [] };
  await expect(checkOAuthQaReads(client, signal)).rejects.toThrow("QA_FOREIGN_PAYLOAD_LEAK");
});
