import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createInChatConfirmationProbe,
  IN_CHAT_URI,
  IN_CHAT_DECIDE,
  IN_CHAT_RENDER,
} from "./inChatConfirmation";
import { createBetaMcpHandler } from "./beta";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { loopbackServer } from "./http";
import intent from "./__fixtures__/rename-intent.json";
function fixture(resource = intent.resource) {
  let time = Date.now(),
    revision = 3;
  const audit = vi.fn();
  const backend = vi.fn(async (request: any) => {
    expect(request.method).toBe("GET");
    return Response.json({
      formatVersion: 3,
      actorAccountId: intent.accountId,
      tripId: intent.tripId,
      metadataRevision: revision,
      metadata: intent.after,
    });
  });
  const auth = {
    accountId: intent.accountId,
    clientId: intent.clientId,
    resource,
    scopes: ["otr.trips.read", "otr.trips.write"],
    expiresAt: time + 3600000,
    read: async () => Response.json({}),
    betaBackend: backend,
  };
  const probe = createInChatConfirmationProbe({
    accountId: intent.accountId,
    clientId: intent.clientId,
    resource,
    tripId: intent.tripId,
    html: "<!doctype html><p>unit fixture</p>",
    audit,
    now: () => time,
  });
  return {
    probe,
    auth,
    audit,
    backend,
    expire: () => {
      time += 900001;
    },
    stale: () => {
      revision++;
    },
  };
}
async function prepared(f: ReturnType<typeof fixture>) {
  const value = await f.probe.prepare(f.auth, AbortSignal.timeout(10000));
  const hidden = (value._meta as any)["otr/confirmation"];
  return {
    value,
    input: {
      handle: hidden.handle,
      operationId: hidden.preview.operationId,
      previewDigest: hidden.previewDigest,
      decision: "APPROVE" as const,
    },
  };
}
it("keeps unpredictable approval context out of model output and audit; same decision is idempotent, reversal denied", async () => {
  const f = fixture(),
    { value, input } = await prepared(f);
  expect(
    JSON.stringify([value.content, value.structuredContent, f.audit.mock.calls]),
  ).not.toContain(input.handle);
  const a = await f.probe.decide(f.auth, input, AbortSignal.timeout(10000));
  expect(a.structuredContent).toMatchObject({outcome:"PROTOTYPE_APPROVED_NOT_APPLIED"});
  await f.probe.decide(f.auth, input, AbortSignal.timeout(10000));
  expect(
    f.audit.mock.calls.filter((x) => x[0].event === "IN_CHAT_DECISION"),
  ).toHaveLength(1);
  await expect(
    f.probe.decide(f.auth, { ...input, decision: "DECLINE" }, AbortSignal.timeout(10000)),
  ).rejects.toThrow("FINAL");
  expect(f.backend.mock.calls.every((x) => x[0].method === "GET")).toBe(true);
});
it("fails closed for guessed nonce, changed operation/digest/extra target, wrong principal and missing write scope", async () => {
  const f = fixture(),
    { input } = await prepared(f);
  const signal = AbortSignal.timeout(10000);
  for (const patch of [
    { handle: "0".repeat(64) },
    { operationId: randomUUID() },
    { previewDigest: "0".repeat(64) },
    { targetTripId: randomUUID() },
  ])
    await expect(
      f.probe.decide(f.auth, { ...input, ...patch }, signal),
    ).rejects.toThrow();
  for (const patch of [
    { accountId: randomUUID() },
    { clientId: randomUUID() },
    { resource: "https://different.invalid/mcp" },
    { scopes: ["otr.trips.read"] },
  ])
    await expect(f.probe.decide({ ...f.auth, ...patch }, input, signal)).rejects.toThrow(
      "AUTH",
    );
  expect(
    f.audit.mock.calls.filter((x) => x[0].event === "IN_CHAT_DECISION"),
  ).toHaveLength(0);
});
it("refusal, expiry, changed revision, restart and aborted requests never authorize a business writer", async () => {
  const signal = AbortSignal.timeout(10000);
  let f = fixture(),
    p = await prepared(f);
  await f.probe.decide(f.auth, { ...p.input, decision: "DECLINE" }, signal);
  await expect(f.probe.decide(f.auth, p.input, signal)).rejects.toThrow("FINAL");
  f = fixture();
  p = await prepared(f);
  f.expire();
  await expect(f.probe.decide(f.auth, p.input, signal)).rejects.toThrow("EXPIRED");
  f = fixture();
  p = await prepared(f);
  f.stale();
  await expect(f.probe.decide(f.auth, p.input, signal)).rejects.toThrow("STALE");
  await expect(fixture().probe.decide(f.auth, p.input, signal)).rejects.toThrow(
    "INVALID",
  );
  await expect(f.probe.prepare(f.auth, AbortSignal.abort())).rejects.toThrow();
});
it("serves official resource/app-only descriptors over real SDK wire and blocks existing business APPLY while prototype enabled", async () => {
  let handle: ReturnType<typeof createBetaMcpHandler>;
  const host = loopbackServer((r) => handle(r));
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const address = host.address();
  if (!address || typeof address === "string") throw Error();
  const resource = `http://127.0.0.1:${address.port}/mcp`,
    f = fixture(resource);
  handle = createBetaMcpHandler({
    resource,
    inChatProbe: f.probe,
    authorize: async () => f.auth,
  });
  const client = new Client(
    { name: "IN_CHAT_UNIT_NOT_REAL_CONSUMER", version: "1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(resource)));
    const tools = await client.listTools();
    expect(tools.tools.find((x) => x.name === IN_CHAT_RENDER)?._meta?.ui).toEqual({
      resourceUri: IN_CHAT_URI,
    });
    expect(tools.tools.find((x) => x.name === IN_CHAT_DECIDE)?._meta?.ui).toEqual({
      visibility: ["app"],
    });
    const html = await client.readResource({ uri: IN_CHAT_URI });
    expect(html.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    const preview = await client.callTool({ name: IN_CHAT_RENDER, arguments: {} });
    expect(preview._meta).toHaveProperty("otr/confirmation");
    const rejected = await client.callTool({
      name: "update_trip",
      arguments: {
        call: {
          capabilityId: "otr.trip.update",
          toolName: "update_trip",
          pathParams: { tripId: intent.tripId },
          query: {},
          request: {
            formatVersion: 3,
            operationId: intent.operationId,
            tripId: intent.tripId,
            expectedMetadataRevision: 2,
            before: intent.before,
            after: intent.after,
          },
        },
        mode: "APPLY",
        idempotencyKey: intent.operationId,
        previewDigest: "0".repeat(64),
      },
    });
    expect(JSON.stringify(rejected)).toContain("IN_CHAT_CONFIRMATION_PENDING");
    expect(f.backend.mock.calls.every((x) => x[0].method === "GET")).toBe(true);
  } finally {
    await client.close();
    await new Promise<void>((resolve) => host.close(() => resolve()));
  }
});
