import { describe, expect, it } from "vitest";

import type { ItineraryItem } from "@/domain/itinerary/types";

import { createItineraryRepository, type ItineraryDatabase } from "./itineraryRepository";

type OperationRow = { entityId: string; operationType: string; status: string };

function createInMemoryItineraryDatabase() {
  const items: ItineraryItem[] = [];
  const operations: OperationRow[] = [];
  let transactionCount = 0;

  const database: ItineraryDatabase = {
    async withTransactionAsync(task) {
      transactionCount += 1;
      await task();
    },
    async runAsync(sql, ...params) {
      if (sql.includes("INSERT INTO itinerary_items")) {
        const [
          id,
          serverId,
          tripId,
          title,
          scheduledDate,
          startTime,
          location,
          notes,
          createdAt,
          updatedAt,
          syncStatus,
          syncVersion,
        ] = params;
        items.push({
          id: id as string,
          serverId: serverId as string | null,
          tripId: tripId as string,
          title: title as string,
          scheduledDate: scheduledDate as string,
          startTime: startTime as string | null,
          location: location as string | null,
          notes: notes as string | null,
          createdAt: createdAt as string,
          updatedAt: updatedAt as string,
          syncStatus: syncStatus as ItineraryItem["syncStatus"],
          syncVersion: syncVersion as number,
        });
      }
      if (sql.includes("INSERT INTO sync_operations")) {
        operations.push({
          entityId: params[3] as string,
          operationType: params[4] as string,
          status: params[8] as string,
        });
      }
      if (sql.includes("SET sync_status = ?")) {
        const [status, , id] = params;
        const item = items.find((entry) => entry.id === id);
        if (item) item.syncStatus = status as ItineraryItem["syncStatus"];
      }
      if (sql.includes("SET server_id = ?")) {
        const [serverId, status, version, , id] = params;
        const item = items.find((entry) => entry.id === id);
        if (item) {
          item.serverId = serverId as string;
          item.syncStatus = status as ItineraryItem["syncStatus"];
          item.syncVersion = version as number;
        }
      }
      return {} as never;
    },
    async getAllAsync<T>(_sql: string, tripId: unknown) {
      return items.filter((item) => item.tripId === tripId) as T[];
    },
    async getFirstAsync<T>(_sql: string, id: unknown) {
      return (items.find((item) => item.id === id) ?? null) as T | null;
    },
  };

  return { database, items, operations, transactionCount: () => transactionCount };
}

describe("itinerary repository", () => {
  it("atomically creates a Journey-scoped item and exactly one global operation", async () => {
    const { database, items, operations, transactionCount } =
      createInMemoryItineraryDatabase();
    const repository = createItineraryRepository(database);

    const item = await repository.createItineraryItem("journey-a", {
      title: "Museum",
      scheduledDate: "2026-09-10",
      location: "Central City",
    });

    expect(transactionCount()).toBe(1);
    expect(items).toMatchObject([{ id: item.id, tripId: "journey-a" }]);
    expect(operations).toEqual([
      { entityId: item.id, operationType: "CREATE_ITINERARY", status: "PENDING" },
    ]);
  });

  it("keeps Journey queries isolated across repository reinitialization", async () => {
    const { database } = createInMemoryItineraryDatabase();
    const writer = createItineraryRepository(database);
    const journeyA = await writer.createItineraryItem("journey-a", {
      title: "A only",
      scheduledDate: "2026-09-10",
    });
    await writer.createItineraryItem("journey-b", {
      title: "B only",
      scheduledDate: "2026-09-11",
    });
    const restartedReader = createItineraryRepository(database);

    await expect(restartedReader.listItineraryItems("journey-a")).resolves.toMatchObject([
      { id: journeyA.id, title: "A only" },
    ]);
    await expect(restartedReader.listItineraryItems("journey-b")).resolves.toMatchObject([
      { title: "B only" },
    ]);
  });

  it("reconciles the same local row without creating a duplicate", async () => {
    const { database, items } = createInMemoryItineraryDatabase();
    const repository = createItineraryRepository(database);
    const item = await repository.createItineraryItem("journey-a", {
      title: "Ferry",
      scheduledDate: "2026-09-12",
    });

    await repository.markItineraryItemFailed(item.id);
    await repository.markItineraryItemSyncing(item.id);
    await repository.markItineraryItemSynced(item.id, "server-itinerary-1", 1);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: item.id,
      serverId: "server-itinerary-1",
      syncStatus: "SYNCED",
      syncVersion: 1,
    });
  });
});
