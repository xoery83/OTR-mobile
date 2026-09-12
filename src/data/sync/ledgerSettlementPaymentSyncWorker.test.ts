import { describe, expect, it, vi } from "vitest";

import { createLedgerSettlementPaymentSyncWorker } from "./ledgerSettlementPaymentSyncWorker";

const operation = {
  id: "operation-1",
  tripId: "10000000-0000-4000-8000-000000000001",
  entityType: "ledger_settlement_payment",
  entityId: "73000000-0000-4000-8000-000000000001",
  operationType: "LEDGER_RECORD_TRANSFER_PAYMENT",
  idempotencyKey: "idempotency-1",
  baseVersion: 1,
  payloadJson: JSON.stringify({
    transferId: "72000000-0000-4000-8000-000000000001",
    localId: "73000000-0000-4000-8000-000000000001",
    baseTransferRevision: 1,
  }),
  status: "PENDING" as const,
  attemptCount: 0,
  nextAttemptAt: null,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
};

describe("Settlement Payment sync worker", () => {
  it("reuses the durable operation identity and reconciles the canonical aggregate", async () => {
    const applyPaymentMutation = vi.fn();
    const recordPayment = vi.fn(async () => ({ entity: { id: "settlement" } }));
    const worker = createLedgerSettlementPaymentSyncWorker(
      { applyPaymentMutation } as never,
      { recordPayment } as never,
    );

    await worker.push(operation);
    await worker.push(operation);

    expect(recordPayment).toHaveBeenCalledTimes(2);
    expect(recordPayment).toHaveBeenLastCalledWith(
      operation.tripId,
      "72000000-0000-4000-8000-000000000001",
      expect.objectContaining({ localId: operation.entityId }),
      operation.idempotencyKey,
    );
    expect(applyPaymentMutation).toHaveBeenCalledTimes(2);
  });

  it("keeps Received as a separate queued command", async () => {
    const applyPaymentMutation = vi.fn();
    const actOnPayment = vi.fn(async () => ({ entity: { id: "settlement" } }));
    const worker = createLedgerSettlementPaymentSyncWorker(
      { applyPaymentMutation } as never,
      { actOnPayment } as never,
    );
    await worker.push({
      ...operation,
      operationType: "LEDGER_CONFIRM_TRANSFER_PAYMENT",
      payloadJson: JSON.stringify({
        basePaymentRevision: 1,
        authority: "RECIPIENT",
        reason: null,
      }),
    });

    expect(actOnPayment).toHaveBeenCalledWith(
      operation.tripId,
      operation.entityId,
      "confirm",
      expect.objectContaining({ authority: "RECIPIENT" }),
      operation.idempotencyKey,
    );
    expect(applyPaymentMutation).toHaveBeenCalledOnce();
  });
});
