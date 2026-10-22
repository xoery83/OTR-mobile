import { getAccountGeneration } from "../auth/accountGeneration";
import {
  tripMetadataUpdateSchema,
  type TripMetadataSyncTarget,
} from "@/domain/trip/tripMetadataContract";
import {
  captureAccountScope,
  assertAccountRequestGeneration,
  assertAccountRequestContext,
} from "../auth/accountRequestContext";
import type { TripRepository } from "../repositories/tripRepository";
import {
  createSyncEngine,
  type SyncWorker,
  type SyncOperationRepository,
} from "./syncEngine";
import type { TripMetadataTransport } from "./tripMetadataTransport";

export function createTripMetadataSyncWorker(
  repository: Pick<TripRepository, "acceptMetadataUpdate">,
  transport: TripMetadataTransport,
  account: () => Promise<string>,
): SyncWorker {
  return {
    async push(operation) {
      if (
        operation.operationType !== "UPDATE_TRIP_METADATA" ||
        operation.entityType !== "TRIP" ||
        operation.id !== operation.idempotencyKey ||
        operation.entityId !== operation.tripId
      )
        throw new Error("TRIP_METADATA_QUEUE_MISMATCH");
      const scope = await captureAccountScope(account);
      if (scope.accountId !== operation.ownerUserId)
        throw new Error("TRIP_METADATA_ACCOUNT_MISMATCH");
      const request = tripMetadataUpdateSchema.parse(JSON.parse(operation.payloadJson));
      if (request.operationId !== operation.id || request.tripId !== operation.tripId)
        throw new Error("TRIP_METADATA_QUEUE_MISMATCH");
      let receipt = await transport.receipt(scope, request.operationId);
      await assertAccountRequestContext(scope, account);
      if (!receipt) receipt = await transport.update(scope, request);
      await assertAccountRequestContext(scope, account);
      await repository.acceptMetadataUpdate(receipt, scope);
    },
  };
}
export function createTripMetadataSyncCoordinator(
  queue: SyncOperationRepository,
  worker: SyncWorker,
  repository: Pick<TripRepository, "resumeMetadataUpdates">,
  portEnabled: () => boolean = () => false,
  target?: TripMetadataSyncTarget,
) {
  const selected = target && Object.freeze({ ...target });
  const engine = createSyncEngine(
    queue,
    worker,
    undefined,
    (operation) =>
      operation.operationType === "UPDATE_TRIP_METADATA" &&
      operation.entityType === "TRIP" &&
      (!selected ||
        (operation.ownerUserId === selected.accountId &&
          operation.tripId === selected.tripId &&
          operation.entityId === selected.tripId &&
          operation.id === selected.operationId &&
          operation.idempotencyKey === selected.operationId)),
  );
  return {
    async run(authState: Parameters<typeof engine.run>[0]) {
      if (!portEnabled()) return { status: "closed" as const, processedCount: 0 };
      const scope = selected && {
        accountId: selected.accountId,
        generation: getAccountGeneration(),
      };
      if (scope) assertAccountRequestGeneration(scope);
      if (authState === "AUTHENTICATED_ONLINE")
        await repository.resumeMetadataUpdates(selected);
      if (scope) assertAccountRequestGeneration(scope);
      return engine.run(authState);
    },
  };
}
