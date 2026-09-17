import type {
  LedgerExpense,
  LedgerExpenseRepository,
} from "@/data/repositories/ledgerExpenseRepository";
import { ApiClientError } from "@/data/api/client";
import { ledgerExpenseConflictResponseSchema } from "@/data/api/ledgerMutationContracts";
import type {
  ApplyLedgerValuationRequest,
  CreateLedgerPaymentRecordRequest,
} from "@/data/api/ledgerMutationContracts";
import type { createLedgerCollaborationRepository } from "@/data/repositories/ledgerCollaborationRepository";
import { assertReplayFixtureWritable } from "@/data/repositories/replayFixtureGuard";

import { SyncConflictError, SyncDependencyError, type SyncWorker } from "./syncEngine";
import type { SyncOperation } from "./syncOperationRepository";

export type LedgerExpenseCreateTransport = {
  createExpense(input: {
    journeyId: string;
    idempotencyKey: string;
    expense: ReturnType<typeof ledgerExpenseToCreateRequest>;
  }): Promise<{ serverId: string; revision: number }>;
  updateExpense(input: {
    journeyId: string;
    serverId: string;
    idempotencyKey: string;
    baseRevision: number;
    auditReason: string | null;
    expense: ReturnType<typeof ledgerExpenseToUpdateRequest>;
  }): Promise<{ serverId: string; revision: number }>;
  deleteExpense(input: {
    journeyId: string;
    serverId: string;
    idempotencyKey: string;
    baseRevision: number;
    auditReason: string | null;
  }): Promise<{ serverId: string; revision: number }>;
  restoreExpense(input: {
    journeyId: string;
    serverId: string;
    idempotencyKey: string;
    baseRevision: number;
    auditReason: string | null;
    businessStatus: "DRAFT" | "ACCEPTED" | "RATE_REQUIRED";
  }): Promise<{ serverId: string; revision: number }>;
  resolveConflict?(input: {
    journeyId: string;
    serverId: string;
    idempotencyKey: string;
    resolution: Parameters<
      ReturnType<typeof createLedgerCollaborationRepository>["queueConflictResolution"]
    >[2];
  }): Promise<{
    entity: Parameters<LedgerExpenseRepository["reconcileCanonicalExpense"]>[1];
  }>;
  createCorrection?(input: {
    journeyId: string;
    expenseServerId: string;
    idempotencyKey: string;
    correction: {
      localId: string;
      baseRevision: number;
      proposedExpense: unknown;
      reason: string;
    };
  }): Promise<{
    correction: Parameters<
      ReturnType<typeof createLedgerCollaborationRepository>["reconcileCorrection"]
    >[1];
    expense: Parameters<LedgerExpenseRepository["reconcileCanonicalExpense"]>[1] | null;
  }>;
  actOnCorrection?(input: {
    journeyId: string;
    correctionServerId: string;
    action: "accept" | "reject" | "withdraw";
    idempotencyKey: string;
    request: { baseRequestRevision: number; resolutionReason: string | null };
  }): Promise<{
    correction: Parameters<
      ReturnType<typeof createLedgerCollaborationRepository>["reconcileCorrection"]
    >[1];
    expense: Parameters<LedgerExpenseRepository["reconcileCanonicalExpense"]>[1] | null;
  }>;
  addPaymentRecord?(input: {
    journeyId: string;
    expenseServerId: string;
    idempotencyKey: string;
    payment: CreateLedgerPaymentRecordRequest;
  }): Promise<{ serverId: string }>;
  applyValuation?(input: {
    journeyId: string;
    expenseServerId: string;
    idempotencyKey: string;
    valuation: ApplyLedgerValuationRequest;
  }): Promise<{
    entity: Parameters<LedgerExpenseRepository["reconcileCanonicalExpense"]>[1];
    serverId: string;
    revision: number;
  }>;
};

const createOperation = "LEDGER_CREATE_EXPENSE";
const updateOperation = "LEDGER_UPDATE_EXPENSE";
const deleteOperation = "LEDGER_DELETE_EXPENSE";
const restoreOperation = "LEDGER_RESTORE_EXPENSE";

class LedgerRevisionConflictError extends Error {
  constructor() {
    super("Ledger mutation has a stale base revision.");
  }
}

export function createLedgerExpenseSyncWorker(
  repository: LedgerExpenseRepository,
  transport: LedgerExpenseCreateTransport,
  collaboration?: ReturnType<typeof createLedgerCollaborationRepository>,
): SyncWorker {
  return {
    async push(operation: SyncOperation) {
      if (operation.tripId) assertReplayFixtureWritable(operation.tripId);
      if (operation.entityType === "ledger_payment_record") {
        await pushPaymentRecordOperation(operation, repository, transport);
        return;
      }
      if (operation.entityType === "ledger_correction") {
        if (!collaboration)
          throw new Error("Ledger collaboration repository is missing.");
        await pushCorrectionOperation(operation, repository, collaboration, transport);
        return;
      }
      if (operation.entityType !== "ledger_expense") {
        throw new Error("Ledger Expense worker received an unsupported operation.");
      }

      const expense = await repository.getExpense(operation.entityId);
      if (!expense) throw new Error("Ledger expense is missing from local storage.");
      if (
        expense.syncStatus === "CONFLICT" &&
        operation.operationType !== "LEDGER_RESOLVE_EXPENSE_CONFLICT"
      ) {
        throw new Error("Ledger expense has an unresolved conflict.");
      }

      await repository.markExpenseSyncing(expense.id);
      try {
        if (operation.operationType === "LEDGER_RESOLVE_EXPENSE_CONFLICT") {
          if (!collaboration)
            throw new Error("Ledger collaboration repository is missing.");
          const resolution = JSON.parse(operation.payloadJson);
          if (!transport.resolveConflict)
            throw new Error("Conflict transport is missing.");
          const response = await transport.resolveConflict({
            journeyId: expense.journeyId,
            serverId: expense.serverId!,
            idempotencyKey: operation.idempotencyKey,
            resolution,
          });
          await repository.reconcileCanonicalExpense(expense.id, response.entity);
          await collaboration.resolveConflict(resolution.conflictId);
        } else if (operation.operationType === "LEDGER_APPLY_VALUATION") {
          if (!transport.applyValuation)
            throw new Error("Valuation transport is missing.");
          if (!expense.serverId)
            throw new SyncDependencyError(
              "Ledger Expense create must sync before valuation.",
            );
          const payload = JSON.parse(
            operation.payloadJson,
          ) as ApplyLedgerValuationRequest;
          const serverPaymentId = payload.paymentRecordId
            ? await repository.getPaymentRecordServerId(payload.paymentRecordId)
            : null;
          if (payload.paymentRecordId && !serverPaymentId)
            throw new SyncDependencyError(
              "Posted payer evidence must sync before valuation.",
            );
          const response = await transport.applyValuation({
            journeyId: expense.journeyId,
            expenseServerId: expense.serverId,
            idempotencyKey: operation.idempotencyKey,
            valuation: {
              ...payload,
              paymentRecordId: serverPaymentId,
              baseRevision: expense.serverRevision,
            },
          });
          await repository.markValuationSynced(
            payload.localValuationId,
            response.entity.valuation!.id,
            payload.localRateSnapshotId,
            response.entity.valuation!.rateSnapshotId,
          );
          await repository.reconcileCanonicalExpense(expense.id, response.entity);
        } else {
          const response = await pushExpenseOperation(expense, operation, transport);
          await repository.markExpenseSynced(
            expense.id,
            response.serverId,
            response.revision,
          );
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.code === "REVISION_CONFLICT") {
          const parsed = ledgerExpenseConflictResponseSchema.safeParse(error.details);
          if (!parsed.success || !collaboration) {
            await repository.markExpenseConflict(expense.id);
            throw new SyncConflictError("Ledger conflict response was incomplete.");
          }
          await collaboration.recordConflict(expense.id, operation, parsed.data);
          throw new SyncConflictError("Ledger expense has an unresolved conflict.");
        }
        if (error instanceof LedgerRevisionConflictError) {
          await repository.markExpenseConflict(expense.id);
          throw new SyncConflictError(error.message);
        }
        await repository.markExpenseFailed(expense.id);
        throw error;
      }
    },
  };
}

async function pushPaymentRecordOperation(
  operation: SyncOperation,
  repository: LedgerExpenseRepository,
  transport: LedgerExpenseCreateTransport,
) {
  if (
    operation.operationType !== "LEDGER_ADD_PAYMENT_RECORD" ||
    !transport.addPaymentRecord
  )
    throw new Error("Payment evidence transport is missing.");
  const payload = JSON.parse(operation.payloadJson) as Omit<
    CreateLedgerPaymentRecordRequest,
    "localId"
  > & {
    expenseId: string;
    id: string;
  };
  const expense = await repository.getExpense(payload.expenseId);
  if (!expense?.serverId)
    throw new SyncDependencyError(
      "Ledger Expense create must sync before payment evidence.",
    );
  const supersedesPaymentRecordId = payload.supersedesPaymentRecordId
    ? await repository.getPaymentRecordServerId(payload.supersedesPaymentRecordId)
    : null;
  if (payload.supersedesPaymentRecordId && !supersedesPaymentRecordId)
    throw new SyncDependencyError("Superseded payment evidence must sync first.");
  const {
    expenseId: _expenseId,
    id,
    expenseRevision: _expenseRevision,
    payerMemberId: _payerMemberId,
    ...payment
  } = payload as typeof payload & {
    expenseRevision?: number;
    payerMemberId?: string;
  };
  const response = await transport.addPaymentRecord({
    journeyId: expense.journeyId,
    expenseServerId: expense.serverId,
    idempotencyKey: operation.idempotencyKey,
    payment: { ...payment, localId: id, supersedesPaymentRecordId },
  });
  await repository.markPaymentRecordSynced(operation.entityId, response.serverId);
}

async function pushCorrectionOperation(
  operation: SyncOperation,
  expenses: LedgerExpenseRepository,
  collaboration: ReturnType<typeof createLedgerCollaborationRepository>,
  transport: LedgerExpenseCreateTransport,
) {
  const payload = JSON.parse(operation.payloadJson) as Record<string, unknown>;
  if (operation.operationType === "LEDGER_PROPOSE_EXPENSE_CORRECTION") {
    if (!transport.createCorrection) throw new Error("Correction transport is missing.");
    const response = await transport.createCorrection({
      journeyId: operation.tripId!,
      expenseServerId: String(payload.expenseServerId),
      idempotencyKey: operation.idempotencyKey,
      correction: {
        localId: String(payload.localId),
        baseRevision: Number(payload.baseRevision),
        proposedExpense: payload.proposedExpense,
        reason: String(payload.reason),
      },
    });
    await collaboration.reconcileCorrection(operation.entityId, response.correction);
    return;
  }
  const action = payload.action as "accept" | "reject" | "withdraw";
  if (!transport.actOnCorrection) throw new Error("Correction transport is missing.");
  const response = await transport.actOnCorrection({
    journeyId: operation.tripId!,
    correctionServerId: String(payload.correctionServerId),
    action,
    idempotencyKey: operation.idempotencyKey,
    request: {
      baseRequestRevision: Number(payload.baseRequestRevision),
      resolutionReason:
        typeof payload.resolutionReason === "string" ? payload.resolutionReason : null,
    },
  });
  await collaboration.reconcileCorrection(operation.entityId, response.correction);
  if (response.expense) {
    await expenses.reconcileCanonicalExpense(
      String(payload.expenseLocalId),
      response.expense,
    );
  }
}

async function pushExpenseOperation(
  expense: LedgerExpense,
  operation: SyncOperation,
  transport: LedgerExpenseCreateTransport,
) {
  const reason = readOperationReason(operation);
  const snapshot = readOperationSnapshot(operation);
  if (operation.operationType === createOperation) {
    return transport.createExpense({
      journeyId: expense.journeyId,
      idempotencyKey: operation.idempotencyKey,
      expense: snapshot
        ? { localId: expense.id, ...snapshot }
        : ledgerExpenseToCreateRequest(expense),
    });
  }

  if (!expense.serverId || expense.serverRevision === 0) {
    throw new Error("Ledger Expense create must sync before dependent mutations.");
  }

  if (operation.operationType === updateOperation) {
    return transport.updateExpense({
      journeyId: expense.journeyId,
      serverId: expense.serverId,
      idempotencyKey: operation.idempotencyKey,
      baseRevision: expense.serverRevision,
      auditReason: reason,
      expense: snapshot ?? ledgerExpenseToUpdateRequest(expense),
    });
  }
  if (operation.operationType === deleteOperation) {
    return transport.deleteExpense({
      journeyId: expense.journeyId,
      serverId: expense.serverId,
      idempotencyKey: operation.idempotencyKey,
      baseRevision: expense.serverRevision,
      auditReason: reason,
    });
  }
  if (operation.operationType === restoreOperation) {
    return transport.restoreExpense({
      journeyId: expense.journeyId,
      serverId: expense.serverId,
      idempotencyKey: operation.idempotencyKey,
      baseRevision: expense.serverRevision,
      auditReason: reason,
      businessStatus: expense.status === "DELETED" ? "ACCEPTED" : expense.status,
    });
  }
  throw new Error("Ledger Expense worker received an unsupported operation.");
}

function readOperationReason(operation: SyncOperation) {
  try {
    const payload = JSON.parse(operation.payloadJson) as { reason?: unknown };
    return typeof payload.reason === "string" ? payload.reason : null;
  } catch {
    return null;
  }
}

function readOperationSnapshot(operation: SyncOperation) {
  try {
    const payload = JSON.parse(operation.payloadJson) as { expense?: unknown };
    return payload.expense && typeof payload.expense === "object"
      ? (payload.expense as ReturnType<typeof ledgerExpenseToUpdateRequest>)
      : null;
  } catch {
    return null;
  }
}

export function ledgerExpenseToCreateRequest(expense: LedgerExpense) {
  return {
    localId: expense.id,
    title: expense.title,
    description: expense.description,
    category: expense.category,
    occurredAt: expense.occurredAt,
    economicDate: expense.economicDate,
    payerMemberId: expense.payerMemberId,
    original: expense.original,
    businessStatus: expense.status === "DELETED" ? "DRAFT" : expense.status,
    participants: expense.participants,
    splits: expense.splits,
    valuation: expense.valuation
      ? {
          policy: expense.valuation.policy,
          original: expense.valuation.original,
          settlement: expense.valuation.settlement,
          rateSnapshotId: expense.valuation.rateSnapshotId,
          paymentRecordId: expense.valuation.paymentRecordId,
          reason: expense.valuation.reason,
        }
      : null,
  };
}

export function ledgerExpenseToUpdateRequest(expense: LedgerExpense) {
  const { localId: _localId, ...request } = ledgerExpenseToCreateRequest(expense);
  return request;
}
