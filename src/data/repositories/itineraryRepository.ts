import type * as SQLite from "expo-sqlite";

import { createLocalId } from "@/domain/localId";
import type {
  CreateItineraryItemInput,
  ItineraryItem,
  ItinerarySyncStatus,
} from "@/domain/itinerary/types";

export type ItineraryDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export type ItineraryRepository = {
  createItineraryItem(
    tripId: string,
    input: CreateItineraryItemInput,
  ): Promise<ItineraryItem>;
  listItineraryItems(tripId: string): Promise<ItineraryItem[]>;
  getItineraryItem(id: string): Promise<ItineraryItem | null>;
  markItineraryItemSyncing(id: string): Promise<void>;
  markItineraryItemSynced(id: string, serverId: string, version: number): Promise<void>;
  markItineraryItemFailed(id: string): Promise<void>;
};

const createOperationType = "CREATE_ITINERARY";

function cleanOptional(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function validateInput(tripId: string, input: CreateItineraryItemInput) {
  if (!tripId.trim()) throw new Error("An itinerary item needs a journey.");
  if (!input.title.trim()) throw new Error("An itinerary item needs a title.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) {
    throw new Error("Itinerary date must use YYYY-MM-DD.");
  }
}

export function createItineraryRepository(
  database: ItineraryDatabase,
): ItineraryRepository {
  return {
    async createItineraryItem(tripId, input) {
      validateInput(tripId, input);

      const now = new Date().toISOString();
      const item: ItineraryItem = {
        id: createLocalId("itinerary"),
        serverId: null,
        tripId,
        title: input.title.trim(),
        scheduledDate: input.scheduledDate,
        startTime: cleanOptional(input.startTime),
        location: cleanOptional(input.location),
        notes: cleanOptional(input.notes),
        createdAt: now,
        updatedAt: now,
        syncStatus: "PENDING_CREATE",
        syncVersion: 0,
      };
      const operationId = createLocalId("operation");

      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `INSERT INTO itinerary_items (
            id, server_id, trip_id, title, scheduled_date, start_time, location, notes,
            created_at, updated_at, sync_status, sync_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          item.id,
          item.serverId,
          item.tripId,
          item.title,
          item.scheduledDate,
          item.startTime,
          item.location,
          item.notes,
          item.createdAt,
          item.updatedAt,
          item.syncStatus,
          item.syncVersion,
        );
        await database.runAsync(
          `INSERT INTO sync_operations (
            id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
            base_version, payload_json, status, attempt_count, next_attempt_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          operationId,
          item.tripId,
          "itinerary",
          item.id,
          createOperationType,
          operationId,
          null,
          JSON.stringify({ itineraryItemId: item.id }),
          "PENDING",
          0,
          null,
          now,
          now,
        );
      });

      return item;
    },

    async listItineraryItems(tripId) {
      return database.getAllAsync<ItineraryItem>(
        selectItinerarySql("WHERE trip_id = ?"),
        tripId,
      );
    },

    async getItineraryItem(id) {
      return database.getFirstAsync<ItineraryItem>(
        selectItinerarySql("WHERE id = ?"),
        id,
      );
    },

    async markItineraryItemSyncing(id) {
      await updateSyncStatus(database, id, "SYNCING");
    },

    async markItineraryItemSynced(id, serverId, version) {
      await database.runAsync(
        `UPDATE itinerary_items
         SET server_id = ?, sync_status = ?, sync_version = ?, updated_at = ?
         WHERE id = ?`,
        serverId,
        "SYNCED",
        version,
        new Date().toISOString(),
        id,
      );
    },

    async markItineraryItemFailed(id) {
      await updateSyncStatus(database, id, "FAILED");
    },
  };
}

function selectItinerarySql(where: string) {
  return `SELECT
    id,
    server_id AS serverId,
    trip_id AS tripId,
    title,
    scheduled_date AS scheduledDate,
    start_time AS startTime,
    location,
    notes,
    created_at AS createdAt,
    updated_at AS updatedAt,
    sync_status AS syncStatus,
    sync_version AS syncVersion
    FROM itinerary_items
    ${where}
    ORDER BY scheduled_date ASC, created_at ASC`;
}

async function updateSyncStatus(
  database: ItineraryDatabase,
  id: string,
  status: ItinerarySyncStatus,
) {
  await database.runAsync(
    "UPDATE itinerary_items SET sync_status = ?, updated_at = ? WHERE id = ?",
    status,
    new Date().toISOString(),
    id,
  );
}
