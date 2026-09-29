import { SyncDependencyError, SyncConflictError } from "@/data/sync/syncEngine";
import type {
  LedgerBootstrapResponse,
  LedgerExpenseDto,
} from "@/data/api/ledgerReadContracts";
import type {
  ExpenseOperationReceipt,
  ExpenseOperationResult,
} from "@/data/api/ledgerMutationContracts";
import {
  expenseOperationReceiptSchema,
  expenseCommandRequestSchema,
} from "@/data/api/ledgerMutationContracts";
import {
  buildExpenseUserPatch,
  expenseFinancialInput,
  sameExpenseValue,
  type ExpenseTypedIntent,
  type ExpenseUserPatch,
} from "@/domain/ledger/expenseIntent";
import type { LedgerExpense, LedgerExpenseDatabase } from "./ledgerExpenseRepository";

export type ExpenseCommandRow = {
  operationId: string;
  sequence: number;
  predecessorOperationId: string | null;
  observedRevision: number;
  observedBaseJson: string | null;
  intentJson: string;
  projectionJson: string;
  status: string;
  idempotencyKey: string;
  boundRevision: number | null;
  boundRequestJson: string | null;
  receiptJson: string | null;
};

export async function storeExpenseCanonical(
  database: LedgerExpenseDatabase,
  accountId: string,
  expenseId: string,
  canonical: LedgerExpenseDto,
) {
  const known = await readExpenseCanonical(database, accountId, expenseId);
  if (known?.revision === canonical.revision) {
    const auditEvents = new Map(known.auditEvents.map((event) => [event.id, event]));
    for (const event of canonical.auditEvents) {
      const previous = auditEvents.get(event.id);
      if (!previous || Date.parse(event.createdAt) >= Date.parse(previous.createdAt))
        auditEvents.set(event.id, event);
    }
    canonical = {
      ...known,
      updatedAt:
        Date.parse(canonical.updatedAt) > Date.parse(known.updatedAt)
          ? canonical.updatedAt
          : known.updatedAt,
      auditEvents: [...auditEvents.values()],
    };
  }
  await database.runAsync(
    `INSERT INTO ledger_expense_canonical_baselines (account_id, expense_id, server_id, revision, canonical_json)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT (account_id, expense_id) DO UPDATE
     SET server_id = excluded.server_id, revision = excluded.revision, canonical_json = excluded.canonical_json
     WHERE excluded.revision >= ledger_expense_canonical_baselines.revision`,
    accountId,
    expenseId,
    canonical.id,
    canonical.revision,
    JSON.stringify(canonical),
  );
}

export async function readExpenseCanonical(
  database: LedgerExpenseDatabase,
  accountId: string,
  expenseId: string,
) {
  const row = await database.getFirstAsync<{ canonicalJson: string }>(
    `SELECT canonical_json AS canonicalJson FROM ledger_expense_canonical_baselines WHERE account_id = ? AND expense_id = ?`,
    accountId,
    expenseId,
  );
  return row ? (JSON.parse(row.canonicalJson) as LedgerExpenseDto) : null;
}

export async function recordExpenseCommand(
  database: LedgerExpenseDatabase,
  accountId: string,
  operationId: string,
  projection: LedgerExpense,
  intent: ExpenseTypedIntent,
) {
  const existing = await database.getFirstAsync<{
    operationId: string;
    intentJson: string;
  }>(
    `SELECT operation_id AS operationId, intent_json AS intentJson FROM ledger_expense_commands WHERE account_id = ? AND operation_id = ?`,
    accountId,
    operationId,
  );
  if (existing) {
    const prior = JSON.parse(existing.intentJson) as ExpenseTypedIntent;
    if (prior.type === "UPDATE" && intent.type === "UPDATE") {
      const patch: ExpenseUserPatch = {};
      for (const group of ["descriptive", "financial", "participantSplit"] as const)
        if (prior.patch[group] || intent.patch[group])
          Object.assign(patch, {
            [group]: { ...prior.patch[group], ...intent.patch[group] },
          });
      intent = { type: "UPDATE", patch };
    }
    await database.runAsync(
      `UPDATE ledger_expense_commands SET intent_json = ?, projection_json = ?
       WHERE account_id = ? AND operation_id = ? AND bound_request_json IS NULL`,
      JSON.stringify(intent),
      JSON.stringify(projection),
      accountId,
      operationId,
    );
    return;
  }
  const canonical = await readExpenseCanonical(database, accountId, projection.id);
  const predecessor = await database.getFirstAsync<{ id: string; status: string }>(
    `SELECT id, status FROM sync_operations WHERE owner_user_id = ? AND entity_type = 'ledger_expense'
       AND entity_id = ? AND id <> ?
       AND (status <> 'COMPLETED' OR EXISTS (SELECT 1 FROM ledger_expense_commands command WHERE command.operation_id = sync_operations.id))
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    accountId,
    projection.id,
    operationId,
  );
  await database.runAsync(
    `INSERT INTO ledger_expense_commands
     (account_id, expense_id, operation_id, intent_sequence, predecessor_operation_id,
      observed_server_revision, observed_base_json, intent_json, projection_json)
     SELECT ?, ?, ?, COALESCE(MAX(intent_sequence), 0) + 1, ?, ?, ?, ?, ?
     FROM ledger_expense_commands WHERE account_id = ? AND expense_id = ?`,
    accountId,
    projection.id,
    operationId,
    predecessor?.id ?? null,
    canonical?.revision ?? projection.serverRevision,
    canonical ? JSON.stringify(canonical) : null,
    JSON.stringify(intent),
    JSON.stringify(projection),
    accountId,
    projection.id,
  );
  if (predecessor && predecessor.status !== "COMPLETED")
    await database.runAsync(
      `UPDATE sync_operations SET dependency_operation_id = ?, status = 'DEPENDENCY_BLOCKED'
       WHERE id = ? AND owner_user_id = ?`,
      predecessor.id,
      operationId,
      accountId,
    );
}

export async function readExpenseCommands(
  database: LedgerExpenseDatabase,
  accountId: string,
  expenseId: string,
) {
  return database.getAllAsync<ExpenseCommandRow>(
    `SELECT command.operation_id AS operationId, intent_sequence AS sequence,
       predecessor_operation_id AS predecessorOperationId, observed_server_revision AS observedRevision, observed_base_json AS observedBaseJson,
       intent_json AS intentJson, projection_json AS projectionJson, operation.status,
       operation.idempotency_key AS idempotencyKey, bound_execution_revision AS boundRevision,
       bound_request_json AS boundRequestJson, receipt.receipt_json AS receiptJson
     FROM ledger_expense_commands command JOIN sync_operations operation ON operation.id = command.operation_id
     LEFT JOIN ledger_expense_operation_receipts receipt ON receipt.account_id = command.account_id AND receipt.operation_id = command.operation_id
     WHERE command.account_id = ? AND command.expense_id = ? ORDER BY intent_sequence`,
    accountId,
    expenseId,
  );
}

export async function storeExpenseReceipt(
  database: LedgerExpenseDatabase,
  accountId: string,
  command: ExpenseCommandRow,
  canonical: LedgerExpenseDto,
  disposition: ExpenseOperationReceipt["disposition"] = "APPLIED",
  serverReceipt?: ExpenseOperationReceipt,
) {
  const intent = JSON.parse(command.intentJson) as ExpenseTypedIntent;
  const receipt = expenseOperationReceiptSchema.parse({
    operationId: command.operationId,
    commandId: command.operationId,
    idempotencyKey: command.idempotencyKey,
    expenseId: canonical.id,
    commandType: intent.type,
    intentSequence: command.sequence,
    disposition,
    canonicalRevision: canonical.revision,
  });
  if (serverReceipt && !sameExpenseValue(receipt, serverReceipt))
    throw new Error("Server Expense receipt does not match the original command.");
  const existing = await database.getFirstAsync<{
    receiptJson: string;
    canonicalJson: string;
  }>(
    `SELECT receipt_json AS receiptJson, canonical_json AS canonicalJson FROM ledger_expense_operation_receipts WHERE account_id = ? AND operation_id = ?`,
    accountId,
    command.operationId,
  );
  if (existing) {
    if (
      existing.receiptJson !== JSON.stringify(receipt) ||
      existing.canonicalJson !== JSON.stringify(canonical)
    )
      throw new Error("Expense receipt replay differs from immutable result.");
  } else {
    await database.runAsync(
      `INSERT INTO ledger_expense_operation_receipts (account_id, operation_id, expense_id, receipt_json, canonical_json) VALUES (?, ?, ?, ?, ?)`,
      accountId,
      command.operationId,
      canonical.id,
      JSON.stringify(receipt),
      JSON.stringify(canonical),
    );
  }
  await database.runAsync(
    `UPDATE sync_operations SET status = 'COMPLETED', claim_owner = NULL, lease_expires_at = NULL,
       next_attempt_at = NULL, failure_category = NULL, last_error_code = NULL, last_error_message = NULL,
       updated_at = ? WHERE id = ? AND owner_user_id = ?`,
    new Date().toISOString(),
    command.operationId,
    accountId,
  );
}

export function projectExpenseIntent(
  baseline: LedgerExpense,
  command: ExpenseCommandRow,
): LedgerExpense {
  const intent = JSON.parse(command.intentJson) as ExpenseTypedIntent;
  const saved = JSON.parse(command.projectionJson) as LedgerExpense;
  if (
    baseline.status === "DELETED" &&
    intent.type !== "RESTORE" &&
    intent.type !== "DELETE"
  )
    return baseline;
  if (intent.type === "DELETE")
    return {
      ...baseline,
      revision: Math.max(baseline.revision, saved.revision),
      status: "DELETED",
      deletedAt: saved.deletedAt,
      updatedAt: saved.updatedAt,
    };
  if (intent.type === "RESTORE")
    return {
      ...baseline,
      revision: Math.max(baseline.revision, saved.revision),
      status: intent.businessStatus,
      deletedAt: null,
      updatedAt: saved.updatedAt,
    };
  if (intent.type === "UPDATE") {
    const patch = intent.patch;
    if (patch.financial || patch.participantSplit)
      return {
        ...saved,
        serverId: baseline.serverId,
        serverRevision: baseline.serverRevision,
      };
    // A pending descriptive update cannot revive a canonical tombstone.
    return {
      ...baseline,
      ...patch.descriptive,
      revision: Math.max(baseline.revision, saved.revision),
      updatedAt: saved.updatedAt,
    };
  }
  if (intent.type === "APPLY_VALUATION") {
    if (baseline.status === "DELETED") return baseline;
    if (
      !sameExpenseValue(
        expenseFinancialInput({ ...baseline, businessStatus: baseline.status }),
        expenseFinancialInput({
          ...saved,
          businessStatus: saved.status === "DELETED" ? "DRAFT" : saved.status,
        }),
      )
    )
      return {
        ...saved,
        serverId: baseline.serverId,
        serverRevision: baseline.serverRevision,
      };
    return {
      ...baseline,
      valuation: saved.valuation,
      splits: saved.splits,
      status: saved.status,
      revision: Math.max(baseline.revision, saved.revision),
      updatedAt: saved.updatedAt,
    };
  }
  return {
    ...saved,
    serverId: baseline.serverId,
    serverRevision: baseline.serverRevision,
  };
}

export function localExpenseIntent(
  expense: LedgerExpense,
  base?: LedgerExpense,
): ExpenseTypedIntent {
  if (expense.status === "DELETED") return { type: "DELETE" };
  const editable = { ...expense, businessStatus: expense.status };
  return base
    ? {
        type: "UPDATE",
        patch: buildExpenseUserPatch(
          { ...base, businessStatus: base.status === "DELETED" ? "DRAFT" : base.status },
          editable,
        ),
      }
    : { type: "CREATE", expense: editable };
}

export async function getExpenseOperationResult(
  database: LedgerExpenseDatabase,
  accountId: string,
  operationId: string,
): Promise<ExpenseOperationResult | null> {
  const row = await database.getFirstAsync<{
    expenseId: string;
    sequence: number;
    intentJson: string;
    status: string;
    dependencyId: string | null;
    receiptJson: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>(
    `SELECT command.expense_id AS expenseId, intent_sequence AS sequence, intent_json AS intentJson,
       operation.status, operation.dependency_operation_id AS dependencyId, receipt.receipt_json AS receiptJson, operation.last_error_code AS errorCode, operation.last_error_message AS errorMessage
     FROM ledger_expense_commands command JOIN sync_operations operation ON operation.id = command.operation_id
     LEFT JOIN ledger_expense_operation_receipts receipt ON receipt.account_id = command.account_id AND receipt.operation_id = command.operation_id
     WHERE command.account_id = ? AND command.operation_id = ?`,
    accountId,
    operationId,
  );
  if (!row) return null;
  const common = {
    expenseId: row.expenseId,
    operationId,
    commandType: (JSON.parse(row.intentJson) as ExpenseTypedIntent).type,
    intentSequence: row.sequence,
    changed: true as const,
    ...(row.errorCode
      ? {
          error: {
            code: row.errorCode,
            message: (row.errorMessage ?? "This change could not finish.").slice(0, 300),
          },
        }
      : {}),
  };
  if (row.receiptJson) {
    const receipt = expenseOperationReceiptSchema.parse(JSON.parse(row.receiptJson));
    return {
      ...common,
      state: "SERVER_CONFIRMED",
      disposition: receipt.disposition,
      confirmedServerRevision: receipt.canonicalRevision,
    };
  }
  const blocking = await database.getFirstAsync<{
    id: string;
    status: string;
    disposition: string | null;
  }>(
    `WITH RECURSIVE predecessors(id) AS (
       SELECT dependency_operation_id FROM sync_operations WHERE id = ? AND owner_user_id = ?
       UNION SELECT op.dependency_operation_id FROM sync_operations op JOIN predecessors p ON op.id = p.id WHERE op.owner_user_id = ?
     ) SELECT op.id, op.status, json_extract(receipt.receipt_json, '$.disposition') AS disposition
       FROM predecessors p JOIN sync_operations op ON op.id = p.id
       LEFT JOIN ledger_expense_operation_receipts receipt ON receipt.operation_id = op.id AND receipt.account_id = op.owner_user_id
       WHERE op.status IN ('CONFLICT', 'FAILED') OR json_extract(receipt.receipt_json, '$.disposition') IN ('KEPT_SERVER', 'SUPERSEDED') LIMIT 1`,
    operationId,
    accountId,
    accountId,
  );
  const conflict = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM sync_operations WHERE owner_user_id = ? AND entity_type = 'ledger_expense'
     AND entity_id = ? AND status = 'CONFLICT' ORDER BY created_at, rowid LIMIT 1`,
    accountId,
    row.expenseId,
  );
  const state =
    row.status === "CONFLICT" ||
    blocking?.status === "CONFLICT" ||
    blocking?.disposition ||
    conflict
      ? "CONFLICT_REQUIRES_ACTION"
      : row.status === "FAILED" || blocking?.status === "FAILED"
        ? "TERMINAL_FAILURE"
        : row.status === "RETRYABLE"
          ? "RETRYABLE_FAILURE"
          : "PENDING_SYNC";
  return {
    ...common,
    state,
    disposition: null,
    ...((conflict?.id ?? blocking?.id ?? row.dependencyId)
      ? { blockingOperationId: conflict?.id ?? blocking?.id ?? row.dependencyId! }
      : {}),
  };
}

export type { ExpenseUserPatch };

export async function bindExpenseOperation(
  database: LedgerExpenseDatabase,
  accountId: string,
  operation: import("@/data/sync/syncOperationRepository").SyncOperation,
  typed = false,
) {
  const command = (
    await readExpenseCommands(database, accountId, operation.entityId)
  ).find((row) => row.operationId === operation.id);
  if (!command) return operation; // Historical attempted commands are never rewritten.
  if (command.boundRequestJson)
    return {
      ...operation,
      baseVersion: command.boundRevision,
      payloadJson: command.boundRequestJson,
    };
  let revision = command.observedRevision;
  let causalBaseReceipt: ExpenseOperationReceipt | null = null;
  if (command.predecessorOperationId) {
    const parent = await database.getFirstAsync<{ receiptJson: string }>(
      `SELECT receipt_json AS receiptJson FROM ledger_expense_operation_receipts WHERE account_id = ? AND operation_id = ?`,
      accountId,
      command.predecessorOperationId,
    );
    if (parent) {
      const receipt = expenseOperationReceiptSchema.parse(JSON.parse(parent.receiptJson));
      if (receipt.disposition !== "APPLIED")
        throw new SyncConflictError(
          "Predecessor intent was not applied; resolution is required.",
        );
      revision = Math.max(revision, receipt.canonicalRevision);
      causalBaseReceipt = receipt;
    } else {
      throw new SyncDependencyError(
        "Predecessor canonical receipt is unavailable.",
        command.predecessorOperationId,
      );
    }
  }
  let intent = JSON.parse(command.intentJson) as ExpenseTypedIntent;
  const projection = JSON.parse(command.projectionJson) as LedgerExpense;
  let payload = JSON.parse(operation.payloadJson) as Record<string, unknown>;
  if (intent.type === "RESTORE") payload.expense = { businessStatus: projection.status };
  if (typed && operation.attemptCount === 0) {
    if (intent.type === "APPLY_VALUATION" && intent.valuation.paymentRecordId) {
      const payment = await database.getFirstAsync<{ serverId: string | null }>(
        `SELECT server_id AS serverId FROM ledger_payment_records WHERE id=?`,
        intent.valuation.paymentRecordId,
      );
      if (!payment?.serverId)
        throw new SyncDependencyError(
          "Posted payer evidence must sync before valuation.",
        );
      intent = {
        ...intent,
        valuation: { ...intent.valuation, paymentRecordId: payment.serverId },
      };
    }
    payload = expenseCommandRequestSchema.parse({
      auditReason: payload.reason ?? null,
      envelope: {
        commandId: command.operationId,
        intentVersion: 2,
        intentSequence: command.sequence,
        predecessorOperationId: command.predecessorOperationId,
        observedServerRevision: command.observedRevision,
        observedBase: command.observedBaseJson
          ? JSON.parse(command.observedBaseJson)
          : null,
        patchOrIntent: intent,
        causalBaseReceipt,
        boundExecutionRevision: revision,
        idempotencyKey: operation.idempotencyKey,
      },
    });
  }
  await database.runAsync(
    `UPDATE ledger_expense_commands SET bound_execution_revision = ?, bound_request_json = ?
     WHERE account_id = ? AND operation_id = ? AND bound_request_json IS NULL`,
    revision,
    JSON.stringify(payload),
    accountId,
    operation.id,
  );
  return { ...operation, baseVersion: revision, payloadJson: JSON.stringify(payload) };
}

type Metadata = NonNullable<LedgerBootstrapResponse["expenseConflictChains"]>[number];
export async function storeExpenseConflictMetadata(
  database: LedgerExpenseDatabase,
  accountId: string,
  journeyId: string,
  metadata: Metadata,
) {
  const expense = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM ledger_expenses WHERE journey_id = ? AND (id = ? OR server_id = ?)
     AND (local_owner_user_id IS NULL OR local_owner_user_id = ?) ORDER BY server_id IS NOT NULL DESC LIMIT 1`,
    journeyId,
    metadata.expenseId,
    metadata.expenseId,
    accountId,
  );
  const id = expense?.id ?? metadata.expenseId;
  await database.runAsync(
    `INSERT INTO ledger_expense_conflict_chains(account_id,expense_id,journey_id,metadata_json)
    VALUES(?,?,?,?) ON CONFLICT(account_id,expense_id) DO UPDATE SET metadata_json=excluded.metadata_json,
    chain_json=CASE WHEN json_extract(metadata_json,'$.chainDigest')=json_extract(excluded.metadata_json,'$.chainDigest') THEN chain_json ELSE NULL END`,
    accountId,
    id,
    journeyId,
    JSON.stringify(metadata),
  );
  // Metadata proves OPEN membership; closed lifecycle requires the full server outcome.
  for (const conflictId of metadata.openConflictIds)
    await database.runAsync(
      `INSERT OR IGNORE INTO ledger_expense_conflicts(conflict_id,journey_id,expense_id,operation_id,base_revision,current_revision,base_snapshot_json,submitted_snapshot_json,canonical_snapshot_json,changed_groups_json,audit_summaries_json,status,created_at)
      VALUES(?,?,?,'',0,0,'{}','{}','{}','[]','[]','OPEN',?)`,
      conflictId,
      journeyId,
      id,
      new Date().toISOString(),
    );
}
