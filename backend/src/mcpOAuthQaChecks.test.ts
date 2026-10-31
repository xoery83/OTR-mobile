import { expect, it, vi } from "vitest";
import { checkOAuthQaReads, checkOAuthQaToken, closeOAuthQa, checkQaGrantRevocation } from "../../scripts/auth/mcp-oauth-qa-checks";
import { registeredHostQa } from "../../scripts/auth/registered-qa-host-session";

it("never counts revoke404 as success without fresh well-formed grant absence", async () => {
  const clientId = "83504d3f-59d4-43fd-99b1-bebc54c40f7d";
  const absent = vi.fn(async () => []);
  expect(await checkQaGrantRevocation(clientId, 204, absent)).toBe("ACKNOWLEDGED");
  expect(absent).not.toHaveBeenCalled();
  expect(await checkQaGrantRevocation(clientId, 404, absent)).toBe("ABSENT_VERIFIED");
  await expect(checkQaGrantRevocation(clientId, 404, async () => [{ client: { id: clientId } }]))
    .rejects.toThrow("QA_GRANT_REVOKE_UNCONFIRMED");
  await expect(checkQaGrantRevocation(clientId, 404, async () => ({ grants: [] }))).rejects.toThrow();
  await expect(checkQaGrantRevocation(clientId, 401, absent)).rejects.toThrow("QA_GRANT_REVOKE_REJECTED");
  expect(absent).toHaveBeenCalledOnce();
});

it("attempts grant revocation after an unknown close and never reports partial cleanup as PASS", async () => {
  const close = vi.fn(async () => { throw Error("CLOSE_TIMEOUT"); });
  const revoke = vi.fn(async () => {});
  await expect(closeOAuthQa(close, revoke)).rejects.toThrow("QA_CLEANUP_UNCONFIRMED");
  expect(revoke).toHaveBeenCalledOnce();
  revoke.mockImplementation(async () => { throw Error("REVOKE_TIMEOUT"); });
  await expect(closeOAuthQa(close, revoke)).rejects.toThrow("QA_CLEANUP_UNCONFIRMED");
  expect(revoke).toHaveBeenCalledTimes(2);
});

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

it("preserves the failing read name without recording its payload", async () => {
  let errorText = "sensitive-untrusted-body";
  const callTool = vi.fn(async () => ({ isError: true, content: [{ type: "text", text: errorText }] }));
  const client = {
    listTools: async () => ({ tools: ["get_trip", "get_trip_item", "list_trip_items", "list_trips"].map(name => ({ name })) }),
    callTool,
  };
  await expect(checkOAuthQaReads(client, new AbortController().signal))
    .rejects.toThrow(/^QA_OWN_READ_FAILED_list_trips_UNKNOWN$/);
  expect(callTool).toHaveBeenCalledOnce();
  errorText = JSON.stringify({ error: { code: "BACKEND_UNAVAILABLE", detail: "sensitive-untrusted-body" } });
  await expect(checkOAuthQaReads(client, new AbortController().signal))
    .rejects.toThrow(/^QA_OWN_READ_FAILED_list_trips_BACKEND_UNAVAILABLE$/);
});
