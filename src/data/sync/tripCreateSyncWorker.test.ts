import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { SyncOperation } from "./syncOperationRepository";
import {
  createTripCreateSyncWorker,
  createTripCreateSyncCoordinator,
} from "./tripCreateSyncWorker";
import type { TripCreateTransport } from "./tripCreateTransport";

const actor = randomUUID();
function fixture() {
  const request = {
    operationId: randomUUID(),
    tripId: randomUUID(),
    name: "Harbour",
    destination: null,
    startDate: null,
    endDate: null,
  };
  const result = {
    ...request,
    actorAccountId: actor,
    ownerPersonId: randomUUID(),
    coreEpoch: randomUUID(),
    coreRevision: 1,
    coreAccessRevision: 1,
  };
  const operation = {
    id: request.operationId,
    tripId: request.tripId,
    entityType: "TRIP",
    entityId: request.tripId,
    operationType: "CREATE_TRIP",
    idempotencyKey: request.operationId,
    payloadJson: JSON.stringify({
      tripId: request.tripId,
      name: request.name,
      destination: request.destination,
      startDate: request.startDate,
      endDate: request.endDate,
    }),
    ownerUserId: actor,
  } as SyncOperation;
  const repository = {
    acceptCreate: vi.fn(async () => undefined),
    resumeCreateTrips: vi.fn(async () => {}),
  };
  const transport = {
    receipt: vi.fn(async () => null),
    create: vi.fn(async () => result),
  } as TripCreateTransport;
  return {
    request,
    result,
    operation,
    repository,
    transport,
    worker: createTripCreateSyncWorker(repository as never, transport, async () => actor),
  };
}
it("checks a durable receipt before sending once, then applies only matched owning context", async () => {
  const f = fixture();
  vi.mocked(f.transport.receipt).mockResolvedValueOnce(f.result);
  await f.worker.push(f.operation);
  expect(f.transport.create).not.toHaveBeenCalled();
  expect(f.repository.acceptCreate).toHaveBeenCalledWith(f.result);
  const g = fixture();
  await g.worker.push(g.operation);
  expect(g.transport.create).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: actor }),
    g.request,
  );
  expect(g.repository.acceptCreate).toHaveBeenCalledWith(g.result);
});
it("keeps an ambiguous create unresolved until receipt lookup on retry", async () => {
  const f = fixture();
  vi.mocked(f.transport.create).mockRejectedValueOnce(new Error("response lost"));
  await expect(f.worker.push(f.operation)).rejects.toThrow("response lost");
  expect(f.repository.acceptCreate).not.toHaveBeenCalled();
  vi.mocked(f.transport.receipt).mockResolvedValueOnce(f.result);
  await f.worker.push(f.operation);
  expect(f.transport.create).toHaveBeenCalledTimes(1);
  expect(f.repository.acceptCreate).toHaveBeenCalledOnce();
});
it("rejects another actor or changed payload before local acceptance", async () => {
  const f = fixture();
  await expect(
    f.worker.push({ ...f.operation, ownerUserId: randomUUID() }),
  ).rejects.toThrow("TRIP_CREATE_ACCOUNT_MISMATCH");
  vi.mocked(f.transport.receipt).mockResolvedValueOnce({
    ...f.result,
    name: "Different",
  });
  await expect(f.worker.push(f.operation)).rejects.toThrow(
    "TRIP_CREATE_RECEIPT_MISMATCH",
  );
  expect(f.repository.acceptCreate).not.toHaveBeenCalled();
});
it("keeps dedicated queue dormant until explicit port enablement", async () => {
  const f = fixture();
  const queue = {
    listPending: vi.fn(async () => []),
    markCompleted: vi.fn(),
    markRetryable: vi.fn(),
    markProcessing: vi.fn(),
  };
  const closed = createTripCreateSyncCoordinator(queue, f.worker, f.repository);
  expect(await closed.run("AUTHENTICATED_ONLINE")).toEqual({
    status: "closed",
    processedCount: 0,
  });
  expect(f.repository.resumeCreateTrips).not.toHaveBeenCalled();
  const enabled = createTripCreateSyncCoordinator(
    queue,
    f.worker,
    f.repository,
    () => true,
  );
  expect((await enabled.run("AUTHENTICATED_ONLINE")).processedCount).toBe(0);
  expect(f.repository.resumeCreateTrips).toHaveBeenCalledOnce();
});
