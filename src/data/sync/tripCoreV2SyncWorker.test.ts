import { randomUUID, createHash } from "node:crypto";
import { it, expect, vi } from "vitest";
import {
  createCoreV2SyncCoordinator,
  createCoreV2SyncWorker,
} from "./tripCoreV2SyncWorker";
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

it("exact Core target wakes and executes only that operation, retaining other same-Trip commands", async () => {
  const f = await fixture(),
    other = { ...f.operation, id: randomUUID() };
  const context = await f.repo.captureContext(trip);
  const resume = vi.fn();
  f.repo.resume = resume;
  const queue = {
    listPending: vi.fn().mockResolvedValue([f.operation, other]),
    markProcessing: vi.fn(),
    markCompleted: vi.fn(),
  };
  const push = vi.fn();
  await createCoreV2SyncCoordinator(
    queue as never,
    { push },
    f.repo,
    trip,
    f.operation.id,
  ).run("AUTHENTICATED_ONLINE");
  expect(resume).toHaveBeenCalledExactlyOnceWith(context, f.operation.id);
  expect(push).toHaveBeenCalledExactlyOnceWith(f.operation);
  expect(queue.markCompleted).toHaveBeenCalledExactlyOnceWith(f.operation.id);
});

async function sourceFixture(family: "P1" | "P3" = "P1") {
  const f = await fixture(),
    { universalP1SourceFixture } =
      await import("../../../backend/src/__fixtures__/universalP1Source"),
    source = await universalP1SourceFixture(actor, trip, "2026-11-03", family),
    proposal = await source.run(),
    slot = proposal.body.plan.slots[0];
  const command = {
    contractVersion: 2 as const,
    intentVersion: 2 as const,
    operationId: op,
    tripId: trip,
    command: "CREATE_ITEM" as const,
    target: { kind: "ITEM" as const, id },
    baseVector: [{ kind: "ITEM" as const, id, revision: null }],
    admission: {
      mode: "REVIEWED_SOURCE" as const,
      sourceIntentId: slot.slotId,
      policyVersion: null,
    },
    payload: slot.payload,
  };
  f.repo.pending = vi.fn(async () => [{ command }] as never);
  const operation = { ...f.operation, payloadJson: canonicalCoreJson(command as Json) },
    domainReceiptId = randomUUID(),
    receipt = {
      operationId: op,
      outcome: "APPLIED",
      intentSha256: "a".repeat(64),
      receiptSha256: "b".repeat(64),
    };
  vi.mocked(f.transport.receipt).mockResolvedValue({
    projection: "FULL",
    domainReceiptId,
    receipt,
  } as never);
  f.transport.finalizeSourceOperation = vi.fn(async () => ({
    captureVersion: 2 as const,
    slotId: slot.slotId,
    state: "COMPLETE" as const,
    errorCode: null,
  }));
  return { ...f, operation, slot, receipt, domainReceiptId };
}
it.each(["P1", "P3"] as const)(
  "recovers the same accepted %s operation and finishes its Source relation without redispatch",
  async (family) => {
    const f = await sourceFixture(family);
    await f.worker.push(f.operation);
    expect(f.transport.submit).not.toHaveBeenCalled();
    expect(f.repo.pending).toHaveBeenCalledWith(expect.anything(), op);
    expect(f.transport.finalizeSourceOperation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accountId: actor, tripId: trip }),
      {
        captureVersion: 2,
        slotId: f.slot.slotId,
        operationId: op,
        intentSha256: f.receipt.intentSha256,
        domainReceiptId: f.domainReceiptId,
        receiptSha256: f.receipt.receiptSha256,
      },
    );
  },
);
it.each(["P1", "P3"] as const)(
  "retains accepted %s intent through Source finalization failure and retries only the relation",
  async (family) => {
    const f = await sourceFixture(family);
    vi.mocked(f.transport.finalizeSourceOperation!).mockRejectedValueOnce(
      Error("network lost"),
    );
    await expect(f.worker.push(f.operation)).rejects.toThrow("network lost");
    await f.worker.push(f.operation);
    expect(f.transport.submit).not.toHaveBeenCalled();
    expect(f.transport.finalizeSourceOperation).toHaveBeenCalledTimes(2);
  },
);

it.each(["P1", "P3"] as const)(
  "never resubmits an APPLIED Source %s when its owning receipt cannot be read",
  async (family) => {
    const f = await sourceFixture(family);
    vi.mocked(f.repo.pending).mockResolvedValue([
      { command: JSON.parse(f.operation.payloadJson), state: "APPLIED" },
    ] as never);
    vi.mocked(f.transport.receipt).mockResolvedValue(null);
    await expect(f.worker.push(f.operation)).rejects.toThrow(
      "CORE_ACCEPTED_RECEIPT_UNAVAILABLE",
    );
    expect(f.transport.submit).not.toHaveBeenCalled();
    expect(f.transport.capabilities).not.toHaveBeenCalled();
    expect(f.transport.finalizeSourceOperation).not.toHaveBeenCalled();
  },
);
