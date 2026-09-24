import type * as SQLite from "expo-sqlite";
import { createLocalId } from "@/domain/localId";
import { ApiClientError } from "@/data/api/client";
import { syncFailureDetails, type SyncFailureCategory } from "./syncEngine";

export type SyncOperationStatus =
  | "PENDING"
  | "PROCESSING"
  | "RETRYABLE"
  | "DEPENDENCY_BLOCKED"
  | "FAILED"
  | "CONFLICT"
  | "COMPLETED";

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
  dependencyOperationId?: string | null;
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
      await wakeCompletedDependencies(database, userId);
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
          dependency_operation_id AS dependencyOperationId,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sync_operations
        WHERE owner_user_id = ? AND status IN (?, ?)
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY created_at ASC, rowid ASC`,
        userId,
        ...pendingStatuses,
        new Date().toISOString(),
      );
    },

    async reactivateLongLivedFailures() {
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE sync_operations SET next_attempt_at = NULL, updated_at = ?
         WHERE owner_user_id = ? AND status = 'RETRYABLE'
           AND failure_category IN ('UNKNOWN', 'NETWORK', 'TIMEOUT', 'SERVER',
             'RATE_LIMIT', 'RESPONSE_INVALID')`,
        new Date().toISOString(),
        userId,
      );
    },

    async claim(id: string) {
      const now = new Date().toISOString();
      const userId = await getActiveUserId();
      const result = await database.runAsync(
        `UPDATE sync_operations SET status = 'PROCESSING', claim_owner = ?,
          lease_expires_at = ?, last_attempt_at = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ?
           AND status IN ('PENDING', 'RETRYABLE')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
        processClaimOwner,
        new Date(Date.now() + 5 * 60_000).toISOString(),
        now,
        now,
        id,
        userId,
        now,
      );
      return result.changes === 1;
    },

    async markProcessing(id: string) {
      await database.runAsync(
        "UPDATE sync_operations SET status = ?, last_attempt_at = ?, claim_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?",
        "PROCESSING",
        new Date().toISOString(),
        new Date().toISOString(),
        id,
      );
    },

    async markCompleted(id: string) {
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE sync_operations SET status = ?, next_attempt_at = NULL,
          failure_category = NULL, last_error_code = NULL, last_error_message = NULL,
          last_request_id = NULL, claim_owner = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
        "COMPLETED",
        new Date().toISOString(),
        id,
      );
      await wakeCompletedDependencies(database, userId, id);
    },

    async markConflict(id: string, error: Error) {
      const failure = errorDetails(error);
      await database.runAsync(
        `UPDATE sync_operations
         SET status = ?, failure_category = ?, last_error_code = ?, last_error_message = ?, last_request_id = ?,
             first_failed_at = COALESCE(first_failed_at, ?), claim_owner = NULL,
             lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
        "CONFLICT",
        failure.category,
        failure.code,
        failure.message,
        failure.requestId,
        new Date().toISOString(),
        new Date().toISOString(),
        id,
      );
    },

    async markRetryable(id: string, error: Error, nextAttemptAt: string) {
      const failure = errorDetails(error);
      await database.runAsync(
        `UPDATE sync_operations
         SET status = ?, attempt_count = attempt_count + 1, next_attempt_at = ?,
             failure_category = ?, last_error_code = ?, last_error_message = ?, last_request_id = ?,
             first_failed_at = COALESCE(first_failed_at, ?), claim_owner = NULL,
             lease_expires_at = NULL, updated_at = ?
         WHERE id = ?`,
        "RETRYABLE",
        nextAttemptAt,
        failure.category,
        failure.code,
        failure.message,
        failure.requestId,
        new Date().toISOString(),
        new Date().toISOString(),
        id,
      );
    },
    async markFailed(id: string, error: Error) {
      const failure = errorDetails(error);
      await database.runAsync(
        `UPDATE sync_operations SET status = 'FAILED', failure_category = ?,
          last_error_code = ?, last_error_message = ?, last_request_id = ?,
          first_failed_at = COALESCE(first_failed_at, ?),
          next_attempt_at = NULL, claim_owner = NULL, lease_expires_at = NULL,
          updated_at = ? WHERE id = ?`,
        failure.category,
        failure.code,
        failure.message,
        failure.requestId,
        new Date().toISOString(),
        new Date().toISOString(),
        id,
      );
    },
    async markPending(id: string, error?: Error) {
      const failure = error ? errorDetails(error) : null;
      await database.runAsync(
        `UPDATE sync_operations SET status = 'PENDING', next_attempt_at = NULL,
          failure_category = 'AUTH', last_error_code = ?,
          last_error_message = ?, last_request_id = ?,
          first_failed_at = COALESCE(first_failed_at, ?), claim_owner = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
        failure?.code ?? "AUTH_PAUSED",
        failure?.message ?? "Authentication is paused.",
        failure?.requestId ?? null,
        new Date().toISOString(),
        new Date().toISOString(),
        id,
      );
    },
    async markDependencyBlocked(id: string, dependencyOperationId?: string) {
      await database.runAsync(
        `UPDATE sync_operations SET status = 'DEPENDENCY_BLOCKED',
          dependency_operation_id = COALESCE(?, dependency_operation_id),
          failure_category = 'DEPENDENCY', last_error_code = 'DEPENDENCY_BLOCKED',
          last_error_message = 'Waiting for an earlier operation.', next_attempt_at = NULL,
          claim_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
        dependencyOperationId ?? null,
        new Date().toISOString(),
        id,
      );
    },
  };
}

function errorDetails(error: Error): {
  category: SyncFailureCategory;
  code: string;
  message: string;
  requestId: string | null;
} {
  const category = syncFailureDetails(error).category;
  const code = (error as Error & { code?: unknown }).code;
  const safeCode =
    typeof code === "string" && /^[A-Z0-9_:-]{1,100}$/.test(code)
      ? code
      : error.name === "SyncConflictError"
        ? "SYNC_CONFLICT"
        : "SYNC_FAILED";
  const message = error.message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]")
    .slice(0, 300);
  return {
    category,
    code: error instanceof ApiClientError && error.code ? error.code : safeCode,
    message,
    requestId: error instanceof ApiClientError ? (error.requestId ?? null) : null,
  };
}

async function wakeCompletedDependencies(
  database: SyncQueueDatabase,
  userId: string,
  completedId?: string,
) {
  await database.runAsync(
    `UPDATE sync_operations SET status = 'PENDING', failure_category = NULL,
      last_error_code = NULL, last_error_message = NULL, next_attempt_at = NULL,
      updated_at = ?
     WHERE owner_user_id = ? AND status = 'DEPENDENCY_BLOCKED'
       AND dependency_operation_id IS NOT NULL
       AND (? IS NULL OR dependency_operation_id = ?)
       AND EXISTS (SELECT 1 FROM sync_operations dependency
         WHERE dependency.id = sync_operations.dependency_operation_id
           AND dependency.owner_user_id = sync_operations.owner_user_id
           AND dependency.status = 'COMPLETED')`,
    new Date().toISOString(),
    userId,
    completedId ?? null,
    completedId ?? null,
  );
}
