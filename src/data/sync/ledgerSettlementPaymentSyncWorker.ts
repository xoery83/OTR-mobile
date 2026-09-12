import type { createLedgerSettlementRepository } from "@/data/repositories/ledgerSettlementRepository";

import type { SyncOperation } from "./syncOperationRepository";
import type { SyncWorker } from "./syncEngine";
import { createLedgerSettlementTransport } from "./ledgerSettlementTransport";

type Repository = ReturnType<typeof createLedgerSettlementRepository>;
type Transport = ReturnType<typeof createLedgerSettlementTransport>;

export function createLedgerSettlementPaymentSyncWorker(
  repository: Repository,
  transport: Transport,
): SyncWorker {
  return {
    async push(operation: SyncOperation) {
      if (operation.entityType !== "ledger_settlement_payment")
        throw new Error("Settlement Payment worker received an unsupported operation.");
      const payload = JSON.parse(operation.payloadJson);
      let response;
      if (operation.operationType === "LEDGER_RECORD_TRANSFER_PAYMENT") {
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
      await repository.applyPaymentMutation(response.entity);
    },
  };
}
