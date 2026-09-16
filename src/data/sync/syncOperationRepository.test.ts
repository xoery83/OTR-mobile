import { describe, expect, it, vi } from "vitest";

import {
  createSyncOperationRepository,
  type SyncOperation,
  type SyncQueueDatabase,
} from "./syncOperationRepository";
import { createSyncEngine } from "./syncEngine";

function createInMemoryQueueDatabase() {
  const rows: SyncOperation[] = [];

  const database: SyncQueueDatabase = {
    async runAsync(sql, ...params) {
      if (sql.includes("SET status = 'PROCESSING'")) {
        const id = params[3] as string;
        const ownerUserId = params[4] as string;
        const row = rows.find(
          (item) => item.id === id && item.ownerUserId === ownerUserId,
        );
        if (row) row.status = "PROCESSING";
        return { changes: row ? 1 : 0 } as never;
      }
      const [
        id,
        tripId,
        entityType,
        entityId,
        operationType,
        idempotencyKey,
        baseVersion,
        payloadJson,
        ownerUserId,
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
        ownerUserId: ownerUserId as string,
        status: status as SyncOperation["status"],
        attemptCount: attemptCount as number,
        nextAttemptAt: nextAttemptAt as string | null,
        createdAt: createdAt as string,
        updatedAt: updatedAt as string,
      });
      return { changes: 1 } as never;
    },
    async getAllAsync(_sql, ownerUserId, ...statuses) {
      return rows.filter(
        (row) => row.ownerUserId === ownerUserId && statuses.includes(row.status),
      );
    },
  };

  return database;
}

describe("sync operation repository", () => {
  it("rehydrates pending operations from the same durable store", async () => {
    const database = createInMemoryQueueDatabase();
    const writer = createSyncOperationRepository(database, async () => "user-a");

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

    const restartedReader = createSyncOperationRepository(database, async () => "user-a");

    await expect(restartedReader.listPending()).resolves.toMatchObject([
      {
        id: "operation-1",
        entityId: "expense-1",
        ownerUserId: "user-a",
        status: "PENDING",
      },
    ]);
  });

  it("never returns another user's queued mutation", async () => {
    const database = createInMemoryQueueDatabase();
    await createSyncOperationRepository(database, async () => "user-a").enqueue({
      id: "operation-a",
      tripId: "trip-1",
      entityType: "expense",
      entityId: "expense-a",
      operationType: "create",
      idempotencyKey: "key-a",
      baseVersion: null,
      payloadJson: "{}",
      status: "PENDING",
      nextAttemptAt: null,
    });

    await expect(
      createSyncOperationRepository(database, async () => "user-b").listPending(),
    ).resolves.toEqual([]);
  });

  it("does not claim an operation after the active user changes", async () => {
    const database = createInMemoryQueueDatabase();
    const account = { userId: "user-a" };
    const repository = createSyncOperationRepository(
      database,
      async () => account.userId,
    );
    await repository.enqueue({
      id: "operation-a",
      tripId: "trip-1",
      entityType: "expense",
      entityId: "expense-a",
      operationType: "create",
      idempotencyKey: "key-a",
      baseVersion: null,
      payloadJson: "{}",
      status: "PENDING",
      nextAttemptAt: null,
    });

    account.userId = "user-b";
    await expect(repository.claim("operation-a")).resolves.toBe(false);
  });

  it("does not send user A's mutation after switching to user B", async () => {
    const database = createInMemoryQueueDatabase();
    const account = { userId: "user-a" };
    const repository = createSyncOperationRepository(
      database,
      async () => account.userId,
    );
    await repository.enqueue({
      id: "operation-a",
      tripId: "trip-1",
      entityType: "expense",
      entityId: "expense-a",
      operationType: "create",
      idempotencyKey: "key-a",
      baseVersion: null,
      payloadJson: "{}",
      status: "PENDING",
      nextAttemptAt: null,
    });
    account.userId = "user-b";
    const push = vi.fn();

    await createSyncEngine(repository, { push }).run("AUTHENTICATED_ONLINE");

    expect(push).not.toHaveBeenCalled();
  });
});
