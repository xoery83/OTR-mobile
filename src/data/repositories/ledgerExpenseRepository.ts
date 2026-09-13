import type * as SQLite from "expo-sqlite";

import type { LedgerExpenseDto } from "@/data/api/ledgerReadContracts";
import { createLocalId } from "@/domain/localId";
import { allocateSettlementFromOriginal } from "@/domain/ledger/allocation";
import { assertMoney } from "@/domain/ledger/money";
import { previewValuation } from "@/domain/ledger/valuation";
import { assertValidExpenseAggregate } from "@/domain/ledger/validation";
import type {
  ExpenseAggregate,
  ExpenseBusinessStatus,
  ExpenseParticipant,
  ExpenseSplit,
  Money,
  PaymentRecord,
  RateQuote,
  SettlementValuationSnapshot,
  ValuationPolicy,
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
  cacheRateQuote(quote: RateQuote): Promise<void>;
  listRateQuotes(
    journeyId: string,
    quoteCurrency: string,
    baseCurrency: string,
  ): Promise<RateQuote[]>;
  addPaymentRecord(
    expenseId: string,
    input: Omit<PaymentRecord, "id" | "expenseRevision" | "payerMemberId">,
  ): Promise<PaymentRecord>;
  markPaymentRecordSynced(id: string, serverId: string): Promise<void>;
  getPaymentRecordServerId(id: string): Promise<string | null>;
  markValuationSynced(
    localValuationId: string,
    serverValuationId: string,
    localRateSnapshotId: string | null,
    serverRateSnapshotId: string | null,
  ): Promise<void>;
  applyValuation(
    expenseId: string,
    input: {
      policy: Exclude<ValuationPolicy, "LEGACY_IMPORTED">;
      rateQuoteId?: string;
      paymentRecordId?: string;
      manualRate?: string;
      reason?: string;
    },
  ): Promise<LedgerExpense>;
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
  decimalRate?: string | null;
  roundingMode?: "HALF_UP";
  effectiveAt?: string | null;
  supersedesValuationId?: string | null;
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
  expenseRevision?: number | null;
  payerMemberId?: string | null;
  authorizedAt?: string | null;
  bankFxRate?: string | null;
  source?: string | null;
  notes?: string | null;
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

    async cacheRateQuote(quote) {
      await database.runAsync(
        `INSERT OR REPLACE INTO ledger_rate_quotes (
          id, journey_id, quote_currency, base_currency, decimal_rate,
          effective_date, observed_at, provider, provider_reference, expires_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        quote.id,
        quote.journeyId,
        quote.quoteCurrency,
        quote.baseCurrency,
        quote.decimalRate,
        quote.effectiveDate,
        quote.observedAt,
        quote.provider,
        quote.providerReference,
        quote.expiresAt,
        new Date().toISOString(),
      );
    },

    async listRateQuotes(journeyId, quoteCurrency, baseCurrency) {
      return database.getAllAsync<RateQuote>(
        `SELECT id, journey_id AS journeyId, quote_currency AS quoteCurrency,
          base_currency AS baseCurrency, decimal_rate AS decimalRate,
          effective_date AS effectiveDate, observed_at AS observedAt, provider,
          provider_reference AS providerReference, expires_at AS expiresAt
         FROM ledger_rate_quotes
         WHERE journey_id = ? AND quote_currency = ? AND base_currency = ?
         ORDER BY observed_at DESC`,
        journeyId,
        quoteCurrency,
        baseCurrency,
      );
    },

    async addPaymentRecord(expenseId, input) {
      const expense = await requireExpense(database, expenseId);
      if (!input.authorization && !input.posted) {
        throw new Error("Payment evidence needs an authorization or posted cost.");
      }
      for (const [label, money] of [
        ["Authorization", input.authorization],
        ["Posted cost", input.posted],
        ["Fee", input.fee],
      ] as const) {
        if (money) assertMoney(money, label);
      }
      if (input.supersedesPaymentRecordId) {
        const superseded = await database.getFirstAsync<{ id: string }>(
          `SELECT p.id FROM ledger_payment_records p
           WHERE p.id = ? AND p.expense_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM ledger_payment_records next
               WHERE next.supersedes_payment_record_id = p.id
             )`,
          input.supersedesPaymentRecordId,
          expenseId,
        );
        if (!superseded) throw new Error("Superseded payment evidence was not found.");
      }
      const now = new Date().toISOString();
      const payment: PaymentRecord = {
        ...input,
        id: createLocalId("ledger-payment"),
        expenseRevision: expense.revision,
        payerMemberId: expense.payerMemberId,
      };
      await database.withTransactionAsync(async () => {
        await insertPaymentRecord(database, expense, payment, now, "PENDING_CREATE");
        await insertAuditEvent(
          database,
          expense.id,
          expense.revision,
          input.supersedesPaymentRecordId
            ? "PAYMENT_RECORD_SUPERSEDED"
            : "PAYMENT_RECORD_ADDED",
          input.notes ?? null,
          now,
        );
        await enqueueEvidenceOperation(
          database,
          expense,
          payment.id,
          "LEDGER_ADD_PAYMENT_RECORD",
          payment,
        );
      });
      return payment;
    },

    async markPaymentRecordSynced(id, serverId) {
      await database.runAsync(
        `UPDATE ledger_payment_records
         SET server_id = ?, sync_status = 'SYNCED', last_synced_at = ? WHERE id = ?`,
        serverId,
        new Date().toISOString(),
        id,
      );
    },

    async getPaymentRecordServerId(id) {
      const row = await database.getFirstAsync<{ serverId: string | null }>(
        "SELECT server_id AS serverId FROM ledger_payment_records WHERE id = ?",
        id,
      );
      return row?.serverId ?? null;
    },

    async markValuationSynced(
      localValuationId,
      serverValuationId,
      localRateSnapshotId,
      serverRateSnapshotId,
    ) {
      await database.runAsync(
        "UPDATE ledger_valuation_snapshots SET server_id = ? WHERE id = ?",
        serverValuationId,
        localValuationId,
      );
      if (localRateSnapshotId && serverRateSnapshotId) {
        await database.runAsync(
          "UPDATE ledger_exchange_rate_snapshots SET server_id = ? WHERE id = ?",
          serverRateSnapshotId,
          localRateSnapshotId,
        );
      }
    },

    async applyValuation(expenseId, input) {
      const current = await requireExpense(database, expenseId);
      if (current.status === "DELETED")
        throw new Error("Deleted expenses cannot be valued.");
      const journey = await database.getFirstAsync<{
        settlementCurrency: string;
        settlementScale: number;
      }>(
        `SELECT settlement_currency AS settlementCurrency,
          settlement_scale AS settlementScale FROM ledger_journeys WHERE journey_id = ?`,
        current.journeyId,
      );
      if (!journey) throw new Error("Journey valuation settings were not found.");
      const rateQuote = input.rateQuoteId
        ? await database.getFirstAsync<RateQuote>(
            `SELECT id, journey_id AS journeyId, quote_currency AS quoteCurrency,
              base_currency AS baseCurrency, decimal_rate AS decimalRate,
              effective_date AS effectiveDate, observed_at AS observedAt, provider,
              provider_reference AS providerReference, expires_at AS expiresAt
             FROM ledger_rate_quotes WHERE id = ? AND journey_id = ?`,
            input.rateQuoteId,
            current.journeyId,
          )
        : undefined;
      const paymentRecord = input.paymentRecordId
        ? current.paymentRecords.find((record) => record.id === input.paymentRecordId)
        : undefined;
      if (
        paymentRecord &&
        current.paymentRecords.some(
          (record) => record.supersedesPaymentRecordId === paymentRecord.id,
        )
      ) {
        throw new Error("Superseded payment evidence cannot be applied.");
      }
      const preview = previewValuation({
        ...input,
        original: current.original,
        settlementCurrency: journey.settlementCurrency,
        settlementScale: journey.settlementScale,
        rateQuote: rateQuote ?? undefined,
        paymentRecord,
      });
      const now = new Date().toISOString();
      const revision = current.revision + 1;
      const active = current.valuation;
      const rateSnapshotId =
        input.policy === "ACTUAL_PAYER_COST" ? null : createLocalId("ledger-rate");
      const valuation: SettlementValuationSnapshot = {
        id: createLocalId("ledger-valuation"),
        policy: input.policy,
        original: current.original,
        settlement: preview.settlement,
        rateSnapshotId,
        paymentRecordId: preview.paymentRecordId,
        reason: preview.reason,
        decimalRate: preview.decimalRate,
        roundingMode: "HALF_UP",
        effectiveAt: now,
        supersedesValuationId: active?.id ?? null,
      };
      const next: LedgerExpense = {
        ...current,
        revision,
        status: "ACCEPTED",
        splits: allocateSettlementFromOriginal(preview.settlement.minor, current.splits),
        valuation,
        syncStatus: "PENDING_UPDATE",
        updatedAt: now,
      };
      assertCommand(next);
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE ledger_expenses SET business_status = 'ACCEPTED', revision = ?,
            sync_status = 'PENDING_UPDATE', updated_at = ? WHERE id = ?`,
          revision,
          now,
          current.id,
        );
        for (const split of next.splits) {
          await database.runAsync(
            `UPDATE ledger_expense_splits SET settlement_amount_minor = ?
             WHERE expense_id = ? AND member_id = ?`,
            split.settlementMinor,
            current.id,
            split.memberId,
          );
        }
        await database.runAsync(
          "UPDATE ledger_valuation_snapshots SET is_active = 0 WHERE expense_id = ? AND is_active = 1",
          current.id,
        );
        if (rateSnapshotId) {
          await insertRateSnapshot(
            database,
            current,
            revision,
            rateSnapshotId,
            preview.decimalRate!,
            preview.settlement.currency,
            rateQuote ?? null,
            input.reason ?? null,
            active?.rateSnapshotId ?? null,
            now,
          );
        }
        await insertValuation(database, current.id, revision, valuation, now);
        await insertAuditEvent(
          database,
          current.id,
          revision,
          "VALUATION_APPLIED",
          preview.reason,
          now,
          next,
        );
        await enqueueEvidenceOperation(
          database,
          current,
          current.id,
          "LEDGER_APPLY_VALUATION",
          {
            localValuationId: valuation.id,
            localRateSnapshotId: rateSnapshotId,
            baseRevision: current.serverRevision,
            policy: input.policy,
            rateQuoteId: input.rateQuoteId ?? null,
            paymentRecordId: input.paymentRecordId ?? null,
            manualRate: input.manualRate ?? null,
            reason: preview.reason,
            previewSettlement: preview.settlement,
            baseExpense: toOperationSnapshot(current),
          },
          "ledger_expense",
          current.serverRevision,
        );
      });
      return next;
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
    paymentRecords: [],
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
  assertValidExpenseAggregate(
    expense,
    new Set(
      expense.participants.map((item) => item.memberId).concat(expense.payerMemberId),
    ),
  );
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
    "UPDATE ledger_valuation_snapshots SET is_active = 0 WHERE expense_id = ?",
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
    const existingValuation = await database.getFirstAsync<{ id: string }>(
      "SELECT id FROM ledger_valuation_snapshots WHERE id = ? OR server_id = ?",
      expense.valuation.id,
      expense.valuation.id,
    );
    await database.runAsync(
      `INSERT OR REPLACE INTO ledger_valuation_snapshots (
        id, server_id, expense_id, expense_revision, policy, original_amount_minor, original_currency,
        original_scale, settlement_amount_minor, settlement_currency, settlement_scale,
        rate_snapshot_id, payment_record_id, reason, is_active, created_at, decimal_rate,
        rounding_mode, effective_at, supersedes_valuation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      existingValuation?.id ?? expense.valuation.id,
      expense.serverId ? expense.valuation.id : null,
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
      expense.valuation.decimalRate ?? null,
      expense.valuation.roundingMode ?? "HALF_UP",
      expense.valuation.effectiveAt ?? expense.updatedAt,
      expense.valuation.supersedesValuationId ?? null,
    );
    await database.runAsync(
      "UPDATE ledger_valuation_snapshots SET is_active = 1 WHERE id = ?",
      existingValuation?.id ?? expense.valuation.id,
    );
  }
  for (const payment of expense.paymentRecords) {
    await insertPaymentRecord(database, expense, payment, expense.updatedAt, "SYNCED");
  }
}

async function insertPaymentRecord(
  database: LedgerExpenseDatabase,
  expense: Pick<LedgerExpense, "id" | "revision" | "payerMemberId">,
  payment: PaymentRecord,
  createdAt: string,
  syncStatus: "PENDING_CREATE" | "SYNCED",
) {
  const existing = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM ledger_payment_records WHERE id = ? OR server_id = ?",
    payment.id,
    payment.id,
  );
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_payment_records (
      id, server_id, expense_id, expense_revision, payer_member_id, instrument_label,
      authorization_amount_minor, authorization_currency, authorization_scale,
      posted_amount_minor, posted_currency, posted_scale, authorized_at, posted_at,
      fee_amount_minor, fee_currency, fee_scale, bank_fx_rate, source, notes,
      supersedes_payment_record_id, revision, sync_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    existing?.id ?? payment.id,
    syncStatus === "SYNCED" ? payment.id : null,
    expense.id,
    payment.expenseRevision ?? expense.revision,
    payment.payerMemberId ?? expense.payerMemberId,
    payment.instrumentLabel,
    payment.authorization?.minor ?? null,
    payment.authorization?.currency ?? null,
    payment.authorization?.scale ?? null,
    payment.posted?.minor ?? null,
    payment.posted?.currency ?? null,
    payment.posted?.scale ?? null,
    payment.authorizedAt ?? null,
    payment.postedAt,
    payment.fee?.minor ?? null,
    payment.fee?.currency ?? null,
    payment.fee?.scale ?? null,
    payment.bankFxRate ?? null,
    payment.source ?? null,
    payment.notes ?? null,
    payment.supersedesPaymentRecordId,
    1,
    syncStatus,
    createdAt,
  );
}

async function insertValuation(
  database: LedgerExpenseDatabase,
  expenseId: string,
  revision: number,
  valuation: SettlementValuationSnapshot,
  createdAt: string,
) {
  await database.runAsync(
    `INSERT INTO ledger_valuation_snapshots (
      id, server_id, expense_id, expense_revision, policy, original_amount_minor, original_currency,
      original_scale, settlement_amount_minor, settlement_currency, settlement_scale,
      rate_snapshot_id, payment_record_id, reason, is_active, created_at, decimal_rate,
      rounding_mode, effective_at, supersedes_valuation_id
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    valuation.id,
    expenseId,
    revision,
    valuation.policy,
    valuation.original.minor,
    valuation.original.currency,
    valuation.original.scale,
    valuation.settlement.minor,
    valuation.settlement.currency,
    valuation.settlement.scale,
    valuation.rateSnapshotId,
    valuation.paymentRecordId,
    valuation.reason,
    createdAt,
    valuation.decimalRate ?? null,
    valuation.roundingMode ?? "HALF_UP",
    valuation.effectiveAt ?? createdAt,
    valuation.supersedesValuationId ?? null,
  );
}

async function insertRateSnapshot(
  database: LedgerExpenseDatabase,
  expense: Pick<LedgerExpense, "id" | "original">,
  revision: number,
  id: string,
  decimalRate: string,
  baseCurrency: string,
  quote: RateQuote | null,
  manualReason: string | null,
  supersedesRateSnapshotId: string | null,
  createdAt: string,
) {
  await database.runAsync(
    `INSERT INTO ledger_exchange_rate_snapshots (
      id, server_id, expense_id, expense_revision, quote_currency, base_currency, decimal_rate,
      effective_date, observed_at, provider, provider_reference, manual_reason,
      staleness_state, supersedes_rate_snapshot_id, created_at
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    expense.id,
    revision,
    expense.original.currency,
    quote?.baseCurrency ?? baseCurrency,
    decimalRate,
    quote?.effectiveDate ?? createdAt.slice(0, 10),
    quote?.observedAt ?? createdAt,
    quote?.provider ?? (manualReason ? "manual" : "same_currency"),
    quote?.providerReference ?? null,
    manualReason,
    quote && Date.parse(quote.expiresAt) < Date.parse(createdAt)
      ? "STALE_ACCEPTED"
      : "FRESH",
    supersedesRateSnapshotId,
    createdAt,
  );
}

async function enqueueEvidenceOperation(
  database: LedgerExpenseDatabase,
  expense: Pick<LedgerExpense, "id" | "journeyId">,
  entityId: string,
  operationType: string,
  payload: unknown,
  entityType = "ledger_payment_record",
  baseVersion: number | null = null,
) {
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO sync_operations (
      id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
      base_version, payload_json, status, attempt_count, next_attempt_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, NULL, ?, ?)`,
    createLocalId("ledger-operation"),
    expense.journeyId,
    entityType,
    entityId,
    operationType,
    createLocalId("ledger-idempotency"),
    baseVersion,
    JSON.stringify({ expenseId: expense.id, ...((payload as object) ?? {}) }),
    now,
    now,
  );
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
        rate_snapshot_id AS rateSnapshotId, payment_record_id AS paymentRecordId, reason,
        decimal_rate AS decimalRate, rounding_mode AS roundingMode,
        effective_at AS effectiveAt, supersedes_valuation_id AS supersedesValuationId
       FROM ledger_valuation_snapshots WHERE expense_id = ? AND is_active = 1`,
      row.id,
    ),
    database.getAllAsync<PaymentRecordRow>(
      `SELECT id, instrument_label AS instrumentLabel,
        authorization_amount_minor AS authorizationMinor,
        authorization_currency AS authorizationCurrency,
        authorization_scale AS authorizationScale,
        posted_amount_minor AS postedMinor, posted_currency AS postedCurrency,
        posted_scale AS postedScale, authorized_at AS authorizedAt, posted_at AS postedAt,
        fee_amount_minor AS feeMinor, fee_currency AS feeCurrency, fee_scale AS feeScale,
        expense_revision AS expenseRevision, payer_member_id AS payerMemberId,
        bank_fx_rate AS bankFxRate, source, notes,
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
    decimalRate: value.decimalRate ?? null,
    roundingMode: value.roundingMode ?? "HALF_UP",
    effectiveAt: value.effectiveAt ?? undefined,
    supersedesValuationId: value.supersedesValuationId ?? null,
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
    authorizedAt: value.authorizedAt ?? null,
    fee: toNullableMoney(value.feeMinor, value.feeCurrency, value.feeScale),
    expenseRevision: value.expenseRevision ?? undefined,
    payerMemberId: value.payerMemberId ?? undefined,
    bankFxRate: value.bankFxRate ?? null,
    source: value.source ?? null,
    notes: value.notes ?? null,
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
