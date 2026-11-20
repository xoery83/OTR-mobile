import { randomUUID } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, it, vi } from "vitest";
import { createBetaMcpHandler, type FirstPartyApprovalPort } from "./beta";
import { loopbackServer } from "./http";
import intent from "./__fixtures__/rename-intent.json";
it("a client with no elicitation gets only a pending link until an exact current first-party decision exists", async () => {
  const host = loopbackServer((r) => handle(r));
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const address = host.address();
  if (!address || typeof address === "string") throw Error("PORT_REQUIRED");
  const resource = `http://127.0.0.1:${address.port}/mcp`;
  const request = {
    formatVersion: 3,
    operationId: intent.operationId,
    tripId: intent.tripId,
    expectedMetadataRevision: 2,
    before: intent.before,
    after: intent.after,
  };
  const receipt = {
    ...request,
    actorAccountId: intent.accountId,
    resultMetadataRevision: 3,
  };
  const backend = vi.fn(async () => Response.json(receipt));
  let phase = "PENDING";
  const link = {
    id: randomUUID(),
    url: "https://first-party.invalid/mcp/approve",
    state: "PENDING",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    completed: false,
    decisionAt: null as string | null,
  };
  const port: FirstPartyApprovalPort = {
    prepare: async () => link,
    check: async (approval) => ({
      ...link,
      state: phase === "PENDING" ? "PENDING" : "APPROVED",
      approved: phase !== "PENDING",
      decisionAt: new Date().toISOString(),
      expiresAt:
        phase === "INVALID_TIME"
          ? "invalid"
          : phase === "EXPIRED"
            ? new Date(Date.now() - 1000).toISOString()
            : link.expiresAt,
      binding: {
        accountId: phase === "WRONG" ? randomUUID() : approval.accountId,
        clientId: approval.clientId,
        resource: approval.resource,
        digest: approval.digest,
        operationIds: approval.operationIds,
      },
    }),
  };
  const handle = createBetaMcpHandler({
    resource,
    operationApproval: port,
    authorize: async () => ({
      accountId: intent.accountId,
      clientId: intent.clientId,
      resource,
      expiresAt: Date.now() + 60000,
      scopes: ["otr.trips.read", "otr.trips.write"],
      read: async () => Response.json({}),
      betaBackend: backend,
    }),
  });
  const client = new Client(
    { name: "no-elicitation-unit-NOT-Consumer", version: "1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(resource)));
    const call = {
      capabilityId: "otr.trip.update",
      toolName: "update_trip",
      pathParams: { tripId: intent.tripId },
      query: {},
      request,
    };
    const base = { call, idempotencyKey: intent.operationId };
    const preview = (await client.callTool({ name: "update_trip", arguments: base }))
      .structuredContent as any;
    expect(preview.outcome).toBe("PREVIEW");
    expect(preview.approval.url).toBe(link.url);
    expect(backend).not.toHaveBeenCalled();
    const args = { ...base, mode: "APPLY", previewDigest: preview.previewDigest };
    for (const value of ["PENDING", "WRONG", "EXPIRED", "INVALID_TIME"]) {
      phase = value;
      const result = (await client.callTool({ name: "update_trip", arguments: args }))
        .structuredContent as any;
      expect(result.outcome).toBe("NEEDS_CONFIRMATION");
      expect(backend).not.toHaveBeenCalled();
    }
    phase = "APPROVED";
    const result = (await client.callTool({ name: "update_trip", arguments: args }))
      .structuredContent as any;
    expect(result.outcome).toBe("SERVER_RESPONSE");
    expect(result.result).toEqual(receipt);
    expect(backend).toHaveBeenCalledTimes(1);
  } finally {
    await client.close();
    await handle.close();
    await new Promise<void>((resolve, reject) =>
      host.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
