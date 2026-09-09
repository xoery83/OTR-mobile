import { describe, expect, it } from "vitest";

import {
  createSyncOperationRepository,
  type SyncOperation,
  type SyncQueueDatabase,
} from "./syncOperationRepository";

function createInMemoryQueueDatabase() {
  const rows: SyncOperation[] = [];

  const database: SyncQueueDatabase = {
    async runAsync(_sql, ...params) {
      const [
        id,
        tripId,
        entityType,
        entityId,
        operationType,
        idempotencyKey,
        baseVersion,
        payloadJson,
        status,
        attemptCount,
        nextAttemptAt,
        createdAt,
        updatedAt,
      ] = params;

      rows.push({
        id: id as string,
        tripId: tripId as string | null,
        entityType: entityType as string,
        entityId: entityId as string,
        operationType: operationType as string,
        idempotencyKey: idempotencyKey as string,
        baseVersion: baseVersion as number | null,
        payloadJson: payloadJson as string,
        status: status as SyncOperation["status"],
        attemptCount: attemptCount as number,
        nextAttemptAt: nextAttemptAt as string | null,
        createdAt: createdAt as string,
        updatedAt: updatedAt as string,
      });
      return {} as never;
    },
    async getAllAsync(_sql, ...statuses) {
      return rows.filter((row) => statuses.includes(row.status));
    },
  };

  return database;
}

describe("sync operation repository", () => {
  it("rehydrates pending operations from the same durable store", async () => {
    const database = createInMemoryQueueDatabase();
    const writer = createSyncOperationRepository(database);

    await writer.enqueue({
      id: "operation-1",
      tripId: "trip-1",
      entityType: "expense",
      entityId: "expense-1",
      operationType: "create",
      idempotencyKey: "key-1",
      baseVersion: null,
      payloadJson: '{"amount":42}',
      status: "PENDING",
      nextAttemptAt: null,
    });

    const restartedReader = createSyncOperationRepository(database);

    await expect(restartedReader.listPending()).resolves.toMatchObject([
      {
        id: "operation-1",
        entityId: "expense-1",
        status: "PENDING",
      },
    ]);
  });
});
