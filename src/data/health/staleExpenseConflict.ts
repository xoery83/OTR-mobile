import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

export const STALE_EXPENSE_CONFLICT_RULE = "DH_STALE_EXPENSE_CONFLICT_V1" as const;
export const STALE_EXPENSE_CONFLICT_ACTION = "RECONCILE_STALE_CONFLICT_V1" as const;

type Database = {
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
};

type ConflictRow = {
  conflictId: string;
  operationId: string;
  baseRevision: number;
  currentRevision: number;
  canonicalSnapshotJson: string;
  submittedSnapshotJson: string;
  status: "OPEN" | "RESOLVED" | "SUPERSEDED";
  createdAt: string;
};

export type StaleExpenseConflictEvidence = {
  operationId: string;
  entityId: string;
  journeyId: string;
  serverId: string;
  localRevision: number;
  serverRevision: number;
  syncStatus: string;
  conflictId: string;
  conflictStatus: ConflictRow["status"];
  canonicalRevision: number;
  deferredRevision: number | null;
  reconciliationOperationId: string | null;
  inputDigest: string;
};

export async function inspectStaleExpenseConflict(input: {
  database: Database;
  accountId: string;
  targetOperationId: string;
  getExpense(id: string): Promise<LedgerExpense | null>;
}): Promise<StaleExpenseConflictEvidence | null> {
  const operation = await input.database.getFirstAsync<{
    entityId: string;
    journeyId: string | null;
  }>(
    `SELECT entity_id AS entityId, trip_id AS journeyId
     FROM sync_operations
     WHERE id = ? AND owner_user_id = ? AND entity_type = 'ledger_expense'
       AND status = 'CONFLICT'`,
    input.targetOperationId,
    input.accountId,
  );
  if (!operation?.journeyId) return null;
  if (
    !(await input.database.getFirstAsync(
      `SELECT 1 FROM ledger_actor_context WHERE user_id = ? AND journey_id = ?`,
      input.accountId,
      operation.journeyId,
    ))
  )
    return null;

  const expense = await input.getExpense(operation.entityId);
  if (
    !expense?.serverId ||
    expense.id !== operation.entityId ||
    expense.journeyId !== operation.journeyId
  )
    return null;

  const active = await input.database.getFirstAsync(
    `SELECT 1 FROM sync_operations
     WHERE owner_user_id = ? AND entity_type = 'ledger_expense' AND entity_id = ?
       AND status IN ('PENDING', 'PROCESSING', 'RETRYABLE',
         'DEPENDENCY_BLOCKED', 'FAILED') LIMIT 1`,
    input.accountId,
    expense.id,
  );
  if (active) return null;

  const conflicts = await input.database.getAllAsync<ConflictRow>(
    `SELECT conflict_id AS conflictId, operation_id AS operationId,
       base_revision AS baseRevision, current_revision AS currentRevision,
       canonical_snapshot_json AS canonicalSnapshotJson,
       submitted_snapshot_json AS submittedSnapshotJson, status,
       created_at AS createdAt
     FROM ledger_expense_conflicts
     WHERE journey_id = ? AND expense_id = ? ORDER BY current_revision DESC, created_at DESC`,
    expense.journeyId,
    expense.id,
  );
  const target = conflicts.find(
    (conflict) => conflict.operationId === input.targetOperationId,
  );
  if (!target) return null;

  const conflictOperations = await input.database.getAllAsync<{ id: string }>(
    `SELECT id FROM sync_operations
     WHERE owner_user_id = ? AND entity_type = 'ledger_expense' AND entity_id = ?
       AND status = 'CONFLICT'`,
    input.accountId,
    expense.id,
  );
  if (
    conflictOperations.some(
      ({ id }) => !conflicts.some((conflict) => conflict.operationId === id),
    )
  )
    return null;

  const localIntent = ledgerExpenseUserOwnedFields(expense);
  let canonical: Record<string, unknown> | null = null;
  let canonicalRevision = 0;
  let deferredRevision: number | null = null;
  let reconciliationOperationId: string | null = null;

  if (target.status === "OPEN") {
    if (conflicts.filter((conflict) => conflict.status === "OPEN").length !== 1)
      return null;
    canonical = parseObject(target.canonicalSnapshotJson);
    const submitted = parseObject(target.submittedSnapshotJson);
    canonicalRevision = readRevision(canonical);
    if (
      !canonical ||
      !submitted ||
      canonicalRevision <= 0 ||
      !sameLedgerExpenseUserOwnedFields(localIntent, canonical) ||
      !sameLedgerExpenseUserOwnedFields(localIntent, submitted)
    )
      return null;
    const deferred = await input.database.getFirstAsync<{
      revision: number;
      payloadJson: string;
    }>(
      `SELECT revision, payload_json AS payloadJson
       FROM ledger_deferred_server_changes
       WHERE journey_id = ? AND entity_type = 'EXPENSE' AND entity_id = ?
         AND revision = ?`,
      expense.journeyId,
      expense.serverId,
      canonicalRevision,
    );
    const payload = deferred ? parseObject(deferred.payloadJson) : null;
    const aggregate = payload ? parseObjectValue(payload.aggregate) : null;
    if (
      !deferred ||
      !aggregate ||
      payload?.entityId !== expense.serverId ||
      payload?.revision !== canonicalRevision ||
      !sameLedgerExpenseUserOwnedFields(localIntent, aggregate)
    )
      return null;
    deferredRevision = deferred.revision;
  } else {
    if (conflicts.some((conflict) => conflict.status === "OPEN")) return null;
    const canonicalConflict = conflicts.find((conflict) => {
      const snapshot = parseObject(conflict.canonicalSnapshotJson);
      return (
        conflict.status !== "OPEN" &&
        readRevision(snapshot) === expense.revision &&
        readRevision(snapshot) === expense.serverRevision &&
        sameLedgerExpenseUserOwnedFields(localIntent, snapshot)
      );
    });
    canonical = canonicalConflict
      ? parseObject(canonicalConflict.canonicalSnapshotJson)
      : null;
    canonicalRevision = canonicalConflict ? readRevision(canonical) : expense.revision;
    const reconciliation = await input.database.getFirstAsync<{
      id: string;
      payloadJson: string;
    }>(
      `SELECT id, payload_json AS payloadJson FROM sync_operations
       WHERE owner_user_id = ? AND entity_type = 'ledger_expense' AND entity_id = ?
         AND operation_type = 'LEDGER_RESOLVE_EXPENSE_CONFLICT'
         AND status = 'COMPLETED' AND base_version IN (?, ?) AND created_at >= ?
       ORDER BY base_version DESC, created_at DESC LIMIT 1`,
      input.accountId,
      expense.id,
      canonicalRevision - 1,
      canonicalRevision,
      (canonicalConflict ?? target).createdAt,
    );
    if (!reconciliation) return null;
    if (!canonicalConflict) {
      const payload = parseObject(reconciliation.payloadJson);
      const resolvedExpense = payload ? parseObjectValue(payload.resolvedExpense) : null;
      const audit = await input.database.getFirstAsync(
        `SELECT 1 FROM ledger_expense_audit_events
         WHERE expense_id = ? AND expense_revision = ?
           AND event_type = 'CONFLICT_RESOLVED' AND server_id IS NOT NULL`,
        expense.id,
        expense.revision,
      );
      if (
        !payload ||
        payload.conflictId !== target.conflictId ||
        payload.currentRevision !== target.currentRevision ||
        !sameLedgerExpenseUserOwnedFields(localIntent, resolvedExpense) ||
        !audit ||
        expense.serverRevision !== expense.revision ||
        expense.syncStatus !== "SYNCED"
      )
        return null;
      canonical = {
        ...resolvedExpense,
        id: expense.serverId,
        journeyId: expense.journeyId,
        revision: expense.revision,
      };
    }
    reconciliationOperationId = reconciliation.id;
  }

  if (
    !canonical ||
    canonical.id !== expense.serverId ||
    canonical.journeyId !== expense.journeyId ||
    canonicalRevision < expense.serverRevision ||
    canonicalRevision !== expense.revision
  )
    return null;

  return {
    operationId: input.targetOperationId,
    entityId: expense.id,
    journeyId: expense.journeyId,
    serverId: expense.serverId,
    localRevision: expense.revision,
    serverRevision: expense.serverRevision,
    syncStatus: expense.syncStatus,
    conflictId: target.conflictId,
    conflictStatus: target.status,
    canonicalRevision,
    deferredRevision,
    reconciliationOperationId,
    inputDigest: digest(
      JSON.stringify({
        accountId: input.accountId,
        operationId: input.targetOperationId,
        entityId: expense.id,
        journeyId: expense.journeyId,
        serverId: expense.serverId,
        localRevision: expense.revision,
        serverRevision: expense.serverRevision,
        syncStatus: expense.syncStatus,
        conflictId: target.conflictId,
        conflictStatus: target.status,
        canonicalRevision,
        deferredRevision,
        reconciliationOperationId,
        localIntent,
      }),
    ),
  };
}

export function sameLedgerExpenseUserOwnedFields(
  local: ReturnType<typeof ledgerExpenseUserOwnedFields>,
  candidate: Record<string, unknown> | null,
) {
  return (
    candidate !== null &&
    JSON.stringify(local) === JSON.stringify(ledgerExpenseUserOwnedFields(candidate))
  );
}

export function ledgerExpenseUserOwnedFields(
  expense: LedgerExpense | Record<string, unknown>,
) {
  const value = expense as Record<string, unknown>;
  const participants = Array.isArray(value.participants) ? value.participants : [];
  const splits = Array.isArray(value.splits) ? value.splits : [];
  const valuation = parseObjectValue(value.valuation);
  return {
    title: value.title,
    description: value.description ?? null,
    category: value.category,
    occurredAt: normalizedDate(value.occurredAt),
    economicDate: value.economicDate ?? null,
    payerMemberId: value.payerMemberId,
    original: money(value.original),
    businessStatus: value.businessStatus ?? value.status,
    settlementParticipation: value.settlementParticipation ?? "INCLUDED",
    deleted: value.deletedAt != null || value.status === "DELETED",
    participants: participants
      .map((item) => {
        const participant = parseObjectValue(item) ?? {};
        return {
          memberId: participant.memberId,
          displayNameSnapshot: participant.displayNameSnapshot ?? null,
          householdIdSnapshot: participant.householdIdSnapshot ?? null,
        };
      })
      .sort(compareMember),
    splits: splits
      .map((item) => {
        const split = parseObjectValue(item) ?? {};
        return {
          memberId: split.memberId,
          method: split.method,
          originalMinor: split.originalMinor,
          weightUnits: split.weightUnits ?? null,
          percentageUnits: split.percentageUnits ?? null,
          roundingAdjustmentMinor: split.roundingAdjustmentMinor ?? 0,
        };
      })
      .sort(compareMember),
    valuation: valuation
      ? {
          policy: valuation.policy,
          original: money(valuation.original),
          settlement: money(valuation.settlement),
          rateSnapshotId: valuation.rateSnapshotId ?? null,
          paymentRecordId: valuation.paymentRecordId ?? null,
          reason: valuation.reason ?? null,
        }
      : null,
  };
}

function money(value: unknown) {
  const item = parseObjectValue(value) ?? {};
  return { minor: item.minor, currency: item.currency, scale: item.scale };
}

function compareMember(left: { memberId: unknown }, right: { memberId: unknown }) {
  return String(left.memberId).localeCompare(String(right.memberId));
}

function normalizedDate(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return value;
  return new Date(value).toISOString();
}

function parseObject(value: string) {
  try {
    return parseObjectValue(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseObjectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readRevision(value: Record<string, unknown> | null) {
  return typeof value?.revision === "number" ? value.revision : 0;
}

function digest(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
