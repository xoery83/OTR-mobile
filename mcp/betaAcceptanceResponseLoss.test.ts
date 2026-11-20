import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAcceptanceResponseLoss } from "./betaAcceptanceResponseLoss";
const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "otr-response-loss-test-"));
  directories.push(dir);
  const accountId = randomUUID(),
    clientId = randomUUID(),
    tripId = randomUUID(),
    operationId = randomUUID();
  const before = {
    name: "Before",
    destination: null,
    startDate: "2026-12-01",
    endDate: "2026-12-04",
    destinations: [],
  };
  const request = {
    formatVersion: 3,
    operationId,
    tripId,
    expectedMetadataRevision: 4,
    before,
    after: { ...before, name: "After" },
  };
  const config = {
    accountId,
    clientId,
    resource: "https://response-loss-test.trycloudflare.com/mcp",
    expiresAt: Date.now() + 30000,
    request,
  };
  const marker = join(dir, "consumed.json");
  const grant = {
    accountId,
    clientId,
    tokenId: randomUUID(),
    sessionId: randomUUID(),
    resource: config.resource,
    expiresAt: Date.now() + 60000,
    scopes: ["otr.trips.read", "otr.trips.write"],
  };
  const input: {
    method: "GET" | "POST";
    path: string;
    headers: { "Idempotency-Key": string };
    body: typeof request;
  } = {
    method: "POST",
    path: `/v2/trips/${tripId}/metadata`,
    headers: { "Idempotency-Key": operationId },
    body: request,
  };
  const receipt = { ...request, actorAccountId: accountId, resultMetadataRevision: 5 };
  return {
    config,
    marker,
    grant,
    input,
    receipt,
    fault: createAcceptanceResponseLoss(config, marker),
  };
}
it("suppresses exactly one verified real-result response and survives restart without rearming", async () => {
  const f = fixture();
  const response = Response.json(f.receipt);
  await expect(f.fault(f.grant, f.input, response)).rejects.toThrow(
    "ISOLATED_POST_COMMIT_RESPONSE_LOSS",
  );
  expect(await response.json()).toEqual(f.receipt);
  expect(JSON.parse(readFileSync(f.marker, "utf8")).originalOwningResult).toEqual(
    f.receipt,
  );
  await expect(
    createAcceptanceResponseLoss(f.config, f.marker)(
      f.grant,
      f.input,
      Response.json(f.receipt),
    ),
  ).resolves.toBeUndefined();
});
it.each(["account", "client", "resource", "method", "path", "key", "body"])(
  "does not affect a different %s",
  async (kind) => {
    const f = fixture();
    const grant = { ...f.grant };
    const input = { ...f.input, headers: { ...f.input.headers } };
    if (kind === "account") grant.accountId = randomUUID();
    if (kind === "client") grant.clientId = randomUUID();
    if (kind === "resource") grant.resource = "https://other.trycloudflare.com/mcp";
    if (kind === "method") input.method = "GET";
    if (kind === "path") input.path += "/other";
    if (kind === "key") input.headers["Idempotency-Key"] = randomUUID();
    if (kind === "body") input.body = { ...input.body, expectedMetadataRevision: 3 };
    await expect(
      f.fault(grant, input, Response.json(f.receipt)),
    ).resolves.toBeUndefined();
    expect(existsSync(f.marker)).toBe(false);
  },
);
it.each(["http409", "actor", "revision", "after"])(
  "does not suppress an unverified result: %s",
  async (kind) => {
    const f = fixture();
    let result = { ...f.receipt };
    if (kind === "actor") result.actorAccountId = randomUUID();
    if (kind === "revision") result.resultMetadataRevision = 6;
    if (kind === "after") result.after = { ...result.after, name: "Different" };
    await expect(
      f.fault(
        f.grant,
        f.input,
        Response.json(result, { status: kind === "http409" ? 409 : 200 }),
      ),
    ).resolves.toBeUndefined();
    expect(existsSync(f.marker)).toBe(false);
  },
);
it("expires rather than suppressing later responses", async () => {
  const f = fixture();
  vi.spyOn(Date, "now").mockReturnValue(f.config.expiresAt + 1);
  await f.fault(f.grant, f.input, Response.json(f.receipt));
  expect(existsSync(f.marker)).toBe(false);
});
it("rejects an expired, unbounded or non-isolated configuration", () => {
  const f = fixture();
  for (const config of [
    { ...f.config, expiresAt: Date.now() - 1 },
    { ...f.config, expiresAt: Date.now() + 1800001 },
    { ...f.config, resource: "https://production.example/mcp" },
  ])
    expect(() => createAcceptanceResponseLoss(config, f.marker)).toThrow(
      "ISOLATED_RESPONSE_LOSS_CONFIGURATION_REQUIRED",
    );
});
it("has a durable single winner for concurrent matching results", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.fault(f.grant, f.input, Response.json(f.receipt)),
    f.fault(f.grant, f.input, Response.json(f.receipt)),
  ]);
  expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
});
