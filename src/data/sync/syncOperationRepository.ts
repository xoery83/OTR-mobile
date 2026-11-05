import type {
  CoreDatabase,
  CoreCorrectionClaim,
} from "../repositories/tripCoreV2Repository";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import { validateCoreReceipt } from "@/domain/trip/tripCoreV2Receipt";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import type { ImportHash } from "@/domain/trip/flightImportReview";
import type * as SQLite from "expo-sqlite";
import { createLocalId } from "@/domain/localId";
import { z } from "zod";
import { ApiClientError } from "@/data/api/client";
import { syncFailureDetails, type SyncFailureCategory } from "./syncEngine";
import {
  captureProcessingValidationKind,
  captureLocalInterpretationKind,
} from "./syncEngine";
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
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { getAccountGeneration } from "../auth/accountGeneration";

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
  readActiveUserId: () => Promise<string>,
  clockNow: () => string = () => new Date().toISOString(),
  target?: Readonly<{
    accountId: string;
    tripId: string;
    operationId: string;
    lastAttemptAt?: string | null;
  }>,
) {
  const selected = target && Object.freeze({ ...target });
  const targetScope = selected && {
    accountId: selected.accountId,
    generation: getAccountGeneration(),
  };
  const identitySql = selected ? " AND id=? AND trip_id=?" : "";
  const identityParams = selected ? [selected.operationId, selected.tripId] : [];
  const capped = selected && "lastAttemptAt" in selected;
  const attemptSql = capped ? " AND last_attempt_at IS ?" : "";
  const attemptParams = capped ? [selected.lastAttemptAt ?? null] : [];
  const getActiveUserId = async () => {
    if (targetScope) assertAccountRequestGeneration(targetScope);
    const accountId = await readActiveUserId();
    if (targetScope) assertAccountRequestGeneration(targetScope);
    if (selected && accountId !== selected.accountId)
      throw new Error("SYNC_TARGET_ACCOUNT_CHANGED");
    return accountId;
  };
  const assertTarget = async (id: string) => {
    if (selected && id !== selected.operationId) throw new Error("SYNC_TARGET_MISMATCH");
    await getActiveUserId();
  };
  return {
    async recoverInterrupted() {
      const now = clockNow();
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE sync_operations SET status = 'RETRYABLE', next_attempt_at = ?,
          last_error_message = 'INTERRUPTED', claim_owner = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE status = 'PROCESSING'
          AND owner_user_id = ?
          AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')
          AND NOT (operation_type='CORE_V2_COMMAND' AND entity_type='TRIP_CORE_V2'
            AND COALESCE(claim_owner,'') LIKE '["otr-core-correction-claim/%')
          AND operation_type NOT IN (?,?)
          AND (claim_owner IS NULL OR
            (claim_owner <> ? AND NOT (operation_type=? AND substr(claim_owner,1,?)=?))
            OR lease_expires_at <= ?)${identitySql}`,
        now,
        now,
        userId,
        captureProcessingValidationKind,
        captureLocalInterpretationKind,
        processClaimOwner,
        intelligenceWakeKind,
        processClaimOwner.length + 1,
        `${processClaimOwner}:`,
        now,
        ...identityParams,
      );
    },
    async enqueue(operation: EnqueueSyncOperation) {
      if (selected) await assertTarget(operation.id);
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
      if (!selected) await wakeCompletedDependencies(database, userId);
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
          AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)${identitySql}${attemptSql}
        ORDER BY created_at ASC, rowid ASC`,
        userId,
        ...pendingStatuses,
        clockNow(),
        ...identityParams,
        ...attemptParams,
      );
    },

    async reactivateLongLivedFailures() {
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE sync_operations SET next_attempt_at = NULL, updated_at = ?
         WHERE owner_user_id = ? AND status = 'RETRYABLE'
           AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')
           AND failure_category IN ('UNKNOWN', 'NETWORK', 'TIMEOUT', 'SERVER',
             'RATE_LIMIT', 'RESPONSE_INVALID')${identitySql}`,
        clockNow(),
        userId,
        ...identityParams,
      );
    },

    async claim(id: string) {
      if (selected) await assertTarget(id);
      const now = clockNow();
      if (capped && now === selected.lastAttemptAt) return false;
      const userId = await getActiveUserId();
      const result = await database.runAsync(
        `UPDATE sync_operations SET status = 'PROCESSING', claim_owner = ?,
          lease_expires_at = ?, last_attempt_at = ?, updated_at = ?
         WHERE id = ? AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE') AND owner_user_id = ?
           AND status IN ('PENDING', 'RETRYABLE')
           AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)${identitySql}${attemptSql}`,
        processClaimOwner,
        new Date(Date.parse(now) + 5 * 60_000).toISOString(),
        now,
        now,
        id,
        userId,
        now,
        ...identityParams,
        ...attemptParams,
      );
      if (targetScope) assertAccountRequestGeneration(targetScope);
      return result.changes === 1;
    },

    async markProcessing(id: string) {
      if (selected) await assertTarget(id);
      await database.runAsync(
        "UPDATE sync_operations SET status = ?, last_attempt_at = ?, claim_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')",
        "PROCESSING",
        clockNow(),
        clockNow(),
        id,
      );
    },

    async markCompleted(id: string) {
      if (selected) await assertTarget(id);
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE sync_operations SET status = ?, next_attempt_at = NULL,
          failure_category = NULL, last_error_code = NULL, last_error_message = NULL,
          last_request_id = NULL, claim_owner = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE id = ? AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')`,
        "COMPLETED",
        clockNow(),
        id,
      );
      if (!selected) await wakeCompletedDependencies(database, userId, id);
    },

    async markConflict(id: string, error: Error) {
      if (selected) await assertTarget(id);
      const failure = errorDetails(error);
      await database.runAsync(
        `UPDATE sync_operations
         SET status = ?, failure_category = ?, last_error_code = ?, last_error_message = ?, last_request_id = ?,
             first_failed_at = COALESCE(first_failed_at, ?), claim_owner = NULL,
             lease_expires_at = NULL, updated_at = ? WHERE id = ? AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')`,
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
      if (selected) await assertTarget(id);
      const failure = errorDetails(error);
      await database.runAsync(
        `UPDATE sync_operations
         SET status = ?, attempt_count = attempt_count + 1, next_attempt_at = ?,
             failure_category = ?, last_error_code = ?, last_error_message = ?, last_request_id = ?,
             first_failed_at = COALESCE(first_failed_at, ?), claim_owner = NULL,
             lease_expires_at = NULL, updated_at = ?
         WHERE id = ? AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')`,
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
      if (selected) await assertTarget(id);
      const failure = errorDetails(error);
      await database.runAsync(
        `UPDATE sync_operations SET status = 'FAILED', failure_category = ?,
          last_error_code = ?, last_error_message = ?, last_request_id = ?,
          first_failed_at = COALESCE(first_failed_at, ?),
          next_attempt_at = NULL, claim_owner = NULL, lease_expires_at = NULL,
          updated_at = ? WHERE id = ? AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')`,
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
      if (selected) await assertTarget(id);
      const failure = error ? errorDetails(error) : null;
      await database.runAsync(
        `UPDATE sync_operations SET status = 'PENDING', next_attempt_at = NULL,
          failure_category = 'AUTH', last_error_code = ?,
          last_error_message = ?, last_request_id = ?,
          first_failed_at = COALESCE(first_failed_at, ?), claim_owner = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE id = ? AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')`,
        failure?.code ?? "AUTH_PAUSED",
        failure?.message ?? "Authentication is paused.",
        failure?.requestId ?? null,
        clockNow(),
        clockNow(),
        id,
      );
    },
    async markDependencyBlocked(id: string, dependencyOperationId?: string) {
      if (selected) await assertTarget(id);
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
          claim_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')
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
       AND operation_type NOT IN ('TRIP_COVER_LOCAL_SAVE','TRIP_DESTINATIONS_LOCAL_SAVE')
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
export type SyncQueueCensusV1 = Readonly<{
  contractVersion: 1;
  coverage: "ALL_ACCOUNTS_SYNC_OPERATIONS_ONLY";
  corePendingIntents: "NOT_INCLUDED";
  sqliteSchemaVersion: "NOT_ASSERTED";
  countsByStatus: Readonly<Record<SyncOperationStatus, number>>;
  totalRows: number;
  allNonCompletedRows: number;
  unknownFailureRows: number;
  nonCompletedUnknownFailureRows: number;
}>;

// Caller supplies its already initialized/owned handle; this is not whole-App emptiness.
export async function readUnfinishedSyncQueueCensus(
  database: Pick<SQLite.SQLiteDatabase, "getAllAsync">,
): Promise<SyncQueueCensusV1> {
  const rows = await database.getAllAsync(
    `SELECT status, COUNT(*) AS count,
      SUM(CASE WHEN failure_category='UNKNOWN' THEN 1 ELSE 0 END) AS unknownFailures
     FROM sync_operations GROUP BY status`,
  );
  const countsByStatus: Record<SyncOperationStatus, number> = {
    PENDING: 0, PROCESSING: 0, RETRYABLE: 0, DEPENDENCY_BLOCKED: 0,
    FAILED: 0, CONFLICT: 0, COMPLETED: 0,
  };
  const rowSchema = z.object({
    status: z.enum(["PENDING", "PROCESSING", "RETRYABLE", "DEPENDENCY_BLOCKED", "FAILED", "CONFLICT", "COMPLETED"]),
    count: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    unknownFailures: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).refine((row) => row.unknownFailures <= row.count);
  const seen = new Set<SyncOperationStatus>();
  let totalRows = 0;
  let unknownFailureRows = 0;
  let nonCompletedUnknownFailureRows = 0;
  for (const raw of rows) {
    const parsed = rowSchema.safeParse(raw);
    // Never echo an unexpected status or driver value into census diagnostics.
    if (!parsed.success || seen.has(parsed.data.status)) {
      throw new Error("SYNC_QUEUE_CENSUS_INVALID_METADATA");
    }
    const row = parsed.data;
    seen.add(row.status);
    countsByStatus[row.status] = row.count;
    totalRows += row.count;
    unknownFailureRows += row.unknownFailures;
    if (row.status !== "COMPLETED") nonCompletedUnknownFailureRows += row.unknownFailures;
    if (!Number.isSafeInteger(totalRows)) throw new Error("SYNC_QUEUE_CENSUS_INVALID_METADATA");
  }
  return {
    contractVersion: 1,
    coverage: "ALL_ACCOUNTS_SYNC_OPERATIONS_ONLY",
    corePendingIntents: "NOT_INCLUDED",
    sqliteSchemaVersion: "NOT_ASSERTED",
    countsByStatus,
    totalRows,
    // FAILED/CONFLICT remain unresolved for this conservative QA census.
    allNonCompletedRows: totalRows - countsByStatus.COMPLETED,
    unknownFailureRows,
    nonCompletedUnknownFailureRows,
  };
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

// Bounded lifecycle for the existing Core CORRECT queue. This validates queue /
// receipt identity only; Core owns all provenance, eligibility and consume proof.
export function createCoreCorrectionQueueLifecycle(
  db: CoreDatabase,
  getAccountId: () => Promise<string>,
  hash: ImportHash,
  now: () => string = () => new Date().toISOString(),
) {
  type Row = SyncOperation & {
    canonicalIntent: string;
    intentHash: string;
    intentState: string;
    baseVector: string;
    receiptBody: string | null;
    receiptHash: string | null;
    lease: string | null;
    lastAttempt: string | null;
    failure: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    requestId: string | null;
    firstFailed: string | null;
  };
  const select = `SELECT op.id,op.owner_user_id AS ownerUserId,op.trip_id AS tripId,
    op.entity_type AS entityType,op.entity_id AS entityId,op.operation_type AS operationType,
    op.idempotency_key AS idempotencyKey,op.base_version AS baseVersion,op.payload_json AS payloadJson,
    op.status,op.attempt_count AS attemptCount,op.next_attempt_at AS nextAttemptAt,
    op.dependency_operation_id AS dependencyOperationId,op.claim_owner AS claimOwner,
    op.created_at AS createdAt,op.updated_at AS updatedAt,op.lease_expires_at AS lease,
    op.last_attempt_at AS lastAttempt,op.failure_category AS failure,op.last_error_code AS errorCode,
    op.last_error_message AS errorMessage,op.last_request_id AS requestId,op.first_failed_at AS firstFailed,
    i.canonical_intent_text AS canonicalIntent,i.intent_sha256 AS intentHash,i.state AS intentState,
    i.base_vector AS baseVector,r.body_json AS receiptBody,r.receipt_sha256 AS receiptHash
    FROM sync_operations op JOIN trip_core_pending_intents i ON i.queue_operation_id=op.id
    AND i.operation_id=op.id AND i.account_id=op.owner_user_id AND i.trip_id=op.trip_id
    LEFT JOIN trip_core_trip_core_command_receipts r ON r.account_id=i.account_id AND r.trip_id=i.trip_id
    AND r.operation_id=i.operation_id AND r.intent_sha256=i.intent_sha256 WHERE op.id=?`;
  const immutable = {
    id: "id",
    ownerUserId: "owner_user_id",
    tripId: "trip_id",
    entityType: "entity_type",
    entityId: "entity_id",
    operationType: "operation_type",
    idempotencyKey: "idempotency_key",
    baseVersion: "base_version",
    payloadJson: "payload_json",
    createdAt: "created_at",
  } as const;
  const mutable = {
    status: "status",
    claimOwner: "claim_owner",
    attemptCount: "attempt_count",
    nextAttemptAt: "next_attempt_at",
    dependencyOperationId: "dependency_operation_id",
    updatedAt: "updated_at",
    lease: "lease_expires_at",
    lastAttempt: "last_attempt_at",
    failure: "failure_category",
    errorCode: "last_error_code",
    errorMessage: "last_error_message",
    requestId: "last_request_id",
    firstFailed: "first_failed_at",
  } as const;
  const identity = { ...immutable, ...mutable };
  const keys = Object.keys(identity) as (keyof typeof identity)[];
  const cas = keys.map((k) => `${identity[k]} IS ?`).join(" AND ");
  async function gated<T>(ctx: AccountRequestContext, work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      await assertAccountRequestContext(ctx, getAccountId);
      let value!: T;
      await db.withTransactionAsync(async () => {
        value = await work();
        await assertAccountRequestContext(ctx, getAccountId);
      });
      return value;
    });
  }
  async function bound(ctx: AccountRequestContext, observed: SyncOperation) {
    const row = await db.getFirstAsync<Row>(select, observed.id);
    if (!row) return null;
    if (
      ctx.accountId !== row.ownerUserId ||
      ctx.tripId !== row.tripId ||
      (Object.keys(immutable) as (keyof typeof immutable)[]).some(
        (k) => (row[k] ?? null) !== (observed[k] ?? null),
      )
    )
      throw Error("CORE_CORRECTION_QUEUE_BINDING");
    const command = validateCoreCommand(JSON.parse(row.canonicalIntent));
    if (
      command.command !== "CORRECT_INSTRUCTION" ||
      command.target.kind !== "INSTRUCTION" ||
      command.admission.mode !== "MANUAL" ||
      command.operationId !== row.id ||
      row.idempotencyKey !== row.id ||
      command.tripId !== ctx.tripId ||
      command.target.id !== row.entityId ||
      row.entityType !== "TRIP_CORE_V2" ||
      row.operationType !== "CORE_V2_COMMAND" ||
      row.payloadJson !== row.canonicalIntent ||
      canonicalCoreJson(command as Json) !== row.canonicalIntent ||
      canonicalCoreJson(command.baseVector as Json) !== row.baseVector ||
      (await coreHashValue("otr-trip-core-intent-v2", command, hash)) !== row.intentHash
    )
      throw Error("CORE_CORRECTION_QUEUE_BINDING");
    const scope = await db.getFirstAsync<{ revoked: number }>(
      "SELECT revoked FROM trip_core_scopes WHERE account_id=? AND trip_id=?",
      ctx.accountId,
      ctx.tripId,
    );
    if (!scope || scope.revoked) return null;
    return { row, command };
  }
  function journalParams(ctx: AccountRequestContext, row: Row) {
    return [
      ctx.accountId,
      ctx.tripId,
      row.id,
      row.canonicalIntent,
      row.intentHash,
      row.baseVector,
      row.intentState,
    ];
  }
  const journalCas = `EXISTS(SELECT 1 FROM trip_core_pending_intents i WHERE i.account_id=? AND i.trip_id=?
    AND i.operation_id=? AND i.queue_operation_id=sync_operations.id AND i.canonical_intent_text=?
    AND i.intent_sha256=? AND i.base_vector=? AND i.state=?)`;
  return {
    async noteSubmit(
      ctx: AccountRequestContext,
      observed: SyncOperation,
      claim: CoreCorrectionClaim,
    ) {
      return gated(ctx, async () => {
        const b = await bound(ctx, observed);
        if (!b) return false;
        const { row } = b;
        if (
          claim.version !== 1 ||
          claim.operationId !== row.id ||
          claim.intentSha256 !== row.intentHash ||
          row.claimOwner !== claim.claimOwner ||
          row.status !== "PROCESSING" ||
          row.lease === null ||
          !Number.isFinite(Date.parse(row.lease)) ||
          !Number.isFinite(Date.parse(now())) ||
          Date.parse(row.lease) <= Date.parse(now()) ||
          row.intentState !== "IN_FLIGHT" ||
          row.receiptBody !== null
        )
          return false;
        const update = await db.runAsync(
          `UPDATE sync_operations SET attempt_count=attempt_count+1,updated_at=? WHERE ${cas} AND ${journalCas}`,
          now(),
          ...keys.map((k) => row[k] ?? null),
          ...journalParams(ctx, row),
        );
        return update.changes === 1;
      });
    },
    async settle(
      ctx: AccountRequestContext,
      observed: SyncOperation,
      claim: CoreCorrectionClaim,
      error?: Error,
      nextAttemptAt?: string,
    ) {
      return gated(ctx, async () => {
        const b = await bound(ctx, observed);
        if (!b) return false;
        const { row, command } = b;
        if (
          claim.version !== 1 ||
          claim.operationId !== row.id ||
          claim.intentSha256 !== row.intentHash ||
          row.claimOwner !== claim.claimOwner ||
          row.status !== "PROCESSING"
        )
          return false;
        let outcome: "APPLIED" | "NO_CHANGE" | "CONFLICT" | "REJECTED" | null = null;
        if (row.receiptBody !== null) {
          const receipt = await validateCoreReceipt(JSON.parse(row.receiptBody), hash);
          if (
            receipt.actorAccountId !== ctx.accountId ||
            receipt.tripId !== ctx.tripId ||
            receipt.operationId !== row.id ||
            receipt.command !== command.command ||
            receipt.intentSha256 !== row.intentHash ||
            receipt.receiptSha256 !== row.receiptHash
          )
            throw Error("CORE_CORRECTION_QUEUE_RECEIPT_BINDING");
          const expected =
            receipt.outcome === "CONFLICT"
              ? "CONFLICT"
              : receipt.outcome === "REJECTED"
                ? "REVIEW"
                : "APPLIED";
          if (row.intentState !== expected)
            throw Error("CORE_CORRECTION_QUEUE_RECEIPT_STATE");
          outcome = receipt.outcome;
        }
        const details = error ? errorDetails(error) : null;
        const status =
          outcome === "APPLIED" || outcome === "NO_CHANGE"
            ? "COMPLETED"
            : outcome === "CONFLICT"
              ? "CONFLICT"
              : outcome === "REJECTED"
                ? "FAILED"
                : "DEPENDENCY_BLOCKED";
        const code =
          outcome === "REJECTED"
            ? "CORE_RECEIPT_REJECTED"
            : outcome === "CONFLICT"
              ? "CORE_RECEIPT_CONFLICT"
              : outcome
                ? null
                : (details?.code ?? "CORE_INSTRUCTION_RECEIPT_RECOVERY_PENDING");
        const update = await db.runAsync(
          `UPDATE sync_operations SET status=?,next_attempt_at=?,failure_category=?,last_error_code=?,last_error_message=?,
          last_request_id=?,first_failed_at=COALESCE(first_failed_at,?),claim_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE ${cas} AND ${journalCas}`,
          status,
          outcome ? null : (nextAttemptAt ?? null),
          outcome
            ? status === "COMPLETED"
              ? null
              : status === "CONFLICT"
                ? "CONFLICT"
                : "VALIDATION"
            : (details?.category ?? "DEPENDENCY"),
          code,
          outcome
            ? null
            : (details?.message ?? "CORE_INSTRUCTION_RECEIPT_RECOVERY_PENDING"),
          outcome ? null : (details?.requestId ?? row.requestId),
          outcome && status === "COMPLETED" ? null : now(),
          now(),
          ...keys.map((k) => row[k] ?? null),
          ...journalParams(ctx, row),
        );
        return update.changes === 1;
      });
    },
    async recoverExpired(ctx: AccountRequestContext, observed: SyncOperation) {
      return gated(ctx, async () => {
        const b = await bound(ctx, observed);
        if (!b) return false;
        const { row } = b;
        if (
          row.status !== "PROCESSING" ||
          row.lease === null ||
          !Number.isFinite(Date.parse(row.lease)) ||
          !Number.isFinite(Date.parse(now())) ||
          Date.parse(row.lease) > Date.parse(now())
        )
          return false;
        const update = await db.runAsync(
          `UPDATE sync_operations SET status='RETRYABLE',next_attempt_at=?,last_error_message='INTERRUPTED',claim_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE ${cas} AND ${journalCas}`,
          now(),
          now(),
          ...keys.map((k) => row[k] ?? null),
          ...journalParams(ctx, row),
        );
        return update.changes === 1;
      });
    },
  };
}
