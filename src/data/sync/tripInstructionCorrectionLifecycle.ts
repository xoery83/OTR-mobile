import type {
  CoreCorrectionClaim,
  CoreDatabase,
  createTripCoreV2Repository,
} from "../repositories/tripCoreV2Repository";
import type { SyncOperation } from "./syncOperationRepository";
import { createCoreCorrectionQueueLifecycle } from "./syncOperationRepository";
import type { SyncOperationRepository } from "./syncEngine";
import { SyncDependencyError } from "./syncEngine";
import type { CoreSyncTransport } from "./tripCoreV2SyncWorker";
import type { ImportHash } from "@/domain/trip/flightImportReview";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";

// Actual Core-returned durable identity only, never a locally minted permit.
export type CoreCorrectionSyncOperation = SyncOperation & {
  coreCorrectionClaim?: CoreCorrectionClaim;
};
export function isExactManualCorrection(operation: SyncOperation) {
  try {
    const command = validateCoreCommand(JSON.parse(operation.payloadJson));
    return (
      operation.operationType === "CORE_V2_COMMAND" &&
      operation.entityType === "TRIP_CORE_V2" &&
      command.command === "CORRECT_INSTRUCTION" &&
      command.admission.mode === "MANUAL" &&
      command.target.kind === "INSTRUCTION" &&
      command.operationId === operation.id &&
      operation.idempotencyKey === operation.id &&
      command.tripId === operation.tripId &&
      command.target.id === operation.entityId
    );
  } catch {
    return false;
  }
}

// Adapter for one already-bound CORRECT only; generic Engine and other queues
// keep their existing hooks. Same actual Core instance is used by claim/consume.
export function createTripInstructionCorrectionLifecycle(input: {
  database: CoreDatabase;
  core: ReturnType<typeof createTripCoreV2Repository>;
  queue: SyncOperationRepository;
  transport: CoreSyncTransport;
  account(): Promise<string>;
  hash: ImportHash;
  operationId: string;
  tripId: string;
  context: AccountRequestContext;
  now?(): string;
  /** Read-only normal new-submit checks, before Core seals queue postimage. */
  preflight(): Promise<void>;
}): {
  queue: SyncOperationRepository;
  noteSubmit(operation: CoreCorrectionSyncOperation): Promise<void>;
} {
  const lifecycle = createCoreCorrectionQueueLifecycle(
    input.database,
    input.account,
    input.hash,
    input.now,
  );
  async function context(operation: SyncOperation) {
    if (
      operation.id !== input.operationId ||
      operation.tripId !== input.tripId ||
      !isExactManualCorrection(operation)
    )
      throw Error("CORE_CORRECTION_TARGET_MISMATCH");
    const ctx = input.context;
    await assertAccountRequestContext(ctx, input.account);
    if (ctx.tripId !== input.tripId || ctx.accountId !== operation.ownerUserId)
      throw Error("CORE_CORRECTION_ACCOUNT_CHANGED");
    return ctx;
  }
  async function readObserved() {
    return input.database.getFirstAsync<SyncOperation>(
      `SELECT id,trip_id AS tripId,entity_type AS entityType,entity_id AS entityId,
      operation_type AS operationType,idempotency_key AS idempotencyKey,base_version AS baseVersion,payload_json AS payloadJson,
      owner_user_id AS ownerUserId,status,attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,
      dependency_operation_id AS dependencyOperationId,claim_owner AS claimOwner,created_at AS createdAt,updated_at AS updatedAt
      FROM sync_operations WHERE id=?`,
      input.operationId,
    );
  }
  const queue: SyncOperationRepository = {
    ...input.queue,
    async recoverInterrupted() {
      const operation = await readObserved();
      if (!operation) return;
      const ctx = await context(operation);
      // Live/expired/foreign-incarnation claims may still recover the original
      // receipt. None of those observations authorize a new submission.
      const retained = await input.transport.receipt(ctx, operation.id);
      await assertAccountRequestContext(ctx, input.account);
      if (retained !== null) {
        if (retained.projection !== "FULL")
          throw new SyncDependencyError("CORE_CURRENT_AUTHORIZATION_REQUIRED");
        await input.core.applyReceipt(ctx, retained.receipt);
      }
      await lifecycle.recoverExpired(ctx, operation);
    },
    async claimOperation(operation: CoreCorrectionSyncOperation) {
      const ctx = await context(operation);
      // Presence/error is not null. Store validated FULL retained evidence before
      // claiming, so a later missing network response cannot become a new POST.
      const retained = await input.transport.receipt(ctx, operation.id);
      await assertAccountRequestContext(ctx, input.account);
      if (retained !== null) {
        if (retained.projection !== "FULL")
          throw new SyncDependencyError("CORE_CURRENT_AUTHORIZATION_REQUIRED");
        await input.core.applyReceipt(ctx, retained.receipt);
      } else {
        // These checks never mutate claim metadata. Failure leaves the original
        // unclaimed intent intact; its receipt was still queried first.
        await input.preflight();
        await assertAccountRequestContext(ctx, input.account);
      }
      const result = await input.core.claimQueuedManualInstructionCorrection(
        ctx,
        operation,
      );
      if (result.kind !== "CLAIMED") return false;
      operation.coreCorrectionClaim = Object.freeze({ ...result.claim });
      operation.claimOwner = result.claim.claimOwner;
      return true;
    },
    async settleOperation(
      operation: CoreCorrectionSyncOperation,
      error?: Error,
      next?: string,
    ) {
      const ctx = await context(operation);
      if (!operation.coreCorrectionClaim) return;
      await lifecycle.settle(ctx, operation, operation.coreCorrectionClaim, error, next);
    },
  };
  return {
    queue,
    async noteSubmit(operation) {
      const ctx = await context(operation);
      if (
        !operation.coreCorrectionClaim ||
        !(await lifecycle.noteSubmit(ctx, operation, operation.coreCorrectionClaim))
      )
        throw new SyncDependencyError("CORE_INSTRUCTION_RECEIPT_RECOVERY_PENDING");
    },
  };
}
