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
  markPending?(id: string): Promise<void>;
};

export type SyncWorker = {
  push(operation: SyncOperation): Promise<void>;
};

export type SyncRunResult = {
  status: SyncEngineStatus;
  processedCount: number;
};

export class SyncConflictError extends Error {}

export function nextSyncAttemptAt(
  attempt: number,
  now = Date.now(),
  random = Math.random(),
) {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
  return new Date(now + Math.round(base * (0.5 + random))).toISOString();
}

export function syncFailureClass(error: Error) {
  if (!(error instanceof ApiClientError)) return "terminal" as const;
  if (error.status === 401) return "auth" as const;
  if (
    error.kind === "network" ||
    error.kind === "timeout" ||
    error.status === 429 ||
    (error.status !== undefined && error.status >= 500)
  )
    return "retryable" as const;
  return error.status === 409 ? ("conflict" as const) : ("terminal" as const);
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

      const operations = (await repository.listPending()).filter(shouldProcess);

      for (const operation of operations) {
        if (repository.claim) {
          if (!(await repository.claim(operation.id))) continue;
        } else {
          await repository.markProcessing(operation.id);
        }

        try {
          await worker.push(operation);
          await repository.markCompleted(operation.id);
        } catch (error) {
          const normalized = error instanceof Error ? error : new Error("Sync failed.");
          if (normalized instanceof SyncConflictError) {
            if (!repository.markConflict)
              throw new Error("Sync repository cannot store conflicts.");
            await repository.markConflict(operation.id, normalized);
          } else if (syncFailureClass(normalized) === "retryable") {
            await repository.markRetryable(
              operation.id,
              normalized,
              calculateNextAttemptAt(operation.attemptCount + 1),
            );
          } else if (syncFailureClass(normalized) === "auth") {
            await repository.markPending?.(operation.id);
            return { status: "paused_auth", processedCount: operations.length };
          } else if (
            syncFailureClass(normalized) === "conflict" &&
            repository.markConflict
          ) {
            await repository.markConflict(operation.id, normalized);
          } else if (repository.markFailed) {
            await repository.markFailed(operation.id, normalized);
          } else {
            throw normalized;
          }
        }
      }

      return { status: "syncing", processedCount: operations.length };
    },
  };
}
