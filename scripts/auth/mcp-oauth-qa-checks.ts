import assert from "node:assert/strict";
import { z } from "zod";
import { registeredHostQa } from "./registered-qa-host-session";

const resource = "https://api-dev.xoery.art/mcp";
const ownItem = "612d7e55-cfa8-4ba7-a625-5e0d622679da";
const foreignTrip = "9d10b9d7-6744-4355-b05d-728bf929d208";
const foreignItem = "f3ca9163-1dbb-4d1b-8a0b-a06bce60c664";
type ReadClient = {
  listTools(): Promise<{ tools: { name: string }[] }>;
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
};
const result = z.object({
  isError: z.boolean().optional(),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

export async function closeOAuthQa(
  closeHook: () => Promise<void>, revokeGrant: () => Promise<void>,
) {
  let failed = false;
  try { await closeHook(); } catch { failed = true; }
  try { await revokeGrant(); } catch { failed = true; }
  assert(!failed, "QA_CLEANUP_UNCONFIRMED");
}

export async function checkQaGrantRevocation(
  clientId: string, status: number, readGrants: () => Promise<unknown>,
) {
  z.uuid().parse(clientId);
  if (status >= 200 && status < 300) return "ACKNOWLEDGED";
  assert.equal(status, 404, "QA_GRANT_REVOKE_REJECTED");
  const grants = z.array(z.object({ client: z.object({ id: z.uuid() }) }))
    .max(256).parse(await readGrants());
  assert(!grants.some((grant) => grant.client.id === clientId), "QA_GRANT_REVOKE_UNCONFIRMED");
  return "ABSENT_VERIFIED";
}

// DEV-only assertions for the existing official SDK harness, never an authority or token store.
export async function checkOAuthQaToken(
  accessToken: string,
  clientId: string,
  authorize: (request: Request) => Promise<{
    accountId: string; clientId: string; resource: string; scopes: readonly string[];
    expiresAt: number;
  } | null>,
  signal: AbortSignal,
) {
  const grant = await authorize(new Request(resource, {
    signal, headers: { Authorization: `Bearer ${accessToken}` },
  }));
  signal.throwIfAborted();
  assert(grant, "QA_SIGNED_ACTIVE_GRANT_REQUIRED");
  assert.equal(grant.accountId, registeredHostQa.accountId);
  assert.equal(grant.clientId, clientId);
  assert.equal(grant.resource, resource);
  assert.deepEqual(grant.scopes, ["otr.trips.read"]);
  assert(grant.expiresAt > Date.now() && grant.expiresAt <= Date.now() + 60000);
}

export async function checkOAuthQaReads(client: ReadClient, signal: AbortSignal) {
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(),
    ["get_trip", "get_trip_item", "list_trip_items", "list_trips"]);
  const call = async (name: string, args: Record<string, unknown>) => {
    signal.throwIfAborted();
    const value = result.parse(await client.callTool({ name, arguments: args }));
    signal.throwIfAborted();
    if (value.isError) {
      const text = value.content.find(entry => entry.type === "text")?.text;
      let code = "UNKNOWN";
      try {
        const parsed = z.object({ error: z.object({ code: z.enum([
          "NOT_VISIBLE", "BACKEND_UNAVAILABLE", "AUTH_REQUIRED", "INVALID_INPUT",
        ]) }) }).safeParse(JSON.parse(text ?? ""));
        if (parsed.success) code = parsed.data.error.code;
      } catch { /* Untrusted error text is never included in diagnostics. */ }
      assert.fail(`QA_OWN_READ_FAILED_${name}_${code}`);
    }
    assert(value.structuredContent, "QA_STRUCTURED_READ_REQUIRED");
    return value.structuredContent;
  };
  // Keep ordinary reads sequential so this smoke does not become a Core load test.
  const trips = await call("list_trips", {});
  const trip = await call("get_trip", { trip_id: registeredHostQa.tripId });
  const items = await call("list_trip_items", { trip_id: registeredHostQa.tripId });
  const item = await call("get_trip_item", { trip_id: registeredHostQa.tripId, item_id: ownItem });
  const ids = z.array(z.object({ id: z.uuid() })).parse(trips.trips);
  assert(ids.some((entry) => entry.id === registeredHostQa.tripId));
  assert(!ids.some((entry) => entry.id === foreignTrip));
  assert.equal(z.object({ id: z.uuid() }).parse(trip.trip).id, registeredHostQa.tripId);
  assert(Array.isArray(items.items));
  z.object({ itemId: z.literal(ownItem), tripId: z.literal(registeredHostQa.tripId),
    family: z.literal("P3"), itemRevision: z.number().int().positive() }).parse(item.item);
  const denied = result.parse(await client.callTool({ name: "get_trip_item",
    arguments: { trip_id: foreignTrip, item_id: foreignItem } }));
  signal.throwIfAborted();
  assert.equal(denied.isError, true);
  assert(!denied.structuredContent, "QA_FOREIGN_PAYLOAD_LEAK");
  const text = denied.content.find((entry) => entry.type === "text")?.text;
  assert(text, "QA_DENIAL_RECEIPT_REQUIRED");
  z.object({ version: z.literal("otr.mcp.read/1"),
    error: z.object({ code: z.literal("NOT_VISIBLE") }) }).parse(JSON.parse(text));
}
