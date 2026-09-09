import type { AuthState } from "@/domain/auth/authState";

import type { SyncOperation } from "./syncOperationRepository";

export type SyncEngineStatus = "idle" | "paused_auth" | "syncing";

export function getSyncEngineStatus(authState: AuthState): SyncEngineStatus {
  return authState === "AUTHENTICATED_ONLINE" ? "syncing" : "paused_auth";
}

export type SyncOperationRepository = {
  listPending(): Promise<SyncOperation[]>;
  markProcessing(id: string): Promise<void>;
  markCompleted(id: string): Promise<void>;
  markRetryable(id: string, error: Error, nextAttemptAt: string): Promise<void>;
};

export type SyncWorker = {
  push(operation: SyncOperation): Promise<void>;
};

export type SyncRunResult = {
  status: SyncEngineStatus;
  processedCount: number;
};

export function createSyncEngine(
  repository: SyncOperationRepository,
  worker: SyncWorker,
  calculateNextAttemptAt: (attemptCount: number) => string,
  shouldProcess: (operation: SyncOperation) => boolean = () => true,
) {
  return {
    async run(authState: AuthState): Promise<SyncRunResult> {
      if (getSyncEngineStatus(authState) !== "syncing") {
        return { status: "paused_auth", processedCount: 0 };
      }

      const operations = (await repository.listPending()).filter(shouldProcess);

      for (const operation of operations) {
        await repository.markProcessing(operation.id);

        try {
          await worker.push(operation);
          await repository.markCompleted(operation.id);
        } catch (error) {
          await repository.markRetryable(
            operation.id,
            error instanceof Error ? error : new Error("Sync failed."),
            calculateNextAttemptAt(operation.attemptCount + 1),
          );
        }
      }

      return { status: "syncing", processedCount: operations.length };
    },
  };
}
