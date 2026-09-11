import type * as SQLite from "expo-sqlite";

export type SyncOperationStatus =
  "PENDING" | "PROCESSING" | "RETRYABLE" | "FAILED" | "CONFLICT" | "COMPLETED";

export type SyncOperation = {
  id: string;
  tripId: string | null;
  entityType: string;
  entityId: string;
  operationType: string;
  idempotencyKey: string;
  baseVersion: number | null;
  payloadJson: string;
  status: SyncOperationStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EnqueueSyncOperation = Omit<
  SyncOperation,
  "attemptCount" | "createdAt" | "updatedAt"
>;

export type SyncQueueDatabase = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "runAsync">;

const pendingStatuses: SyncOperationStatus[] = ["PENDING", "RETRYABLE"];

export function createSyncOperationRepository(database: SyncQueueDatabase) {
  return {
    async enqueue(operation: EnqueueSyncOperation) {
      const now = new Date().toISOString();

      await database.runAsync(
        `INSERT INTO sync_operations (
          id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
          base_version, payload_json, status, attempt_count, next_attempt_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        operation.id,
        operation.tripId,
        operation.entityType,
        operation.entityId,
        operation.operationType,
        operation.idempotencyKey,
        operation.baseVersion,
        operation.payloadJson,
        operation.status,
        0,
        operation.nextAttemptAt,
        now,
        now,
      );
    },

    async listPending() {
      return database.getAllAsync<SyncOperation>(
        `SELECT
          id,
          trip_id AS tripId,
          entity_type AS entityType,
          entity_id AS entityId,
          operation_type AS operationType,
          idempotency_key AS idempotencyKey,
          base_version AS baseVersion,
          payload_json AS payloadJson,
          status,
          attempt_count AS attemptCount,
          next_attempt_at AS nextAttemptAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sync_operations
        WHERE status IN (?, ?)
        ORDER BY created_at ASC`,
        ...pendingStatuses,
      );
    },

    async markProcessing(id: string) {
      await database.runAsync(
        "UPDATE sync_operations SET status = ?, updated_at = ? WHERE id = ?",
        "PROCESSING",
        new Date().toISOString(),
        id,
      );
    },

    async markCompleted(id: string) {
      await database.runAsync(
        "UPDATE sync_operations SET status = ?, updated_at = ? WHERE id = ?",
        "COMPLETED",
        new Date().toISOString(),
        id,
      );
    },

    async markConflict(id: string, error: Error) {
      await database.runAsync(
        `UPDATE sync_operations
         SET status = ?, last_error_message = ?, updated_at = ? WHERE id = ?`,
        "CONFLICT",
        error.message,
        new Date().toISOString(),
        id,
      );
    },

    async markRetryable(id: string, error: Error, nextAttemptAt: string) {
      await database.runAsync(
        `UPDATE sync_operations
         SET status = ?, attempt_count = attempt_count + 1, next_attempt_at = ?,
             last_error_message = ?, updated_at = ?
         WHERE id = ?`,
        "RETRYABLE",
        nextAttemptAt,
        error.message,
        new Date().toISOString(),
        id,
      );
    },
  };
}
