import { ApiClientError } from "@/data/api/client";
import {
  createPersonalSettlementPaymentRequestSchema,
  deletePersonalSettlementPaymentRequestSchema,
  updatePersonalSettlementPaymentRequestSchema,
} from "@/data/api/ledgerSettlementContracts";
import {
  personalPaymentOperations,
  type createLedgerPersonalPaymentRepository,
} from "@/data/repositories/ledgerPersonalPaymentRepository";

import {
  SyncConflictError,
  SyncDependencyError,
  syncFailureClass,
  type SyncWorker,
} from "./syncEngine";
import type { SyncOperation } from "./syncOperationRepository";
import type { createLedgerPersonalPaymentTransport } from "./ledgerPersonalPaymentTransport";

type Repository = ReturnType<typeof createLedgerPersonalPaymentRepository>;
type Transport = ReturnType<typeof createLedgerPersonalPaymentTransport>;

export function createLedgerPersonalPaymentSyncWorker(
  repository: Repository,
  transport: Transport,
): SyncWorker {
  return {
    async push(operation: SyncOperation) {
      if (
        operation.entityType !== "ledger_personal_payment" ||
        !Object.values(personalPaymentOperations).includes(
          operation.operationType as (typeof personalPaymentOperations)[keyof typeof personalPaymentOperations],
        )
      )
        throw new Error("Personal Payment worker received an unsupported operation.");
      const record = await repository.get(operation.entityId);
      if (!record || record.journeyId !== operation.tripId)
        throw new Error("Personal Payment is missing from local storage.");
      if (
        operation.operationType !== personalPaymentOperations.create &&
        record.revision === 0
      )
        throw new SyncDependencyError(
          "Personal Payment must be created remotely before later mutations.",
        );

      await repository.markSyncing(record.id);
      try {
        const payload = JSON.parse(operation.payloadJson) as Record<string, unknown>;
        const response =
          operation.operationType === personalPaymentOperations.create
            ? await transport.create(
                record.journeyId,
                createPersonalSettlementPaymentRequestSchema.parse(payload),
                operation.idempotencyKey,
              )
            : operation.operationType === personalPaymentOperations.update
              ? await transport.update(
                  record.journeyId,
                  record.id,
                  updatePersonalSettlementPaymentRequestSchema.parse({
                    ...payload,
                    baseRevision: record.revision,
                  }),
                  operation.idempotencyKey,
                )
              : await transport.remove(
                  record.journeyId,
                  record.id,
                  deletePersonalSettlementPaymentRequestSchema.parse({
                    ...payload,
                    baseRevision: record.revision,
                  }),
                  operation.idempotencyKey,
                );
        await repository.applyCanonical(response.record, operation.id);
        await repository.applyFxProjections?.(response.projections ?? []);
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error("Sync failed.");
        if (
          normalized instanceof ApiClientError &&
          (normalized.code === "REVISION_CONFLICT" ||
            normalized.code === "IDEMPOTENCY_CONFLICT" ||
            normalized.code === "PERSONAL_PAYMENT_IDENTITY_CONFLICT")
        ) {
          await repository.markConflict(record.id, normalized.code);
          throw new SyncConflictError(normalized.code);
        }
        const failure = syncFailureClass(normalized);
        if (failure === "auth" || failure === "retryable") {
          await repository.markPending(record.id, operation.operationType);
        } else {
          await repository.markFailed(
            record.id,
            normalized instanceof ApiClientError
              ? (normalized.code ?? `HTTP_${normalized.status ?? "ERROR"}`)
              : normalized.name,
          );
        }
        throw normalized;
      }
    },
  };
}
