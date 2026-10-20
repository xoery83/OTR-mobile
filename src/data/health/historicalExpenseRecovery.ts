import { createLedgerExpenseRequestSchema } from "@/data/api/ledgerMutationContracts";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

export const HISTORICAL_EXPENSE_RECOVERY_RULE =
  "DH_HISTORICAL_STRANDED_CREATE_V1" as const;
export const HISTORICAL_EXPENSE_RECOVERY_ACTION =
  "RECOVER_HISTORICAL_STRANDED_CREATE_V1" as const;

export type HistoricalExpenseOperation = {
  id: string;
  journeyId: string | null;
  entityId: string;
  operationType: string;
  idempotencyKey: string;
  payloadJson: string;
  status: string;
  attemptCount: number;
  failureCategory: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  lastAttemptAt: string | null;
  dependencyOperationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HistoricalExpenseRecoveryEvidence = {
  createOperationId: string;
  historicalUpdateIds: string[];
  inputDigest: string;
};

export function inspectHistoricalExpenseRecovery(input: {
  accountId: string;
  journeyAuthorized: boolean;
  expense: LedgerExpense | null;
  operations: HistoricalExpenseOperation[];
  requireFailedCreate?: boolean;
}): HistoricalExpenseRecoveryEvidence | null {
  const expense = input.expense;
  if (
    !input.journeyAuthorized ||
    !expense ||
    expense.serverId !== null ||
    expense.serverRevision !== 0 ||
    expense.syncStatus === "CONFLICT"
  )
    return null;

  const creates = input.operations.filter(
    (operation) => operation.operationType === "LEDGER_CREATE_EXPENSE",
  );
  if (creates.length !== 1) return null;
  const create = creates[0];
  const requireFailedCreate = input.requireFailedCreate ?? true;
  if (
    create.journeyId !== expense.journeyId ||
    create.entityId !== expense.id ||
    (requireFailedCreate && create.status !== "FAILED") ||
    !isHistoricalUnknownFailure(create) ||
    !wasAttempted(create)
  )
    return null;

  const updates = input.operations.filter((operation) => operation.id !== create.id);
  if (
    updates.length === 0 ||
    updates.some(
      (operation) =>
        operation.journeyId !== expense.journeyId ||
        operation.entityId !== expense.id ||
        operation.operationType !== "LEDGER_UPDATE_EXPENSE" ||
        operation.status !== "FAILED" ||
        !isHistoricalUnknownFailure(operation) ||
        (operation.dependencyOperationId !== null &&
          operation.dependencyOperationId !== create.id) ||
        operation.createdAt < create.createdAt,
    )
  )
    return null;

  const original = readExpenseSnapshot(create.payloadJson, expense.id);
  const current = ledgerExpenseToCreateRequest(expense);
  if (
    !original ||
    !create.idempotencyKey.trim() ||
    !createLedgerExpenseRequestSchema.safeParse(original).success ||
    !createLedgerExpenseRequestSchema.safeParse(current).success ||
    updates.some((operation) => !readExpenseSnapshot(operation.payloadJson, expense.id))
  )
    return null;

  const orderedUpdates = [...updates].sort(compareOperation);
  return {
    createOperationId: create.id,
    historicalUpdateIds: orderedUpdates.map((operation) => operation.id),
    inputDigest: digest(
      JSON.stringify({
        accountId: input.accountId,
        journeyId: expense.journeyId,
        entityId: expense.id,
        originalPayload: create.payloadJson,
        originalIdempotencyKey: create.idempotencyKey,
        current,
        updates: orderedUpdates.map((operation) => ({
          id: operation.id,
          idempotencyKey: operation.idempotencyKey,
          payloadJson: operation.payloadJson,
          createdAt: operation.createdAt,
        })),
      }),
    ),
  };
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
    settlementParticipation: expense.settlementParticipation,
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

export function ledgerExpenseUserIntent(request: Record<string, unknown>) {
  const occurredAt =
    typeof request.occurredAt === "string" &&
    !Number.isNaN(Date.parse(request.occurredAt))
      ? new Date(request.occurredAt).toISOString()
      : request.occurredAt;
  return {
    title: request.title,
    description: request.description,
    category: request.category,
    occurredAt,
    economicDate: request.economicDate,
    payerMemberId: request.payerMemberId,
    original: request.original,
    settlementParticipation: request.settlementParticipation,
    participants: request.participants,
    splits: Array.isArray(request.splits)
      ? (request.splits as Record<string, unknown>[]).map(
          ({ settlementMinor: _settlementMinor, ...split }) => split,
        )
      : request.splits,
  };
}

function readExpenseSnapshot(payloadJson: string, entityId: string) {
  try {
    const payload = JSON.parse(payloadJson) as {
      expenseId?: unknown;
      expense?: unknown;
    };
    if (
      payload.expenseId !== entityId ||
      !payload.expense ||
      typeof payload.expense !== "object"
    )
      return null;
    return { localId: entityId, ...payload.expense };
  } catch {
    return null;
  }
}

function isHistoricalUnknownFailure(operation: HistoricalExpenseOperation) {
  return (
    (operation.failureCategory === null || operation.failureCategory === "UNKNOWN") &&
    (operation.errorCode === null || operation.errorCode === "SYNC_FAILED") &&
    (operation.errorMessage === null || operation.errorMessage === "SYNC_FAILED")
  );
}

function wasAttempted(operation: HistoricalExpenseOperation) {
  return Boolean(
    operation.lastAttemptAt ||
    operation.attemptCount > 0 ||
    (operation.errorMessage === "SYNC_FAILED" &&
      operation.updatedAt > operation.createdAt),
  );
}

function compareOperation(
  left: HistoricalExpenseOperation,
  right: HistoricalExpenseOperation,
) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function digest(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
