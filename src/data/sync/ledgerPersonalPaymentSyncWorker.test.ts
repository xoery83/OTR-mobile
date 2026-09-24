import { describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/data/api/client";
import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import { SyncConflictError, SyncDependencyError } from "./syncEngine";
import { createLedgerPersonalPaymentSyncWorker } from "./ledgerPersonalPaymentSyncWorker";
import type { SyncOperation } from "./syncOperationRepository";

const record: LocalPersonalPayment = {
  id: "70000000-0000-4000-8000-000000000001",
  journeyId: "10000000-0000-4000-8000-000000000001",
  ownerUserId: "20000000-0000-4000-8000-000000000001",
  ownerMemberId: "30000000-0000-4000-8000-000000000001",
  counterpartyMemberId: "30000000-0000-4000-8000-000000000002",
  direction: "PAID",
  amountMinor: 30_000,
  currency: "NZD",
  scale: 2,
  occurredAt: "2026-09-22T10:00:00+12:00",
  note: null,
  recordedEquivalentMinor: null,
  recordedEquivalentCurrency: null,
  recordedEquivalentScale: null,
  referenceRateDecimal: null,
  referenceRateDate: null,
  referenceSource: null,
  referenceProvenance: null,
  revision: 1,
  createdAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
  deletedAt: null,
  syncStatus: "PENDING_UPDATE",
  lastSyncedAt: null,
  lastErrorCode: null,
};

const operation: SyncOperation = {
  id: "80000000-0000-4000-8000-000000000001",
  tripId: record.journeyId,
  entityType: "ledger_personal_payment",
  entityId: record.id,
  operationType: "UPDATE_PERSONAL_PAYMENT",
  idempotencyKey: "90000000-0000-4000-8000-000000000001",
  baseVersion: 1,
  payloadJson: JSON.stringify({
    counterpartyMemberId: record.counterpartyMemberId,
    direction: record.direction,
    amountMinor: record.amountMinor,
    currency: record.currency,
    scale: record.scale,
    occurredAt: record.occurredAt,
    note: null,
    baseRevision: 1,
  }),
  ownerUserId: record.ownerUserId,
  status: "PENDING",
  attemptCount: 0,
  nextAttemptAt: null,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
};

function repository() {
  return {
    get: vi.fn(async () => record),
    markSyncing: vi.fn(),
    markPending: vi.fn(),
    markConflict: vi.fn(),
    markFailed: vi.fn(),
    applyCanonical: vi.fn(),
  };
}

function transport() {
  return {
    create: vi.fn(),
    update: vi.fn(async () => ({
      record: { ...record, revision: 2, syncStatus: undefined } as never,
      idempotentReplay: false,
    })),
    remove: vi.fn(),
    list: vi.fn(),
    changes: vi.fn(),
  };
}

describe("Settlement 2.0 Personal Payment sync worker", () => {
  it("uses the stable idempotency key and current canonical base revision", async () => {
    const repo = repository();
    const api = transport();
    await createLedgerPersonalPaymentSyncWorker(repo as never, api as never).push({
      ...operation,
      baseVersion: 0,
    });
    expect(api.update).toHaveBeenCalledWith(
      record.journeyId,
      record.id,
      expect.objectContaining({ baseRevision: 1, amountMinor: 30_000 }),
      operation.idempotencyKey,
    );
    expect(repo.applyCanonical).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 2 }),
      operation.id,
    );
  });

  it("maps stale revision to a durable conflict", async () => {
    const repo = repository();
    const api = transport();
    api.update.mockRejectedValue(
      new ApiClientError("stale", "http", 409, "REVISION_CONFLICT"),
    );
    await expect(
      createLedgerPersonalPaymentSyncWorker(repo as never, api as never).push(operation),
    ).rejects.toBeInstanceOf(SyncConflictError);
    expect(repo.markConflict).toHaveBeenCalledWith(record.id, "REVISION_CONFLICT");
  });

  it("retries an UPDATE whose CREATE has not materialized remotely", async () => {
    const repo = repository();
    repo.get.mockResolvedValue({ ...record, revision: 0 });
    const api = transport();
    await expect(
      createLedgerPersonalPaymentSyncWorker(repo as never, api as never).push(operation),
    ).rejects.toBeInstanceOf(SyncDependencyError);
    expect(api.update).not.toHaveBeenCalled();
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiClientError("offline", "network"), "pending"],
    [new ApiClientError("auth", "http", 401, "AUTH_REQUIRED"), "pending"],
    [
      new ApiClientError("membership lost", "http", 403, "TRIP_WRITE_FORBIDDEN"),
      "failed",
    ],
    [new ApiClientError("invalid", "http", 422, "INVALID_PAYLOAD"), "failed"],
    [new ApiClientError("missing", "http", 404, "ENTITY_NOT_FOUND"), "pending"],
  ])("classifies %s as %s without pretending success", async (error, outcome) => {
    const repo = repository();
    const api = transport();
    api.update.mockRejectedValue(error);
    await expect(
      createLedgerPersonalPaymentSyncWorker(repo as never, api as never).push(operation),
    ).rejects.toBe(error);
    if (outcome === "pending") {
      expect(repo.markPending).toHaveBeenCalledWith(record.id, operation.operationType);
      expect(repo.markFailed).not.toHaveBeenCalled();
    } else {
      expect(repo.markFailed).toHaveBeenCalled();
      expect(repo.applyCanonical).not.toHaveBeenCalled();
    }
  });

  it("never accepts another entity type", async () => {
    await expect(
      createLedgerPersonalPaymentSyncWorker(
        repository() as never,
        transport() as never,
      ).push({
        ...operation,
        entityType: "ledger_settlement_payment",
      }),
    ).rejects.toThrow("unsupported operation");
  });
});
