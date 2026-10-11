import { randomUUID, createHash } from "node:crypto";
import { it, expect, vi } from "vitest";
import { createCoreV2SyncWorker } from "./tripCoreV2SyncWorker";
import { coreClosedCapabilities } from "../../domain/trip/tripCoreV2Commands";
import { coreDefaults } from "../../domain/trip/tripCoreV2";
import type { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import type { CoreSyncTransport } from "./tripCoreV2SyncWorker";
import type { SyncOperation } from "./syncOperationRepository";
import { canonicalCoreJson, type Json } from "../../domain/trip/tripCoreV2Json";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
const actor = randomUUID(),
  trip = randomUUID(),
  id = randomUUID(),
  op = randomUUID();
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function fixture() {
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: op,
    tripId: trip,
    command: "CREATE_SPARSE_FLIGHT",
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      flightNumberLiteral: "NZ5069",
      departureDate: "2026-12-14",
      ...coreDefaults("member"),
    },
  };
  const ctx = await captureAccountRequestContext(trip, async () => actor),
    applyReceipt = vi.fn();
  const repo = {
    captureContext: async () => ctx,
    pending: async () => [{ command }],
    applyReceipt,
  } as unknown as ReturnType<typeof createTripCoreV2Repository>;
  const transport = {
    capabilities: vi.fn(async () => coreClosedCapabilities),
    receipt: vi.fn(async () => null),
    submit: vi.fn(),
  } as unknown as CoreSyncTransport;
  const operation = {
    id: op,
    tripId: trip,
    entityType: "TRIP_CORE_V2",
    entityId: id,
    operationType: "CORE_V2_COMMAND",
    idempotencyKey: op,
      payloadJson: canonicalCoreJson(command as unknown as Json),
    ownerUserId: actor,
  } as SyncOperation;
  return {
    worker: createCoreV2SyncWorker(repo, transport, async () => actor, hash),
    repo,
    transport,
    operation,
    applyReceipt,
  };
}
it("does not dispatch a durable command when negotiation remains CLOSED", async () => {
  const f = await fixture();
  await expect(f.worker.push(f.operation)).rejects.toThrow("CORE_CAPABILITY_CLOSED");
  expect(f.transport.submit).not.toHaveBeenCalled();
  expect(f.applyReceipt).not.toHaveBeenCalled();
});
it("looks up lost-response receipt before new capability admission and never redispatches", async () => {
  const f = await fixture(),
    receipt = { operationId: op };
  vi.mocked(f.transport.receipt).mockResolvedValue({
    projection: "FULL",
    domainReceiptId: randomUUID(),
    receipt,
  } as never);
  await f.worker.push(f.operation);
  expect(f.transport.capabilities).not.toHaveBeenCalled();
  expect(f.transport.submit).not.toHaveBeenCalled();
  expect(f.applyReceipt).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: actor, tripId: trip }),
    receipt,
  );
});
it("withholds redacted replay without fabricating accepted local facts", async () => {
  const f = await fixture();
  vi.mocked(f.transport.receipt).mockResolvedValue({
    projection: "STATUS_ONLY",
    domainReceiptId: randomUUID(),
    receiptSha256: "a".repeat(64),
    operationId: op,
    outcome: "APPLIED",
    targetRevision: null,
  });
  await expect(f.worker.push(f.operation)).rejects.toThrow(
    "CORE_CURRENT_AUTHORIZATION_REQUIRED",
  );
  expect(f.applyReceipt).not.toHaveBeenCalled();
  expect(f.transport.submit).not.toHaveBeenCalled();
});
it("rejects queue identity/intent mismatch before touching the network", async () => {
  const f = await fixture();
  await expect(f.worker.push({ ...f.operation, id: randomUUID() })).rejects.toThrow(
    "CORE_QUEUE_BINDING_MISMATCH",
  );
  expect(f.transport.receipt).not.toHaveBeenCalled();
});
it("rejects another account's operation and old Capture operation types", async () => {
  const f = await fixture();
  await expect(
    f.worker.push({ ...f.operation, ownerUserId: randomUUID() }),
  ).rejects.toThrow("CORE_ACCOUNT_CHANGED");
  await expect(
    f.worker.push({ ...f.operation, operationType: "C_EXECUTE_EVENT_SLOT" }),
  ).rejects.toThrow("CORE_UNSUPPORTED_QUEUE_OPERATION");
  expect(f.transport.receipt).not.toHaveBeenCalled();
});
