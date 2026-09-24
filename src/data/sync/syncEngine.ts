import type { AuthState } from "@/domain/auth/authState";
import { ApiClientError } from "@/data/api/client";

import type { SyncOperation } from "./syncOperationRepository";

export type SyncEngineStatus = "idle" | "paused_auth" | "syncing";

export function getSyncEngineStatus(authState: AuthState): SyncEngineStatus {
  return authState === "AUTHENTICATED_ONLINE" ? "syncing" : "paused_auth";
}

export type SyncOperationRepository = {
  listPending(): Promise<SyncOperation[]>;
  markProcessing(id: string): Promise<void>;
  markCompleted(id: string): Promise<void>;
  markConflict?(id: string, error: Error): Promise<void>;
  markRetryable(id: string, error: Error, nextAttemptAt: string): Promise<void>;
  recoverInterrupted?(): Promise<void>;
  claim?(id: string): Promise<boolean>;
  markFailed?(id: string, error: Error): Promise<void>;
  markPending?(id: string, error?: Error): Promise<void>;
  markDependencyBlocked?(id: string, dependencyOperationId?: string): Promise<void>;
};

export type SyncWorker = {
  push(operation: SyncOperation): Promise<void>;
};

export type SyncRunResult = {
  status: SyncEngineStatus;
  processedCount: number;
};

export class SyncConflictError extends Error {}
export class SyncDependencyError extends Error {
  constructor(
    message: string,
    public readonly dependencyOperationId?: string,
  ) {
    super(message);
  }
}

export type SyncFailureCategory =
  | "NETWORK"
  | "TIMEOUT"
  | "SERVER"
  | "RATE_LIMIT"
  | "AUTH"
  | "VALIDATION"
  | "PERMISSION"
  | "CONFLICT"
  | "DEPENDENCY"
  | "RESPONSE_INVALID"
  | "UNKNOWN";

const validationCodes = new Set([
  "AMOUNT_NOT_POSITIVE",
  "INVALID_ORIGINAL_MONEY",
  "INVALID_PARTICIPANTS",
  "INVALID_PAYER",
  "INVALID_PAYLOAD",
  "INVALID_SETTLEMENT_PARTICIPATION",
  "ORIGINAL_SPLIT_MISMATCH",
  "PARTICIPANT_OUTSIDE_JOURNEY",
  "RATE_REQUIRED_HAS_VALUATION",
  "SETTLEMENT_SPLIT_MISMATCH",
  "SPLIT_PARTICIPANT_MISMATCH",
  "VALUATION_CURRENCY_MISMATCH",
  "VALUATION_ORIGINAL_MISMATCH",
  "VALUATION_REQUIRED",
]);
const permissionCodes = new Set(["TRIP_READ_FORBIDDEN", "TRIP_WRITE_FORBIDDEN"]);
const conflictCodes = new Set([
  "REVISION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "PERSONAL_PAYMENT_IDENTITY_CONFLICT",
]);

export function nextSyncAttemptAt(
  attempt: number,
  now = Date.now(),
  random = Math.random(),
) {
  const base =
    attempt <= 6
      ? Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000)
      : Math.min(
          6 * 60 * 60_000 * 2 ** Math.floor((attempt - 7) / 3),
          7 * 24 * 60 * 60_000,
        );
  return new Date(now + Math.round(base * (0.5 + random))).toISOString();
}

export function syncFailureClass(error: Error) {
  return syncFailureDetails(error).classification;
}

export function syncFailureDetails(error: Error) {
  if (error instanceof SyncDependencyError)
    return { classification: "dependency", category: "DEPENDENCY" } as const;
  if (!(error instanceof ApiClientError))
    return { classification: "retryable", category: "UNKNOWN" } as const;
  if (error.status === 401) return { classification: "auth", category: "AUTH" } as const;
  if (error.kind === "network")
    return { classification: "retryable", category: "NETWORK" } as const;
  if (error.kind === "timeout")
    return { classification: "retryable", category: "TIMEOUT" } as const;
  if (error.kind === "validation")
    return { classification: "retryable", category: "RESPONSE_INVALID" } as const;
  if (error.status === 429)
    return { classification: "retryable", category: "RATE_LIMIT" } as const;
  if (error.status !== undefined && error.status >= 500)
    return { classification: "retryable", category: "SERVER" } as const;
  if (error.status === 409 || (error.code && conflictCodes.has(error.code)))
    return { classification: "conflict", category: "CONFLICT" } as const;
  if (error.code && validationCodes.has(error.code))
    return { classification: "terminal", category: "VALIDATION" } as const;
  if (error.code && permissionCodes.has(error.code))
    return { classification: "terminal", category: "PERMISSION" } as const;
  return { classification: "retryable", category: "UNKNOWN" } as const;
}

export function createSyncEngine(
  repository: SyncOperationRepository,
  worker: SyncWorker,
  calculateNextAttemptAt: (attemptCount: number) => string = nextSyncAttemptAt,
  shouldProcess: (operation: SyncOperation) => boolean = () => true,
) {
  return {
    async run(authState: AuthState): Promise<SyncRunResult> {
      if (getSyncEngineStatus(authState) !== "syncing") {
        return { status: "paused_auth", processedCount: 0 };
      }

      await repository.recoverInterrupted?.();

      const seen = new Set<string>();
      let processedCount = 0;
      while (true) {
        const operations = (await repository.listPending()).filter(
          (operation) => shouldProcess(operation) && !seen.has(operation.id),
        );
        if (operations.length === 0) break;
        for (const operation of operations) {
          seen.add(operation.id);
          if (repository.claim) {
            if (!(await repository.claim(operation.id))) continue;
          } else {
            await repository.markProcessing(operation.id);
          }
          processedCount += 1;

          try {
            await worker.push(operation);
            await repository.markCompleted(operation.id);
          } catch (error) {
            const normalized = error instanceof Error ? error : new Error("Sync failed.");
            const failure = syncFailureClass(normalized);
            if (normalized instanceof SyncConflictError) {
              if (!repository.markConflict)
                throw new Error("Sync repository cannot store conflicts.");
              await repository.markConflict(operation.id, normalized);
            } else if (failure === "dependency") {
              await repository.markDependencyBlocked?.(
                operation.id,
                normalized instanceof SyncDependencyError
                  ? normalized.dependencyOperationId
                  : undefined,
              );
            } else if (failure === "retryable") {
              await repository.markRetryable(
                operation.id,
                normalized,
                calculateNextAttemptAt(operation.attemptCount + 1),
              );
            } else if (failure === "auth") {
              await repository.markPending?.(operation.id, normalized);
              return { status: "paused_auth", processedCount };
            } else if (failure === "conflict" && repository.markConflict) {
              await repository.markConflict(operation.id, normalized);
            } else if (repository.markFailed) {
              await repository.markFailed(operation.id, normalized);
            } else {
              throw normalized;
            }
          }
        }
      }

      return { status: "syncing", processedCount };
    },
  };
}
