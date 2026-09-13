import { describe, expect, it, vi } from "vitest";

import type { ItineraryItem } from "@/domain/itinerary/types";
import { ApiClientError } from "@/data/api/client";

import { createItinerarySyncWorker } from "./itinerarySyncWorker";
import { createSyncEngine } from "./syncEngine";
import type { SyncOperation } from "./syncOperationRepository";

const item: ItineraryItem = {
  id: "itinerary-1",
  serverId: null,
  tripId: "journey-a",
  title: "Train",
  scheduledDate: "2026-09-10",
  startTime: null,
  location: null,
  notes: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  syncStatus: "PENDING_CREATE",
  syncVersion: 0,
};

const operation: SyncOperation = {
  id: "operation-1",
  tripId: item.tripId,
  entityType: "itinerary",
  entityId: item.id,
  operationType: "CREATE_ITINERARY",
  idempotencyKey: "operation-1",
  baseVersion: null,
  payloadJson: JSON.stringify({ itineraryItemId: item.id }),
  status: "PENDING",
  attemptCount: 0,
  nextAttemptAt: null,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
};

function createRepository() {
  return {
    createItineraryItem: vi.fn(),
    getItineraryItem: vi.fn().mockResolvedValue(item),
    listItineraryItems: vi.fn(),
    markItineraryItemFailed: vi.fn().mockResolvedValue(undefined),
    markItineraryItemSynced: vi.fn().mockResolvedValue(undefined),
    markItineraryItemSyncing: vi.fn().mockResolvedValue(undefined),
  };
}

describe("itinerary sync worker", () => {
  it("reconciles the original item with the fake server id", async () => {
    const repository = createRepository();
    const worker = createItinerarySyncWorker(repository, {
      createItineraryItem: vi
        .fn()
        .mockResolvedValue({ serverId: "server-1", version: 1 }),
    });

    await worker.push(operation);

    expect(repository.markItineraryItemSyncing).toHaveBeenCalledWith(item.id);
    expect(repository.markItineraryItemSynced).toHaveBeenCalledWith(
      item.id,
      "server-1",
      1,
    );
  });

  it("keeps the item local and delegates retry metadata on failure", async () => {
    const repository = createRepository();
    const worker = createItinerarySyncWorker(repository, {
      createItineraryItem: vi
        .fn()
        .mockRejectedValue(new ApiClientError("offline", "network")),
    });
    const queue = {
      listPending: vi.fn().mockResolvedValue([operation]),
      markProcessing: vi.fn().mockResolvedValue(undefined),
      markCompleted: vi.fn().mockResolvedValue(undefined),
      markRetryable: vi.fn().mockResolvedValue(undefined),
    };

    await createSyncEngine(queue, worker, () => "2026-09-09T00:01:00.000Z").run(
      "AUTHENTICATED_ONLINE",
    );

    expect(repository.markItineraryItemFailed).toHaveBeenCalledWith(item.id);
    expect(repository.createItineraryItem).not.toHaveBeenCalled();
    expect(queue.markRetryable).toHaveBeenCalledWith(
      operation.id,
      expect.objectContaining({ message: "offline" }),
      "2026-09-09T00:01:00.000Z",
    );
  });
});
