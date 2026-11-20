import { mkdtempSync, readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createBetaEvidenceRecorder } from "./betaEvidence";
it("records only the configured verified client and Trip, with expiry and bounded evidence", () => {
  const file = join(mkdtempSync(join(tmpdir(), "otr-layer3-evidence-")), "events.jsonl");
  const config = {
    accountId: randomUUID(),
    clientId: randomUUID(),
    resource: "https://owned.invalid/mcp",
    tripId: randomUUID(),
    operationId: randomUUID(),
    expiresAt: Date.now() + 60000,
  };
  const record = createBetaEvidenceRecorder(config, file);
  const event = {
    event: "PREVIEW",
    accountId: config.accountId,
    clientId: config.clientId,
    resource: config.resource,
    capabilityId: "otr.trip.update",
    data: {
      call: { pathParams: { tripId: config.tripId } },
      approval: { digest: "a".repeat(64) },
    },
  };
  expect(record.ready(event)).toBe(true);
  expect(record.ready({ ...event, clientId: randomUUID() })).toBe(false);
  record({ ...event, clientId: randomUUID() });
  record({ ...event, data: { call: { pathParams: { tripId: randomUUID() } } } });
  expect(existsSync(file)).toBe(false);
  record(event);
  expect(JSON.parse(readFileSync(file, "utf8")).data.approval.digest).toBe(
    "a".repeat(64),
  );
  expect(statSync(file).mode & 0o777).toBe(0o600);
  record({
    ...event,
    event: "SERVER_RESPONSE",
    capabilityId: "otr.metadata.operation.get",
    data: { call: { pathParams: { operationId: randomUUID() } } },
  });
  expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(1);
  record({
    ...event,
    event: "SERVER_RESPONSE",
    capabilityId: "otr.metadata.operation.get",
    data: { call: { pathParams: { operationId: config.operationId } } },
  });
  expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);

  vi.spyOn(Date, "now").mockReturnValue(config.expiresAt + 1);
  expect(record.ready(event)).toBe(false);
  record(event);
  vi.restoreAllMocks();
  expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);
  expect(() =>
    record({ ...event, data: { ...event.data, oversized: "x".repeat(140000) } }),
  ).not.toThrow();
  expect(existsSync(file + ".error")).toBe(true);
  expect(record.ready(event)).toBe(false);
});

it("requires bounded response headroom before an acceptance write", () => {
  const file = join(mkdtempSync(join(tmpdir(), "otr-layer3-budget-")), "events.jsonl");
  const config = {
    accountId: randomUUID(),
    clientId: randomUUID(),
    resource: "https://owned.invalid/mcp",
    tripId: randomUUID(),
    operationId: randomUUID(),
    expiresAt: Date.now() + 60000,
  };
  const record = createBetaEvidenceRecorder(config, file);
  const event = {
    event: "TOOL_CALL",
    accountId: config.accountId,
    clientId: config.clientId,
    resource: config.resource,
    capabilityId: "otr.trip.update",
    data: { call: { pathParams: { tripId: config.tripId } } },
  };
  expect(record.ready(event)).toBe(true);
  writeFileSync(file, "x".repeat(800000), { mode: 0o600 });
  expect(record.ready(event)).toBe(false);
});
