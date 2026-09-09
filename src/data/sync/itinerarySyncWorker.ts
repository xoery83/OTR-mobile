import type { ItineraryItem } from "@/domain/itinerary/types";

import type { ItineraryRepository } from "@/data/repositories/itineraryRepository";

import type { SyncWorker } from "./syncEngine";
import type { SyncOperation } from "./syncOperationRepository";

export type ItineraryCreateTransport = {
  createItineraryItem(input: {
    item: ItineraryItem;
    idempotencyKey: string;
  }): Promise<{ serverId: string }>;
};

const createItineraryOperationType = "CREATE_ITINERARY";

export function createItinerarySyncWorker(
  itineraryRepository: ItineraryRepository,
  transport: ItineraryCreateTransport,
): SyncWorker {
  return {
    async push(operation: SyncOperation) {
      if (
        operation.entityType !== "itinerary" ||
        operation.operationType !== createItineraryOperationType
      ) {
        throw new Error("Itinerary worker received an unsupported sync operation.");
      }

      const item = await itineraryRepository.getItineraryItem(operation.entityId);
      if (!item) throw new Error("Itinerary item is missing from local storage.");

      await itineraryRepository.markItineraryItemSyncing(item.id);

      try {
        const response = await transport.createItineraryItem({
          item,
          idempotencyKey: operation.idempotencyKey,
        });
        await itineraryRepository.markItineraryItemSynced(item.id, response.serverId);
      } catch (error) {
        await itineraryRepository.markItineraryItemFailed(item.id);
        throw error;
      }
    },
  };
}
