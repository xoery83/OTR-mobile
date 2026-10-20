import { describe, expect, it, vi } from "vitest";

import { createLedgerSettlementPaymentSyncWorker } from "./ledgerSettlementPaymentSyncWorker";
import { ApiClientError } from "@/data/api/client";
import { SyncConflictError } from "./syncEngine";

const operation = {
  id: "operation-1",
  ownerUserId: "user-a",
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
  it("does not replay stale queued Payment mutations for an immutable Replay", async () => {
    const recordPayment = vi.fn();
    await expect(
      createLedgerSettlementPaymentSyncWorker(
        { applyPaymentMutation: vi.fn() } as never,
        { recordPayment } as never,
      ).push({
        ...operation,
        tripId: "ec3ae448-3fa5-84a9-a986-655a243cf3ad",
      }),
    ).rejects.toThrow("immutable read-only fixture");
    expect(recordPayment).not.toHaveBeenCalled();
  });

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

  it("replays durable Adjustment identity and makes a stale head terminal", async () => {
    const applyPaymentMutation = vi.fn();
    const finalizeAdjustment = vi.fn(async () => ({ entity: { id: "adjustment" } }));
    const worker = createLedgerSettlementPaymentSyncWorker(
      { applyPaymentMutation } as never,
      { finalizeAdjustment } as never,
    );
    const adjustment = {
      ...operation,
      entityType: "ledger_settlement_adjustment",
      entityId: "70000000-0000-4000-8000-000000000001",
      operationType: "LEDGER_FINALIZE_SETTLEMENT_ADJUSTMENT",
      payloadJson: JSON.stringify({
        rootSettlementId: "70000000-0000-4000-8000-000000000001",
        expectedHeadId: null,
        inputDigest: "a".repeat(64),
        reason: "Corrected expense",
        allowZeroTransfer: false,
      }),
    };

    await worker.push(adjustment);
    expect(finalizeAdjustment).toHaveBeenCalledWith(
      operation.tripId,
      adjustment.entityId,
      expect.objectContaining({ reason: "Corrected expense" }),
      operation.idempotencyKey,
    );
    finalizeAdjustment.mockRejectedValueOnce(
      new ApiClientError("stale", "http", 409, "SETTLEMENT_INPUT_STALE") as never,
    );
    await expect(worker.push(adjustment)).rejects.toBeInstanceOf(SyncConflictError);
  });
});
