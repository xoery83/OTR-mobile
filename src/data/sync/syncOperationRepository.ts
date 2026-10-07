import type * as SQLite from "expo-sqlite";
import { createLocalId } from "@/domain/localId";
import { z } from "zod";
import { ApiClientError } from "@/data/api/client";
import { syncFailureDetails, type SyncFailureCategory } from "./syncEngine";
import { announceLedgerQueueWorkAvailable } from "./ledgerQueueActivity";
import {
  intelligenceWakeKind,
  wakePayloadSchema,
  type WakePayload,
  type Task,
} from "@/domain/intelligence/persistence";
import { canonicalEventJson } from "@/domain/trip/eventIntentJson";
import {
  withAccountApplyGate,
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";

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
  claimOwner?: string | null;
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
export const createSyncOperationClaimOwner = () =>
  `${processClaimOwner}:${createLocalId("claim")}`;

export function createSyncOperationRepository(
  database: SyncQueueDatabase,
  getActiveUserId: () => Promise<string>,
  clockNow: () => string = () => new Date().toISOString(),
) {
  return {
    async recoverInterrupted() {
      const now = clockNow();
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE sync_operations SET status = 'RETRYABLE', next_attempt_at = ?,
          last_error_message = 'INTERRUPTED', claim_owner = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE status = 'PROCESSING'
          AND owner_user_id = ?
          AND (claim_owner IS NULL OR
            (claim_owner <> ? AND NOT (operation_type=? AND substr(claim_owner,1,?)=?))
            OR lease_expires_at <= ?)`,
        now,
        now,
        userId,
        processClaimOwner,
        intelligenceWakeKind,
        processClaimOwner.length + 1,
        `${processClaimOwner}:`,
        now,
      );
    },
    async enqueue(operation: EnqueueSyncOperation) {
      const now = clockNow();
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
          claim_owner AS claimOwner,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sync_operations
        WHERE owner_user_id = ? AND status IN (?, ?)
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY created_at ASC, rowid ASC`,
        userId,
        ...pendingStatuses,
        clockNow(),
      );
    },

    async reactivateLongLivedFailures() {
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE sync_operations SET next_attempt_at = NULL, updated_at = ?
         WHERE owner_user_id = ? AND status = 'RETRYABLE'
           AND failure_category IN ('UNKNOWN', 'NETWORK', 'TIMEOUT', 'SERVER',
             'RATE_LIMIT', 'RESPONSE_INVALID')`,
        clockNow(),
        userId,
      );
    },

    async claim(id: string) {
      const now = clockNow();
      const userId = await getActiveUserId();
      const result = await database.runAsync(
        `UPDATE sync_operations SET status = 'PROCESSING', claim_owner = ?,
          lease_expires_at = ?, last_attempt_at = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ?
           AND status IN ('PENDING', 'RETRYABLE')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
        processClaimOwner,
        new Date(Date.parse(now) + 5 * 60_000).toISOString(),
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
        clockNow(),
        clockNow(),
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
        clockNow(),
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
        clockNow(),
        clockNow(),
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
        clockNow(),
        clockNow(),
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
        clockNow(),
        clockNow(),
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
        clockNow(),
        clockNow(),
        id,
      );
    },
    async markDependencyBlocked(id: string, dependencyOperationId?: string) {
      const userId = await getActiveUserId();
      const invalid = await database.getAllAsync<{ id: string }>(
        `SELECT dependency.id FROM sync_operations operation
         JOIN sync_operations dependency
           ON dependency.id=COALESCE(?,operation.dependency_operation_id)
          AND dependency.owner_user_id=operation.owner_user_id
         WHERE operation.id=? AND operation.owner_user_id=?
           AND dependency.operation_type=?`,
        dependencyOperationId ?? null,
        id,
        userId,
        intelligenceWakeKind,
      );
      if (invalid.length) throw new Error("INTELLIGENCE_WAKE_NOT_SUCCESS_DEPENDENCY");
      const admitted = await database.runAsync(
        `UPDATE sync_operations SET status = 'DEPENDENCY_BLOCKED',
          dependency_operation_id = COALESCE(?, dependency_operation_id),
          failure_category = 'DEPENDENCY', last_error_code = 'DEPENDENCY_BLOCKED',
          last_error_message = 'Waiting for an earlier operation.', next_attempt_at = NULL,
          claim_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?
          AND owner_user_id=? AND NOT EXISTS (SELECT 1 FROM sync_operations dependency
            WHERE dependency.id=COALESCE(?,sync_operations.dependency_operation_id)
              AND dependency.owner_user_id=sync_operations.owner_user_id
              AND dependency.operation_type=?)`,
        dependencyOperationId ?? null,
        clockNow(),
        id,
        userId,
        dependencyOperationId ?? null,
        intelligenceWakeKind,
      );
      if (admitted.changes !== 1) throw new Error("SYNC_DEPENDENCY_ADMISSION_CHANGED");
    },
  };
}

function errorDetails(error: Error): {
  category: SyncFailureCategory;
  code: string;
  message: string;
  requestId: string | null;
} {
  const category =
    error instanceof IntelligenceWakeValidationError
      ? "VALIDATION"
      : syncFailureDetails(error).category;
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
  const result = await database.runAsync(
    `UPDATE sync_operations SET status = 'PENDING', failure_category = NULL,
      last_error_code = NULL, last_error_message = NULL, next_attempt_at = NULL,
      updated_at = ?
     WHERE owner_user_id = ? AND status = 'DEPENDENCY_BLOCKED'
       AND dependency_operation_id IS NOT NULL
       AND (? IS NULL OR dependency_operation_id = ?)
       AND EXISTS (SELECT 1 FROM sync_operations dependency
         WHERE dependency.id = sync_operations.dependency_operation_id
           AND dependency.owner_user_id = sync_operations.owner_user_id
           AND dependency.status = 'COMPLETED'
           AND dependency.operation_type <> 'INTELLIGENCE_CONTINUATION_WAKE'
           AND (NOT EXISTS (SELECT 1 FROM ledger_expense_commands command WHERE command.operation_id = dependency.id)
             OR EXISTS (SELECT 1 FROM ledger_expense_operation_receipts receipt WHERE receipt.account_id = dependency.owner_user_id
               AND receipt.operation_id = dependency.id AND json_extract(receipt.receipt_json, '$.disposition') = 'APPLIED')))`,
    new Date().toISOString(),
    userId,
    completedId ?? null,
    completedId ?? null,
  );
  if (result.changes > 0) announceLedgerQueueWorkAvailable();
}

export type WakeQueueDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
export type WakeHash = (bytes: Uint8Array) => Promise<string>;
export async function intelligenceWakeIdentity(payload: WakePayload, sha256: WakeHash) {
  const body = wakePayloadSchema.parse(payload);
  return `icw:${await sha256(
    new TextEncoder().encode(
      canonicalEventJson({
        kind: intelligenceWakeKind,
        ...body,
      }),
    ),
  )}`;
}
export class IntelligenceWakeValidationError extends Error {
  readonly code = "INTELLIGENCE_WAKE_INVALID";
}
export async function validateIntelligenceWake(
  operation: SyncOperation,
  sha256: WakeHash,
) {
  let payload: WakePayload;
  try {
    payload = wakePayloadSchema.parse(JSON.parse(operation.payloadJson));
  } catch {
    throw new IntelligenceWakeValidationError("INTELLIGENCE_WAKE_BODY");
  }
  const id = await intelligenceWakeIdentity(payload, sha256);
  if (
    operation.operationType !== intelligenceWakeKind ||
    operation.entityType !== "INTELLIGENCE_CONTINUATION" ||
    operation.ownerUserId !== payload.account_id ||
    operation.entityId !== payload.task_id ||
    operation.id !== id ||
    operation.idempotencyKey !== id ||
    !Number.isSafeInteger(operation.baseVersion) ||
    (operation.baseVersion ?? 0) < 1
  )
    throw new IntelligenceWakeValidationError("INTELLIGENCE_WAKE_IDENTITY");
  return payload;
}
// Called only inside the continuation repository's Account-gated transaction.
export async function signalIntelligenceWake(
  db: WakeQueueDatabase,
  task: Task,
  sha256: WakeHash,
  now: string,
  requested?: WakePayload,
) {
  const existing = task.sync_operation_id
    ? await db.getFirstAsync<SyncOperation>(
        `${wakeSelect} WHERE id=? AND owner_user_id=?`,
        task.sync_operation_id,
        task.account_id,
      )
    : null;
  if (task.sync_operation_id && !existing) throw new Error("INTELLIGENCE_WAKE_MISSING");
  const payload = wakePayloadSchema.parse(
    requested ??
      (existing
        ? JSON.parse(existing.payloadJson)
        : {
            version: 1,
            account_id: task.account_id,
            task_id: task.task_id,
            expected_publication_fence: task.publication_fence,
            wake_reason: "REEVALUATE",
          }),
  );
  if (
    payload.account_id !== task.account_id ||
    payload.task_id !== task.task_id ||
    (!existing && payload.expected_publication_fence !== task.publication_fence)
  )
    throw new Error("INTELLIGENCE_WAKE_SCOPE");
  const id = await intelligenceWakeIdentity(payload, sha256);
  if (existing) {
    await validateIntelligenceWake(existing, sha256);
    if (
      existing.id !== id ||
      canonicalEventJson(JSON.parse(existing.payloadJson)) !==
        canonicalEventJson(payload) ||
      existing.tripId !== task.trip_id ||
      existing.baseVersion === Number.MAX_SAFE_INTEGER
    )
      throw new Error("INTELLIGENCE_CHANGED_WAKE");
    await db.runAsync(
      `UPDATE sync_operations SET base_version=base_version+1,
      status=CASE WHEN status='PROCESSING' THEN status ELSE 'PENDING' END,
      next_attempt_at=NULL, failure_category=NULL, updated_at=?
      WHERE id=? AND owner_user_id=?`,
      now,
      id,
      task.account_id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO sync_operations
      (id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,
       base_version,payload_json,status,attempt_count,created_at,updated_at)
      VALUES(?,?,?,'INTELLIGENCE_CONTINUATION',?,?,?,1,?,'PENDING',0,?,?)`,
      id,
      task.account_id,
      task.trip_id,
      task.task_id,
      intelligenceWakeKind,
      id,
      canonicalEventJson(payload),
      now,
      now,
    );
  }
  return id;
}
const wakeSelect = `SELECT id,owner_user_id AS ownerUserId,trip_id AS tripId,
  entity_type AS entityType,entity_id AS entityId,operation_type AS operationType,
  idempotency_key AS idempotencyKey,base_version AS baseVersion,payload_json AS payloadJson,
  status,attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,
  claim_owner AS claimOwner,created_at AS createdAt,updated_at AS updatedAt FROM sync_operations`;
export function createIntelligenceWakeQueue(
  db: WakeQueueDatabase,
  deps: {
    getAccountId(): Promise<string>;
    sha256: WakeHash;
    now(): string;
  },
) {
  async function gated<T>(context: AccountRequestContext, work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      await assertAccountRequestContext(context, deps.getAccountId);
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await work();
        await assertAccountRequestContext(context, deps.getAccountId);
      });
      return result;
    });
  }
  function scope(context: AccountRequestContext, operation: SyncOperation) {
    // Authority comes from the trusted queue row and Account context, never its body.
    if (
      operation.ownerUserId !== context.accountId ||
      operation.tripId !== (context.tripId || null) ||
      operation.operationType !== intelligenceWakeKind
    )
      throw new Error("INTELLIGENCE_WAKE_SCOPE");
  }
  const identityColumns = {
    id: "id",
    ownerUserId: "owner_user_id",
    tripId: "trip_id",
    entityType: "entity_type",
    entityId: "entity_id",
    operationType: "operation_type",
    idempotencyKey: "idempotency_key",
    baseVersion: "base_version",
    payloadJson: "payload_json",
    status: "status",
    claimOwner: "claim_owner",
    attemptCount: "attempt_count",
    nextAttemptAt: "next_attempt_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  } as const;
  const keys = Object.keys(identityColumns) as (keyof typeof identityColumns)[];
  function same(a: SyncOperation, b: SyncOperation) {
    return keys.every((k) => (a[k] ?? null) === (b[k] ?? null));
  }
  async function failObserved(
    context: AccountRequestContext,
    operation: SyncOperation,
    error: Error,
    next?: string,
  ) {
    scope(context, operation);
    const invalid = error instanceof IntelligenceWakeValidationError;
    const result = await db.runAsync(
      `UPDATE sync_operations SET status=?,failure_category=?,last_error_code=?,
        last_error_message=?,attempt_count=attempt_count+1,next_attempt_at=?,
        claim_owner=NULL,lease_expires_at=NULL,updated_at=?
        WHERE ${keys.map((k) => `${identityColumns[k]} IS ?`).join(" AND ")}`,
      invalid ? "FAILED" : "RETRYABLE",
      invalid ? "VALIDATION" : errorDetails(error).category,
      invalid ? "INTELLIGENCE_WAKE_INVALID" : errorDetails(error).code,
      invalid ? "Invalid retained intelligence wake." : "Wake admission must be retried.",
      invalid ? null : (next ?? deps.now()),
      deps.now(),
      ...keys.map((k) => operation[k] ?? null),
    );
    return result.changes === 1;
  }
  return {
    async failAdmission(
      context: AccountRequestContext,
      operation: SyncOperation,
      error: Error,
      next?: string,
    ) {
      return gated(context, async () => {
        scope(context, operation);
        if (!["PENDING", "RETRYABLE"].includes(operation.status) || operation.claimOwner)
          return false;
        return failObserved(context, operation, error, next);
      });
    },
    async claim(context: AccountRequestContext, operation: SyncOperation, owner: string) {
      return gated(context, async () => {
        scope(context, operation);
        const current = await db.getFirstAsync<SyncOperation>(
          `${wakeSelect} WHERE id=?`,
          operation.id,
        );
        if (!current || !same(current, operation)) return false;
        try {
          await validateIntelligenceWake(current, deps.sha256);
        } catch (error) {
          if (!(error instanceof IntelligenceWakeValidationError)) throw error;
          await failObserved(context, current, error);
          return false;
        }
        const now = deps.now();
        const result = await db.runAsync(
          `UPDATE sync_operations SET status='PROCESSING',
          claim_owner=?,lease_expires_at=?,last_attempt_at=?,updated_at=?
          WHERE id=? AND owner_user_id=? AND base_version=? AND status IN ('PENDING','RETRYABLE')
          AND (next_attempt_at IS NULL OR next_attempt_at<=?)`,
          owner,
          new Date(Date.parse(now) + 5 * 60_000).toISOString(),
          now,
          now,
          operation.id,
          context.accountId,
          operation.baseVersion,
          now,
        );
        if (result.changes === 1) operation.claimOwner = owner;
        return result.changes === 1;
      });
    },
    async settle(
      context: AccountRequestContext,
      operation: SyncOperation,
      error?: Error,
      nextAttemptAt?: string,
    ) {
      return gated(context, async () => {
        scope(context, operation);
        const current = await db.getFirstAsync<SyncOperation>(
          `${wakeSelect} WHERE id=?`,
          operation.id,
        );
        if (!current) throw new Error("INTELLIGENCE_WAKE_MISSING");
        if (
          context.accountId !== operation.ownerUserId ||
          operation.tripId !== (context.tripId || null) ||
          current.tripId !== operation.tripId ||
          !operation.claimOwner ||
          current.claimOwner !== operation.claimOwner ||
          current.status !== "PROCESSING"
        )
          throw new Error("INTELLIGENCE_WAKE_CLAIM");
        const newer = current.baseVersion !== operation.baseVersion;
        try {
          await validateIntelligenceWake(current, deps.sha256);
        } catch (invalid) {
          if (!(invalid instanceof IntelligenceWakeValidationError)) throw invalid;
          if (newer) return; // Stale invalid finalizer cannot quarantine a newer signal.
          await failObserved(context, current, invalid);
          return;
        }
        if (current.payloadJson !== operation.payloadJson)
          throw new Error("INTELLIGENCE_CHANGED_WAKE");
        await validateIntelligenceWake(operation, deps.sha256);
        if (error instanceof IntelligenceWakeValidationError && !newer) {
          await failObserved(context, current, error);
          return;
        }
        const details = error ? errorDetails(error) : null;
        const retry =
          error &&
          details?.category !== "VALIDATION" &&
          details?.category !== "PERMISSION";
        await db.runAsync(
          `UPDATE sync_operations SET status=?,
          attempt_count=attempt_count+?,next_attempt_at=?,failure_category=?,last_error_code=?,
          claim_owner=NULL,lease_expires_at=NULL,updated_at=?
          WHERE id=? AND owner_user_id=? AND status='PROCESSING' AND claim_owner=? AND base_version=?`,
          newer ? "PENDING" : error ? (retry ? "RETRYABLE" : "FAILED") : "COMPLETED",
          error ? 1 : 0,
          newer ? null : retry ? (nextAttemptAt ?? null) : null,
          newer ? null : (details?.category ?? null),
          details?.code ?? null,
          deps.now(),
          operation.id,
          context.accountId,
          operation.claimOwner,
          current.baseVersion,
        );
      });
    },
  };
}

// Metadata only: unlike listPending, this does not wake dependencies or claim work.
const syncDiagnosticSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  operationType: z.string(),
  status: z.enum([
    "PENDING",
    "PROCESSING",
    "RETRYABLE",
    "DEPENDENCY_BLOCKED",
    "FAILED",
    "CONFLICT",
    "COMPLETED",
  ]),
  failureCategory: z.string().nullable(),
  updatedAt: z.string(),
});
export async function readSyncOperationDiagnostics(
  database: Pick<SyncQueueDatabase, "getAllAsync">,
  accountId: string,
) {
  const rows = await database.getAllAsync(
    `SELECT id,entity_type AS entityType,operation_type AS operationType,
      status,failure_category AS failureCategory,updated_at AS updatedAt
     FROM sync_operations WHERE owner_user_id=? ORDER BY updated_at DESC,id LIMIT 51`,
    accountId,
  );
  return rows.map((row) => syncDiagnosticSchema.parse(row));
}
export async function readPendingSyncCounts(
  database: Pick<SQLite.SQLiteDatabase, "getFirstAsync">,
  accountId: string,
) {
  return database.getFirstAsync<{ pending: number; itinerary: number }>(
    `SELECT COUNT(*) AS pending,
      COALESCE(SUM(entity_type='itinerary' AND operation_type='CREATE_ITINERARY'),0) AS itinerary
     FROM sync_operations WHERE owner_user_id=? AND status IN ('PENDING','RETRYABLE')`,
    accountId,
  );
}
