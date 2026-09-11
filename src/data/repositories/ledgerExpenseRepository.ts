import type * as SQLite from "expo-sqlite";

import type { LedgerExpenseDto } from "@/data/api/ledgerReadContracts";
import { createLocalId } from "@/domain/localId";
import { validateExpenseAggregate } from "@/domain/ledger/validation";
import type {
  ExpenseAggregate,
  ExpenseBusinessStatus,
  ExpenseParticipant,
  ExpenseSplit,
  Money,
  PaymentRecord,
  SettlementValuationSnapshot,
} from "@/domain/ledger/types";
import type { SyncStatus } from "@/domain/sync/syncStatus";

export type LedgerExpenseDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export type LedgerExpenseCommand = {
  journeyId: string;
  creatorMemberId: string | null;
  payerMemberId: string;
  title: string;
  description?: string | null;
  category: string;
  occurredAt: string;
  original: Money;
  participants: ExpenseParticipant[];
  splits: ExpenseSplit[];
  valuation: SettlementValuationSnapshot | null;
  paymentRecords?: PaymentRecord[];
  status: Exclude<ExpenseBusinessStatus, "DELETED">;
};

export type LedgerExpense = ExpenseAggregate & {
  serverId: string | null;
  serverRevision: number;
  creatorMemberId: string | null;
  description: string | null;
  occurredAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
};

export type LedgerExpenseRepository = {
  createExpense(command: LedgerExpenseCommand): Promise<LedgerExpense>;
  updateExpense(
    id: string,
    command: LedgerExpenseCommand,
    reason: string,
  ): Promise<LedgerExpense>;
  listExpensesForJourney(
    journeyId: string,
    includeDeleted?: boolean,
  ): Promise<LedgerExpense[]>;
  getExpense(id: string): Promise<LedgerExpense | null>;
  tombstoneExpense(id: string, reason: string): Promise<void>;
  restoreExpense(
    id: string,
    status: Exclude<ExpenseBusinessStatus, "DELETED">,
    reason: string,
  ): Promise<void>;
  markExpenseSyncing(id: string): Promise<void>;
  markExpenseSynced(id: string, serverId: string, serverRevision: number): Promise<void>;
  reconcileCanonicalExpense(id: string, expense: LedgerExpenseDto): Promise<void>;
  markExpenseConflict(id: string): Promise<void>;
  markExpenseFailed(id: string): Promise<void>;
};

type LedgerExpenseRow = {
  id: string;
  serverId: string | null;
  journeyId: string;
  creatorMemberId: string | null;
  payerMemberId: string;
  title: string;
  description: string | null;
  category: string;
  occurredAt: string;
  originalAmountMinor: number;
  originalCurrency: string;
  originalScale: number;
  businessStatus: ExpenseBusinessStatus;
  revision: number;
  serverRevision: number;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
};

type ValuationRow = {
  id: string;
  policy: SettlementValuationSnapshot["policy"];
  originalMinor: number;
  originalCurrency: string;
  originalScale: number;
  settlementMinor: number;
  settlementCurrency: string;
  settlementScale: number;
  rateSnapshotId: string | null;
  paymentRecordId: string | null;
  reason: string | null;
};

type PaymentRecordRow = {
  id: string;
  instrumentLabel: string | null;
  authorizationMinor: number | null;
  authorizationCurrency: string | null;
  authorizationScale: number | null;
  postedMinor: number | null;
  postedCurrency: string | null;
  postedScale: number | null;
  postedAt: string | null;
  feeMinor: number | null;
  feeCurrency: string | null;
  feeScale: number | null;
  supersedesPaymentRecordId: string | null;
};

const createOperation = "LEDGER_CREATE_EXPENSE";
const updateOperation = "LEDGER_UPDATE_EXPENSE";
const deleteOperation = "LEDGER_DELETE_EXPENSE";
const restoreOperation = "LEDGER_RESTORE_EXPENSE";

export function createLedgerExpenseRepository(
  database: LedgerExpenseDatabase,
): LedgerExpenseRepository {
  return {
    async createExpense(command) {
      const now = new Date().toISOString();
      const expense = buildLocalExpense(command, createLocalId("ledger-expense"), 1, now);
      assertCommand(expense);
      await database.withTransactionAsync(async () => {
        await insertExpenseAggregate(database, expense, "CREATED", null);
        await enqueueOperation(database, expense, createOperation, null, null, expense);
      });
      return expense;
    },

    async updateExpense(id, command, reason) {
      const current = await requireExpense(database, id);
      if (current.status === "DELETED") {
        throw new Error("A deleted expense must be restored before it can be edited.");
      }
      const now = new Date().toISOString();
      const expense = buildLocalExpense(command, id, current.revision + 1, now, {
        serverId: current.serverId,
        serverRevision: current.serverRevision,
        createdAt: current.createdAt,
        syncStatus: "PENDING_UPDATE",
      });
      assertCommand(expense);
      await database.withTransactionAsync(async () => {
        await replaceExpenseAggregate(database, expense, "UPDATED", reason);
        await enqueueOperation(
          database,
          expense,
          updateOperation,
          current.serverRevision,
          reason,
          expense,
          current,
        );
      });
      return expense;
    },

    async listExpensesForJourney(journeyId, includeDeleted = false) {
      if (!journeyId.trim()) throw new Error("A Ledger query needs a Journey.");
      const rows = await database.getAllAsync<LedgerExpenseRow>(
        `SELECT
          id, server_id AS serverId, journey_id AS journeyId,
          creator_member_id AS creatorMemberId, payer_member_id AS payerMemberId,
          title, description, category, occurred_at AS occurredAt,
          original_amount_minor AS originalAmountMinor,
          original_currency AS originalCurrency, original_scale AS originalScale,
          business_status AS businessStatus, revision,
          server_revision AS serverRevision, deleted_at AS deletedAt,
          sync_status AS syncStatus, created_at AS createdAt, updated_at AS updatedAt
        FROM ledger_expenses
        WHERE journey_id = ? AND (? = 1 OR deleted_at IS NULL)
        ORDER BY occurred_at DESC, created_at DESC`,
        journeyId,
        includeDeleted ? 1 : 0,
      );
      return Promise.all(rows.map((row) => hydrateExpense(database, row)));
    },

    async getExpense(id) {
      const row = await database.getFirstAsync<LedgerExpenseRow>(
        `SELECT
          id, server_id AS serverId, journey_id AS journeyId,
          creator_member_id AS creatorMemberId, payer_member_id AS payerMemberId,
          title, description, category, occurred_at AS occurredAt,
          original_amount_minor AS originalAmountMinor,
          original_currency AS originalCurrency, original_scale AS originalScale,
          business_status AS businessStatus, revision,
          server_revision AS serverRevision, deleted_at AS deletedAt,
          sync_status AS syncStatus, created_at AS createdAt, updated_at AS updatedAt
        FROM ledger_expenses WHERE id = ?`,
        id,
      );
      return row ? hydrateExpense(database, row) : null;
    },

    async tombstoneExpense(id, reason) {
      const current = await requireExpense(database, id);
      if (current.status === "DELETED") return;
      const now = new Date().toISOString();
      const nextRevision = current.revision + 1;
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE ledger_expenses
           SET business_status = ?, deleted_at = ?, revision = ?, sync_status = ?, updated_at = ?
           WHERE id = ?`,
          "DELETED",
          now,
          nextRevision,
          "PENDING_DELETE",
          now,
          id,
        );
        await insertAuditEvent(database, id, nextRevision, "TOMBSTONED", reason, now);
        await enqueueOperation(
          database,
          { ...current, revision: nextRevision },
          deleteOperation,
          current.serverRevision,
          reason,
          undefined,
          current,
        );
      });
    },

    async restoreExpense(id, status, reason) {
      const current = await requireExpense(database, id);
      if (current.status !== "DELETED") return;
      const now = new Date().toISOString();
      const nextRevision = current.revision + 1;
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE ledger_expenses
           SET business_status = ?, deleted_at = NULL, revision = ?, sync_status = ?, updated_at = ?
           WHERE id = ?`,
          status,
          nextRevision,
          "PENDING_UPDATE",
          now,
          id,
        );
        await insertAuditEvent(database, id, nextRevision, "RESTORED", reason, now);
        await enqueueOperation(
          database,
          { ...current, revision: nextRevision },
          restoreOperation,
          current.serverRevision,
          reason,
          undefined,
          current,
        );
      });
    },

    async markExpenseSyncing(id) {
      await setExpenseSyncStatus(database, id, "SYNCING");
    },

    async markExpenseSynced(id, serverId, serverRevision) {
      await database.runAsync(
        `UPDATE ledger_expenses
         SET server_id = ?, server_revision = ?, sync_status = ?, last_synced_at = ?, updated_at = ?
         WHERE id = ?`,
        serverId,
        serverRevision,
        "SYNCED",
        new Date().toISOString(),
        new Date().toISOString(),
        id,
      );
    },

    async reconcileCanonicalExpense(id, canonical) {
      const current = await requireExpense(database, id);
      const expense: LedgerExpense = {
        ...current,
        serverId: canonical.id,
        serverRevision: canonical.revision,
        creatorMemberId: canonical.creatorMemberId,
        payerMemberId: canonical.payerMemberId,
        title: canonical.title,
        description: canonical.description,
        category: canonical.category,
        occurredAt: canonical.occurredAt,
        original: canonical.original,
        participants: canonical.participants,
        splits: canonical.splits,
        valuation: canonical.valuation,
        paymentRecords: canonical.paymentRecords,
        status: canonical.businessStatus,
        revision: canonical.revision,
        deletedAt: canonical.deletedAt,
        syncStatus: "SYNCED",
        updatedAt: canonical.updatedAt,
      };
      await database.withTransactionAsync(async () => {
        await replaceExpenseData(database, expense);
        await database.runAsync(
          "DELETE FROM ledger_expense_audit_events WHERE expense_id = ?",
          id,
        );
        for (const event of canonical.auditEvents) {
          await database.runAsync(
            `INSERT INTO ledger_expense_audit_events (
              id, server_id, expense_id, expense_revision, event_type, reason,
              after_json, actor_user_id, actor_member_id, changed_groups_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            event.id,
            event.id,
            id,
            event.revision,
            event.eventType,
            event.reason,
            JSON.stringify({ id, revision: event.revision }),
            event.actorUserId,
            event.actorMemberId,
            JSON.stringify(event.changedGroups),
            event.createdAt,
          );
        }
      });
    },

    async markExpenseFailed(id) {
      await setExpenseSyncStatus(database, id, "FAILED");
    },

    async markExpenseConflict(id) {
      await setExpenseSyncStatus(database, id, "CONFLICT");
    },
  };
}

function buildLocalExpense(
  command: LedgerExpenseCommand,
  id: string,
  revision: number,
  now: string,
  persisted: Partial<
    Pick<LedgerExpense, "serverId" | "serverRevision" | "createdAt" | "syncStatus">
  > = {},
): LedgerExpense {
  return {
    id,
    serverId: persisted.serverId ?? null,
    serverRevision: persisted.serverRevision ?? 0,
    journeyId: command.journeyId,
    creatorMemberId: command.creatorMemberId,
    payerMemberId: command.payerMemberId,
    title: command.title.trim(),
    description: command.description?.trim() || null,
    category: command.category,
    occurredAt: command.occurredAt,
    original: command.original,
    participants: command.participants,
    splits: command.splits,
    valuation: command.valuation,
    paymentRecords: command.paymentRecords ?? [],
    status: command.status,
    revision,
    deletedAt: null,
    syncStatus:
      persisted.syncStatus ?? (persisted.serverId ? "PENDING_UPDATE" : "PENDING_CREATE"),
    createdAt: persisted.createdAt ?? now,
    updatedAt: now,
  };
}

function assertCommand(expense: LedgerExpense) {
  if (!expense.journeyId.trim()) throw new Error("A Ledger expense needs a Journey.");
  if (!expense.title) throw new Error("A Ledger expense needs a title.");
  const issues = validateExpenseAggregate(
    expense,
    new Set(
      expense.participants.map((item) => item.memberId).concat(expense.payerMemberId),
    ),
  );
  if (issues.length > 0) {
    throw new Error(
      `Invalid Ledger expense: ${issues.map((issue) => issue.code).join(", ")}`,
    );
  }
}

async function insertExpenseAggregate(
  database: LedgerExpenseDatabase,
  expense: LedgerExpense,
  eventType: string,
  reason: string | null,
) {
  await database.runAsync(
    `INSERT INTO ledger_expenses (
      id, server_id, journey_id, creator_member_id, payer_member_id, title, description,
      category, occurred_at, original_amount_minor, original_currency, original_scale,
      business_status, revision, server_revision, deleted_at, sync_status, last_synced_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    expense.id,
    expense.serverId,
    expense.journeyId,
    expense.creatorMemberId,
    expense.payerMemberId,
    expense.title,
    expense.description,
    expense.category,
    expense.occurredAt,
    expense.original.minor,
    expense.original.currency,
    expense.original.scale,
    expense.status,
    expense.revision,
    expense.serverRevision,
    expense.deletedAt,
    expense.syncStatus,
    null,
    expense.createdAt,
    expense.updatedAt,
  );
  await insertExpenseChildren(database, expense);
  await insertAuditEvent(
    database,
    expense.id,
    expense.revision,
    eventType,
    reason,
    expense.updatedAt,
    expense,
  );
}

async function replaceExpenseAggregate(
  database: LedgerExpenseDatabase,
  expense: LedgerExpense,
  eventType: string,
  reason: string,
) {
  await replaceExpenseData(database, expense);
  await insertAuditEvent(
    database,
    expense.id,
    expense.revision,
    eventType,
    reason,
    expense.updatedAt,
    expense,
  );
}

async function replaceExpenseData(
  database: LedgerExpenseDatabase,
  expense: LedgerExpense,
) {
  await database.runAsync(
    `UPDATE ledger_expenses SET
      journey_id = ?, creator_member_id = ?, payer_member_id = ?, title = ?, description = ?,
      category = ?, occurred_at = ?, original_amount_minor = ?, original_currency = ?,
      original_scale = ?, business_status = ?, revision = ?, server_id = ?,
      server_revision = ?, deleted_at = ?, sync_status = ?, last_synced_at = ?, updated_at = ?
     WHERE id = ?`,
    expense.journeyId,
    expense.creatorMemberId,
    expense.payerMemberId,
    expense.title,
    expense.description,
    expense.category,
    expense.occurredAt,
    expense.original.minor,
    expense.original.currency,
    expense.original.scale,
    expense.status,
    expense.revision,
    expense.serverId,
    expense.serverRevision,
    expense.deletedAt,
    expense.syncStatus,
    expense.syncStatus === "SYNCED" ? new Date().toISOString() : null,
    expense.updatedAt,
    expense.id,
  );
  await database.runAsync(
    "DELETE FROM ledger_expense_participants WHERE expense_id = ?",
    expense.id,
  );
  await database.runAsync(
    "DELETE FROM ledger_expense_splits WHERE expense_id = ?",
    expense.id,
  );
  await database.runAsync(
    "DELETE FROM ledger_valuation_snapshots WHERE expense_id = ?",
    expense.id,
  );
  await database.runAsync(
    "DELETE FROM ledger_payment_records WHERE expense_id = ?",
    expense.id,
  );
  await insertExpenseChildren(database, expense);
}

async function insertExpenseChildren(
  database: LedgerExpenseDatabase,
  expense: LedgerExpense,
) {
  for (const [index, participant] of expense.participants.entries()) {
    await database.runAsync(
      `INSERT INTO ledger_expense_participants (
        expense_id, member_id, display_name_snapshot, household_id_snapshot, display_order
      ) VALUES (?, ?, ?, ?, ?)`,
      expense.id,
      participant.memberId,
      participant.displayNameSnapshot,
      participant.householdIdSnapshot,
      index,
    );
  }
  for (const split of expense.splits) {
    await database.runAsync(
      `INSERT INTO ledger_expense_splits (
        expense_id, member_id, split_method, original_amount_minor,
        settlement_amount_minor, weight_units, percentage_units, rounding_adjustment_minor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      expense.id,
      split.memberId,
      split.method,
      split.originalMinor,
      split.settlementMinor,
      split.weightUnits,
      split.percentageUnits,
      split.roundingAdjustmentMinor,
    );
  }
  if (expense.valuation) {
    await database.runAsync(
      `INSERT INTO ledger_valuation_snapshots (
        id, expense_id, expense_revision, policy, original_amount_minor, original_currency,
        original_scale, settlement_amount_minor, settlement_currency, settlement_scale,
        rate_snapshot_id, payment_record_id, reason, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      expense.valuation.id,
      expense.id,
      expense.revision,
      expense.valuation.policy,
      expense.valuation.original.minor,
      expense.valuation.original.currency,
      expense.valuation.original.scale,
      expense.valuation.settlement.minor,
      expense.valuation.settlement.currency,
      expense.valuation.settlement.scale,
      expense.valuation.rateSnapshotId,
      expense.valuation.paymentRecordId,
      expense.valuation.reason,
      1,
      expense.updatedAt,
    );
  }
  for (const payment of expense.paymentRecords) {
    await database.runAsync(
      `INSERT INTO ledger_payment_records (
        id, expense_id, instrument_label, authorization_amount_minor,
        authorization_currency, authorization_scale, posted_amount_minor,
        posted_currency, posted_scale, posted_at, fee_amount_minor, fee_currency,
        fee_scale, supersedes_payment_record_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payment.id,
      expense.id,
      payment.instrumentLabel,
      payment.authorization?.minor ?? null,
      payment.authorization?.currency ?? null,
      payment.authorization?.scale ?? null,
      payment.posted?.minor ?? null,
      payment.posted?.currency ?? null,
      payment.posted?.scale ?? null,
      payment.postedAt,
      payment.fee?.minor ?? null,
      payment.fee?.currency ?? null,
      payment.fee?.scale ?? null,
      payment.supersedesPaymentRecordId,
      expense.updatedAt,
    );
  }
}

async function insertAuditEvent(
  database: LedgerExpenseDatabase,
  expenseId: string,
  revision: number,
  eventType: string,
  reason: string | null,
  timestamp: string,
  expense?: LedgerExpense,
) {
  await database.runAsync(
    `INSERT INTO ledger_expense_audit_events (
      id, expense_id, expense_revision, event_type, reason, after_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    createLocalId("ledger-audit"),
    expenseId,
    revision,
    eventType,
    reason,
    JSON.stringify(expense ?? { id: expenseId, revision }),
    timestamp,
  );
}

async function enqueueOperation(
  database: LedgerExpenseDatabase,
  expense: Pick<LedgerExpense, "id" | "journeyId" | "revision">,
  operationType: string,
  baseVersion: number | null,
  reason: string | null,
  snapshot?: LedgerExpense,
  baseSnapshot?: LedgerExpense,
) {
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO sync_operations (
      id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
      base_version, payload_json, status, attempt_count, next_attempt_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    createLocalId("ledger-operation"),
    expense.journeyId,
    "ledger_expense",
    expense.id,
    operationType,
    createLocalId("ledger-idempotency"),
    baseVersion,
    JSON.stringify({
      expenseId: expense.id,
      revision: expense.revision,
      reason,
      expense: snapshot ? toOperationSnapshot(snapshot) : null,
      baseExpense: baseSnapshot ? toOperationSnapshot(baseSnapshot) : null,
    }),
    "PENDING",
    0,
    null,
    now,
    now,
  );
}

function toOperationSnapshot(expense: LedgerExpense) {
  return {
    title: expense.title,
    description: expense.description,
    category: expense.category,
    occurredAt: expense.occurredAt,
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

async function hydrateExpense(
  database: LedgerExpenseDatabase,
  row: LedgerExpenseRow,
): Promise<LedgerExpense> {
  const [participants, splits, valuation, paymentRecords] = await Promise.all([
    database.getAllAsync<ExpenseParticipant>(
      `SELECT member_id AS memberId, display_name_snapshot AS displayNameSnapshot,
        household_id_snapshot AS householdIdSnapshot
       FROM ledger_expense_participants WHERE expense_id = ? ORDER BY display_order ASC`,
      row.id,
    ),
    database.getAllAsync<ExpenseSplit>(
      `SELECT member_id AS memberId, original_amount_minor AS originalMinor,
        settlement_amount_minor AS settlementMinor, split_method AS method,
        weight_units AS weightUnits, percentage_units AS percentageUnits,
        rounding_adjustment_minor AS roundingAdjustmentMinor
       FROM ledger_expense_splits WHERE expense_id = ? ORDER BY member_id ASC`,
      row.id,
    ),
    database.getFirstAsync<ValuationRow>(
      `SELECT id, policy,
        original_amount_minor AS originalMinor, original_currency AS originalCurrency,
        original_scale AS originalScale, settlement_amount_minor AS settlementMinor,
        settlement_currency AS settlementCurrency, settlement_scale AS settlementScale,
        rate_snapshot_id AS rateSnapshotId, payment_record_id AS paymentRecordId, reason
       FROM ledger_valuation_snapshots WHERE expense_id = ? AND is_active = 1`,
      row.id,
    ),
    database.getAllAsync<PaymentRecordRow>(
      `SELECT id, instrument_label AS instrumentLabel,
        authorization_amount_minor AS authorizationMinor,
        authorization_currency AS authorizationCurrency,
        authorization_scale AS authorizationScale,
        posted_amount_minor AS postedMinor, posted_currency AS postedCurrency,
        posted_scale AS postedScale, posted_at AS postedAt,
        fee_amount_minor AS feeMinor, fee_currency AS feeCurrency, fee_scale AS feeScale,
        supersedes_payment_record_id AS supersedesPaymentRecordId
       FROM ledger_payment_records WHERE expense_id = ? ORDER BY created_at ASC`,
      row.id,
    ),
  ]);
  return {
    id: row.id,
    serverId: row.serverId,
    serverRevision: row.serverRevision,
    journeyId: row.journeyId,
    creatorMemberId: row.creatorMemberId,
    payerMemberId: row.payerMemberId,
    title: row.title,
    description: row.description,
    category: row.category,
    occurredAt: row.occurredAt,
    original: {
      minor: row.originalAmountMinor,
      currency: row.originalCurrency,
      scale: row.originalScale,
    },
    participants,
    splits,
    valuation: valuation ? normalizeValuation(valuation) : null,
    paymentRecords: paymentRecords.map(normalizePaymentRecord),
    status: row.businessStatus,
    revision: row.revision,
    deletedAt: row.deletedAt,
    syncStatus: row.syncStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeValuation(value: ValuationRow): SettlementValuationSnapshot {
  return {
    id: value.id,
    policy: value.policy,
    original: {
      minor: value.originalMinor,
      currency: value.originalCurrency,
      scale: value.originalScale,
    },
    settlement: {
      minor: value.settlementMinor,
      currency: value.settlementCurrency,
      scale: value.settlementScale,
    },
    rateSnapshotId: value.rateSnapshotId,
    paymentRecordId: value.paymentRecordId,
    reason: value.reason,
  };
}

function normalizePaymentRecord(value: PaymentRecordRow): PaymentRecord {
  return {
    id: value.id,
    instrumentLabel: value.instrumentLabel,
    authorization: toNullableMoney(
      value.authorizationMinor,
      value.authorizationCurrency,
      value.authorizationScale,
    ),
    posted: toNullableMoney(value.postedMinor, value.postedCurrency, value.postedScale),
    postedAt: value.postedAt,
    fee: toNullableMoney(value.feeMinor, value.feeCurrency, value.feeScale),
    supersedesPaymentRecordId: value.supersedesPaymentRecordId,
  };
}

function toNullableMoney(
  minor: number | null,
  currency: string | null,
  scale: number | null,
) {
  return minor === null || currency === null || scale === null
    ? null
    : { minor, currency, scale };
}

async function requireExpense(database: LedgerExpenseDatabase, id: string) {
  const repository = createLedgerExpenseRepository(database);
  const expense = await repository.getExpense(id);
  if (!expense) throw new Error("Ledger expense was not found.");
  return expense;
}

async function setExpenseSyncStatus(
  database: LedgerExpenseDatabase,
  id: string,
  syncStatus: SyncStatus,
) {
  await database.runAsync(
    "UPDATE ledger_expenses SET sync_status = ?, updated_at = ? WHERE id = ?",
    syncStatus,
    new Date().toISOString(),
    id,
  );
}
