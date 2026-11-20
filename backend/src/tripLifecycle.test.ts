import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createTripLifecyclePgStorage,
  tripLifecycleBoundary,
  type TripLifecyclePort,
} from "./tripLifecycle";
import { tripLifecycleReceiptSchema } from "../../src/domain/trip/tripLifecycleContract";
import { createMcpL3LifecyclePort } from "./mcpL3LifecycleAdmission";
const actor = randomUUID(),
  trip = randomUUID(),
  operation = randomUUID();
const input = {
  operationId: operation,
  tripId: trip,
  expectedMetadataRevision: 2,
  graphHash: "a".repeat(64),
  reason: "Owner requested archive",
  action: "ARCHIVE" as const,
};
const receipt = {
  operationId: operation,
  tripId: trip,
  actorAccountId: actor,
  request: input,
  outcome: "APPLIED" as const,
  resultMetadataRevision: 3,
  state: "ARCHIVED" as const,
  committedAt: "2026-11-15T20:00:00Z",
};
const base = {
  version: "otr.lifecycle.read/1" as const,
  actorAccountId: actor,
  tripId: trip,
  metadataRevision: 2,
  graphHash: input.graphHash,
  state: "ACTIVE" as const,
  availableActions: ["ARCHIVE" as const, "DELETE" as const],
  impact: {
    affectedItems: [],
    hasFinancialReferences: false,
    changesOriginalFiles: false as const,
    warnings: [],
  },
  observedAt: receipt.committedAt,
};
function fixture() {
  return {
    base: vi.fn(async () => base),
    apply: vi.fn(async () => receipt),
    receipt: vi.fn(async () => receipt),
  } satisfies TripLifecyclePort;
}
function post(body: unknown = input, key = operation) {
  return new Request(`http://local/v2/trips/${trip}/lifecycle`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}
it("validates the complete request and identity before invoking the owning command", async () => {
  const p = fixture();
  expect((await tripLifecycleBoundary(post(), actor, p)).status).toBe(200);
  for (const body of [
    { ...input, tripId: randomUUID() },
    { ...input, reason: null },
    { ...input, expectedMetadataRevision: -1 },
    { ...input, action: "RESTORE" },
    { ...input, actorAccountId: randomUUID() },
  ])
    expect((await tripLifecycleBoundary(post(body), actor, p)).status).toBe(400);
  expect((await tripLifecycleBoundary(post(input, randomUUID()), actor, p)).status).toBe(
    400,
  );
  expect(p.apply).toHaveBeenCalledTimes(1);
});
it("keeps missing authority closed and rejects mismatched owning results", async () => {
  expect((await tripLifecycleBoundary(post(), actor)).status).toBe(503);
  const p = fixture();
  p.apply.mockResolvedValueOnce({ ...receipt, actorAccountId: randomUUID() });
  expect((await tripLifecycleBoundary(post(), actor, p)).status).toBe(503);
  expect(
    tripLifecycleReceiptSchema.safeParse({
      ...receipt,
      request: { ...input, operationId: randomUUID() },
    }).success,
  ).toBe(false);
});
it("blocks deletion without an owner approval binding before the owning SQL command", async () => {
  const query = vi.fn(async (_sql: string) => ({ rows: [] }));
  const port = createTripLifecyclePgStorage({
    withLease: (work) => work({ query, retire: vi.fn() }),
  });
  const response = await tripLifecycleBoundary(post({ ...input, action: "DELETE" }), actor, port);
  expect(response.status).toBe(403);
  expect(query.mock.calls).toEqual([["BEGIN"], ["ROLLBACK"]]);
});
it("cannot reach the delete command without the stored, exact first-party approval", async () => {
  const query = vi.fn(async (_sql: string, _params?: readonly unknown[]) => ({ rows: [] }));
  const clientId = randomUUID(), resource = "https://api-dev.xoery.art/mcp";
  const port = createMcpL3LifecyclePort(
    { withLease: (work) => work({ query, retire: vi.fn() }) },
    { accountId: actor, clientId, resource },
  );
  const deletion = { ...input, action: "DELETE" };
  const response = await tripLifecycleBoundary(post(deletion), actor, port);
  expect(response.status).toBe(403);
  expect(query.mock.calls).toEqual([
    ["BEGIN"],
    [expect.stringContaining("mcp_l3_assert_lifecycle"), [
      actor, clientId, resource, operation, JSON.stringify(deletion),
    ]],
    ["ROLLBACK"],
  ]);
});
it("reads the current base and immutable original result without creating an operation", async () => {
  const p = fixture();
  for (const path of [
    `/v2/trips/${trip}/lifecycle`,
    `/v2/trips/${trip}/lifecycle-operations/${operation}`,
  ]) {
    const response = await tripLifecycleBoundary(
      new Request("http://local" + path),
      actor,
      p,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
  expect(p.apply).not.toHaveBeenCalled();
  expect(
    (
      await tripLifecycleBoundary(
        new Request(`http://local/v2/trips/${trip}/lifecycle?actor=forged`),
        actor,
        p,
      )
    ).status,
  ).toBe(400);
});

it("checks current Managed OAuth before locking the exact local Consent for deletion", async () => {
  const query = vi.fn(async (_sql: string, _params?: readonly unknown[]) => ({ rows: [] }));
  const admission = vi.fn(async () => true);
  const managedConsent = { sessionId: randomUUID(), evidenceId: randomUUID(), policyHash: "a".repeat(64) };
  const clientId = randomUUID(), resource = "https://api-dev.xoery.art/mcp";
  const port = createMcpL3LifecyclePort(
    { withLease: (work) => work({ query, retire: vi.fn() }) },
    { accountId: actor, clientId, resource, managedConsent },
  );
  const deletion = { ...input, action: "DELETE" };
  expect((await tripLifecycleBoundary(post(deletion), actor, port, admission)).status).toBe(403);
  expect(admission).toHaveBeenCalledWith(actor, deletion);
  const lock = query.mock.calls.findIndex(([sql]) => sql.includes("mcp_managed_l3_assert_lifecycle"));
  expect(lock).toBeGreaterThan(0);
  expect(admission.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder[lock]);
  expect(query.mock.calls[lock][1]).toEqual([
    actor, clientId, resource, operation, JSON.stringify(deletion), JSON.stringify(managedConsent),
  ]);
  expect(query.mock.calls.some(([sql]) => sql.includes("trip_lifecycle_command("))).toBe(false);
});
