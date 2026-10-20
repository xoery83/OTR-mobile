import {
  captureAccountScope,
  assertAccountRequestContext,
} from "../auth/accountRequestContext";
import {
  tripCreateRequestSchema,
  type TripCreateTarget,
} from "@/domain/trip/tripCreateContract";
import type { TripRepository } from "../repositories/tripRepository";
import {
  createSyncEngine,
  type SyncWorker,
  type SyncOperationRepository,
} from "./syncEngine";
import type { TripCreateTransport } from "./tripCreateTransport";

export function createTripCreateSyncWorker(
  repository: Pick<TripRepository, "acceptCreate">,
  transport: TripCreateTransport,
  account: () => Promise<string>,
): SyncWorker {
  return {
    async push(operation) {
      if (
        operation.operationType !== "CREATE_TRIP" ||
        operation.entityType !== "TRIP" ||
        !operation.tripId ||
        operation.id !== operation.idempotencyKey ||
        operation.tripId !== operation.entityId
      )
        throw new Error("TRIP_CREATE_QUEUE_MISMATCH");
      const scope = await captureAccountScope(account);
      if (scope.accountId !== operation.ownerUserId)
        throw new Error("TRIP_CREATE_ACCOUNT_MISMATCH");
      const request = tripCreateRequestSchema.parse({
        ...JSON.parse(operation.payloadJson),
        operationId: operation.id,
      });
      if (request.tripId !== operation.tripId)
        throw new Error("TRIP_CREATE_QUEUE_MISMATCH");
      let receipt = await transport.receipt(scope, operation.id);
      await assertAccountRequestContext(scope, account);
      if (!receipt) receipt = await transport.create(scope, request);
      await assertAccountRequestContext(scope, account);
      if (
        receipt.tripId !== operation.tripId ||
        receipt.operationId !== operation.id ||
        receipt.actorAccountId !== scope.accountId ||
        receipt.name !== request.name ||
        receipt.destination !== request.destination ||
        receipt.startDate !== request.startDate ||
        receipt.endDate !== request.endDate
      )
        throw new Error("TRIP_CREATE_RECEIPT_MISMATCH");
      await repository.acceptCreate(receipt, scope);
    },
  };
}

// Explicit caller-owned wake only; no background timer or capability activation.
export function createTripCreateSyncCoordinator(
  queue: SyncOperationRepository,
  worker: SyncWorker,
  repository: Pick<TripRepository, "resumeCreateTrips">,
  portEnabled: () => boolean = () => false,
  target?: TripCreateTarget,
) {
  const engine = createSyncEngine(
    queue,
    worker,
    undefined,
    (operation) =>
      operation.operationType === "CREATE_TRIP" &&
      operation.entityType === "TRIP" &&
      (!target ||
        (operation.id === target.operationId &&
          operation.tripId === target.tripId &&
          operation.ownerUserId === target.accountId)),
  );
  return {
    async run(authState: Parameters<typeof engine.run>[0]) {
      if (!portEnabled()) return { status: "closed" as const, processedCount: 0 };
      if (authState === "AUTHENTICATED_ONLINE")
        await repository.resumeCreateTrips(target);
      return engine.run(authState);
    },
  };
}
