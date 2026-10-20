import type { createLedgerSettlementRepository } from "@/data/repositories/ledgerSettlementRepository";
import { ApiClientError } from "@/data/api/client";
import { assertReplayFixtureWritable } from "@/data/repositories/replayFixtureGuard";

import type { SyncOperation } from "./syncOperationRepository";
import { SyncConflictError, type SyncWorker } from "./syncEngine";
import { createLedgerSettlementTransport } from "./ledgerSettlementTransport";

type Repository = ReturnType<typeof createLedgerSettlementRepository>;
type Transport = ReturnType<typeof createLedgerSettlementTransport>;

export function createLedgerSettlementPaymentSyncWorker(
  repository: Repository,
  transport: Transport,
): SyncWorker {
  return {
    async push(operation: SyncOperation) {
      if (operation.tripId) assertReplayFixtureWritable(operation.tripId);
      if (
        !["ledger_settlement_payment", "ledger_settlement_adjustment"].includes(
          operation.entityType,
        )
      )
        throw new Error("Settlement Payment worker received an unsupported operation.");
      const payload = JSON.parse(operation.payloadJson);
      let response;
      try {
        if (operation.operationType === "LEDGER_FINALIZE_SETTLEMENT_ADJUSTMENT") {
          response = await transport.finalizeAdjustment(
            operation.tripId!,
            String(payload.rootSettlementId),
            payload,
            operation.idempotencyKey,
          );
        } else if (operation.operationType === "LEDGER_RECORD_TRANSFER_PAYMENT") {
          response = await transport.recordPayment(
            operation.tripId!,
            String(payload.transferId),
            payload,
            operation.idempotencyKey,
          );
        } else if (
          [
            "LEDGER_CONFIRM_TRANSFER_PAYMENT",
            "LEDGER_REJECT_TRANSFER_PAYMENT",
            "LEDGER_DISPUTE_TRANSFER_PAYMENT",
          ].includes(operation.operationType)
        ) {
          const action = operation.operationType
            .replace("LEDGER_", "")
            .replace("_TRANSFER_PAYMENT", "")
            .toLowerCase() as "confirm" | "reject" | "dispute";
          response = await transport.actOnPayment(
            operation.tripId!,
            operation.entityId,
            action,
            payload,
            operation.idempotencyKey,
          );
        } else if (operation.operationType === "LEDGER_CORRECT_TRANSFER_PAYMENT") {
          response = await transport.correctPayment(
            operation.tripId!,
            String(payload.paymentId),
            payload,
            operation.idempotencyKey,
          );
        } else {
          throw new Error("Settlement Payment operation is unsupported.");
        }
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          ["SETTLEMENT_INPUT_STALE", "ADJUSTMENT_NOT_REQUIRED"].includes(error.code ?? "")
        ) {
          throw new SyncConflictError(error.code);
        }
        throw error;
      }
      await repository.applyPaymentMutation(response.entity);
    },
  };
}
