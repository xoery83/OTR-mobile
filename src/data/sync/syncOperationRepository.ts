import type * as SQLite from "expo-sqlite";
import { createLocalId } from "@/domain/localId";

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
  ownerUserId: string;
  status: SyncOperationStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EnqueueSyncOperation = Omit<
  SyncOperation,
  "attemptCount" | "createdAt" | "ownerUserId" | "updatedAt"
>;

export type SyncQueueDatabase = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "runAsync">;

const pendingStatuses: SyncOperationStatus[] = ["PENDING", "RETRYABLE"];
const processClaimOwner = createLocalId("sync-process");

export function createSyncOperationRepository(
  database: SyncQueueDatabase,
  getActiveUserId: () => Promise<string>,
) {
  return {
    async recoverInterrupted() {
      const now = new Date().toISOString();
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE sync_operations SET status = 'RETRYABLE', next_attempt_at = ?,
          last_error_message = 'INTERRUPTED', claim_owner = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE status = 'PROCESSING'
          AND owner_user_id = ?
          AND (claim_owner IS NULL OR claim_owner <> ? OR lease_expires_at <= ?)`,
        now,
        now,
        userId,
        processClaimOwner,
        now,
      );
    },
    async enqueue(operation: EnqueueSyncOperation) {
      const now = new Date().toISOString();
      const userId = await getActiveUserId();

      await database.runAsync(
        `INSERT INTO sync_operations (
          id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
          base_version, payload_json, owner_user_id, status, attempt_count,
          next_attempt_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        operation.id,
        operation.tripId,
        operation.entityType,
        operation.entityId,
        operation.operationType,
        operation.idempotencyKey,
        operation.baseVersion,
        operation.payloadJson,
        userId,
        operation.status,
        0,
        operation.nextAttemptAt,
        now,
        now,
      );
    },

    async listPending() {
      const userId = await getActiveUserId();
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
          owner_user_id AS ownerUserId,
          status,
          attempt_count AS attemptCount,
          next_attempt_at AS nextAttemptAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sync_operations
        WHERE owner_user_id = ? AND status IN (?, ?)
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY created_at ASC`,
        userId,
        ...pendingStatuses,
        new Date().toISOString(),
      );
    },

    async claim(id: string) {
      const now = new Date().toISOString();
      const userId = await getActiveUserId();
      const result = await database.runAsync(
        `UPDATE sync_operations SET status = 'PROCESSING', claim_owner = ?,
          lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ?
           AND status IN ('PENDING', 'RETRYABLE')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
        processClaimOwner,
        new Date(Date.now() + 5 * 60_000).toISOString(),
        now,
        id,
        userId,
        now,
      );
      return result.changes === 1;
    },

    async markProcessing(id: string) {
      await database.runAsync(
        "UPDATE sync_operations SET status = ?, claim_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?",
        "PROCESSING",
        new Date().toISOString(),
        id,
      );
    },

    async markCompleted(id: string) {
      await database.runAsync(
        "UPDATE sync_operations SET status = ?, next_attempt_at = NULL, claim_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?",
        "COMPLETED",
        new Date().toISOString(),
        id,
      );
    },

    async markConflict(id: string, error: Error) {
      await database.runAsync(
        `UPDATE sync_operations
         SET status = ?, last_error_message = ?, claim_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
        "CONFLICT",
        safeErrorCode(error),
        new Date().toISOString(),
        id,
      );
    },

    async markRetryable(id: string, error: Error, nextAttemptAt: string) {
      await database.runAsync(
        `UPDATE sync_operations
         SET status = ?, attempt_count = attempt_count + 1, next_attempt_at = ?,
             last_error_message = ?, claim_owner = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE id = ?`,
        "RETRYABLE",
        nextAttemptAt,
        safeErrorCode(error),
        new Date().toISOString(),
        id,
      );
    },
    async markFailed(id: string, error: Error) {
      await database.runAsync(
        `UPDATE sync_operations SET status = 'FAILED', last_error_message = ?,
          next_attempt_at = NULL, claim_owner = NULL, lease_expires_at = NULL,
          updated_at = ? WHERE id = ?`,
        safeErrorCode(error),
        new Date().toISOString(),
        id,
      );
    },
    async markPending(id: string) {
      await database.runAsync(
        `UPDATE sync_operations SET status = 'PENDING', next_attempt_at = NULL,
          last_error_message = 'AUTH_PAUSED', claim_owner = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
        new Date().toISOString(),
        id,
      );
    },
  };
}

function safeErrorCode(error: Error) {
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" && /^[A-Z0-9_:-]{1,100}$/.test(code)
    ? code
    : error.name === "SyncConflictError"
      ? "SYNC_CONFLICT"
      : "SYNC_FAILED";
}
