import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createTripMetadataSyncWorker } from "./tripMetadataSyncWorker";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import type { SyncOperation } from "./syncOperationRepository";
import type { TripMetadataWireReceipt } from "@/domain/trip/tripMetadataV2Contract";
function fixture(v2 = true) {
  const actor = randomUUID(),
    tripId = randomUUID(),
    operationId = randomUUID();
  const before = { name: "Before", destination: null, startDate: null, endDate: null };
  const request = {
    operationId,
    tripId,
    before,
    after: { ...before, name: "After" },
    ...(v2 ? { formatVersion: 2 as const, expectedMetadataRevision: 4 } : {}),
  };
  const result = {
    ...request,
    actorAccountId: actor,
    ...(v2 ? { resultMetadataRevision: 5 } : {}),
  } as TripMetadataWireReceipt;
  const operation = {
    id: operationId,
    ownerUserId: actor,
    tripId,
    entityId: tripId,
    entityType: "TRIP",
    operationType: "UPDATE_TRIP_METADATA",
    idempotencyKey: operationId,
    payloadJson: JSON.stringify(request),
  } as SyncOperation;
  const repository = { acceptMetadataUpdate: vi.fn() };
  const transport = {
    receipt: vi.fn(
      async (
        ..._args: Parameters<
          import("./tripMetadataTransport").TripMetadataTransport["receipt"]
        >
      ): Promise<TripMetadataWireReceipt | null> => null,
    ),
    update: vi.fn(
      async (
        ..._args: Parameters<
          import("./tripMetadataTransport").TripMetadataTransport["update"]
        >
      ) => result,
    ),
  };
  const worker = createTripMetadataSyncWorker(repository, transport, async () => actor);
  return { actor, request, result, operation, repository, transport, worker };
}
it("V2 dispatch explicitly selects V2 receipt lookup then preserves the original versioned request", async () => {
  const f = fixture();
  await f.worker.push(f.operation);
  expect(f.transport.receipt).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: f.actor }),
    f.request.operationId,
    2,
  );
  expect(f.transport.update).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: f.actor }),
    f.request,
  );
  expect(f.repository.acceptMetadataUpdate).toHaveBeenCalledWith(
    f.result,
    expect.objectContaining({ accountId: f.actor }),
  );
});
it("V1 dispatch stays V1 and never receives an invented revision", async () => {
  const f = fixture(false);
  await f.worker.push(f.operation);
  expect(f.transport.receipt.mock.calls[0]).toHaveLength(2);
  expect(f.transport.update.mock.calls[0][1]).not.toHaveProperty("formatVersion");
});
it("known V2 receipt recovers without another mutation", async () => {
  const f = fixture();
  f.transport.receipt.mockResolvedValueOnce(f.result);
  await f.worker.push(f.operation);
  expect(f.transport.update).not.toHaveBeenCalled();
  expect(f.repository.acceptMetadataUpdate).toHaveBeenCalledOnce();
});
it("version-mismatched receipt cannot complete the operation or trigger another update", async () => {
  const f = fixture(),
    {
      formatVersion: _v,
      expectedMetadataRevision: _r,
      resultMetadataRevision: _a,
      ...legacy
    } = f.result as import("@/domain/trip/tripMetadataV2Contract").TripMetadataV2Receipt;
  f.transport.receipt.mockResolvedValueOnce(legacy);
  await expect(f.worker.push(f.operation)).rejects.toThrow(
    "TRIP_METADATA_WIRE_VERSION_MISMATCH",
  );
  expect(f.transport.update).not.toHaveBeenCalled();
  expect(f.repository.acceptMetadataUpdate).not.toHaveBeenCalled();
});
it("V2 receipt recovery remains fenced across Account ABA", async () => {
  const f = fixture();
  f.transport.receipt.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    advanceAccountGeneration();
    return f.result;
  });
  await expect(f.worker.push(f.operation)).rejects.toThrow("Account changed");
  expect(f.transport.update).not.toHaveBeenCalled();
  expect(f.repository.acceptMetadataUpdate).not.toHaveBeenCalled();
});
it("malformed V2 or a queue identity mismatch cannot reach transport", async () => {
  for (const change of [
    {
      payloadJson: JSON.stringify({
        ...fixture().request,
        expectedMetadataRevision: undefined,
      }),
    },
    { idempotencyKey: randomUUID() },
    { entityId: randomUUID() },
    { ownerUserId: randomUUID() },
  ]) {
    const f = fixture();
    await expect(f.worker.push({ ...f.operation, ...change })).rejects.toBeDefined();
    expect(f.transport.receipt).not.toHaveBeenCalled();
    expect(f.transport.update).not.toHaveBeenCalled();
  }
});

it("V3 pinned receipt recovery uses same queue and cannot dispatch after finite guard expires", async () => {
  const f = fixture();
  const before = { ...f.request.before, destinations: [] };
  const request = {
    ...f.request,
    formatVersion: 3 as const,
    before,
    after: { ...before, name: "After" },
  };
  const result = { ...request, actorAccountId: f.actor, resultMetadataRevision: 5 };
  const operation = { ...f.operation, payloadJson: JSON.stringify(request) };
  f.transport.receipt.mockResolvedValueOnce(result);
  const worker = createTripMetadataSyncWorker(
    f.repository,
    f.transport,
    async () => f.actor,
  );
  await worker.push(operation);
  expect(f.transport.receipt).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: f.actor }),
    request.operationId,
    3,
  );
  expect(f.transport.update).not.toHaveBeenCalled();
  let open = true;
  f.transport.receipt.mockImplementationOnce(async () => {
    open = false;
    return null;
  });
  const guarded = createTripMetadataSyncWorker(
    f.repository,
    f.transport,
    async () => f.actor,
    () => {
      if (!open) throw Error("CLOSED");
    },
  );
  await expect(guarded.push(operation)).rejects.toThrow("CLOSED");
  expect(f.transport.update).not.toHaveBeenCalled();
});
