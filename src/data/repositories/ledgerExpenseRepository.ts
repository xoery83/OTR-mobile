import {
  rateBindingMatches,
  compatibleReferenceValue,
  type DisplayedRateBinding,
} from "@/domain/ledger/rateAcceptance";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  bindExpenseOperation,
  recordExpenseCommand,
  localExpenseIntent,
  storeExpenseCanonical,
  readExpenseCanonical,
  readExpenseCommands,
  storeExpenseReceipt,
  projectExpenseIntent,
  getExpenseOperationResult,
} from "./ledgerExpenseConsistency";
import type {
  ExpenseOperationResult,
  ExpenseOperationReceipt,
  ExpenseConflictChainResolutionResponse,
} from "@/data/api/ledgerMutationContracts";
import {
  expenseConflictChainResolutionResponseSchema,
  expenseConflictChainResolutionRequestSchema,
} from "@/data/api/ledgerMutationContracts";
import type { ExpenseTypedIntent } from "@/domain/ledger/expenseIntent";
import {
  buildExpenseUserPatch,
  isEmptyExpensePatch,
  sameExpenseValue,
  utcInstant,
} from "@/domain/ledger/expenseIntent";
import type * as SQLite from "expo-sqlite";

import {
  economicDateSchema,
  type LedgerExpenseDto,
} from "@/data/api/ledgerReadContracts";
import { createLocalId } from "@/domain/localId";
import { assertExpenseAttachmentDrafts } from "@/domain/ledger/attachments";
import {
  insertExpenseReceiptInTransaction,
  deleteExpenseAttachmentInTransaction,
  createLedgerReceiptRepository,
  type PreparedExpenseReceipt,
} from "./ledgerReceiptRepository";
import { allocateSettlementFromOriginal } from "@/domain/ledger/allocation";
import { assertMoney } from "@/domain/ledger/money";
import { previewValuation } from "@/domain/ledger/valuation";
import { assertValidExpenseAggregate } from "@/domain/ledger/validation";
import type {
  ExpenseAggregate,
  ExpenseBusinessStatus,
  ExpenseParticipant,
  ExpenseSettlementParticipation,
  ExpenseSplit,
  Money,
  PaymentRecord,
  RateQuote,
  SettlementValuationSnapshot,
  ValuationPolicy,
} from "@/domain/ledger/types";
import type { SyncStatus } from "@/domain/sync/syncStatus";

import { assertLedgerExpenseEditable } from "./ledgerExpenseEditAccess";

import { assertReplayFixtureWritable } from "./replayFixtureGuard";
import {
  HISTORICAL_EXPENSE_RECOVERY_ACTION,
  inspectHistoricalExpenseRecovery,
  type HistoricalExpenseRecoveryEvidence,
  type HistoricalExpenseOperation,
} from "@/data/health/historicalExpenseRecovery";

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
  economicDate?: string | null;
  original: Money;
  participants: ExpenseParticipant[];
  splits: ExpenseSplit[];
  valuation: SettlementValuationSnapshot | null;
  status: Exclude<ExpenseBusinessStatus, "DELETED">;
  settlementParticipation?: ExpenseSettlementParticipation;
};

export type LedgerExpense = ExpenseAggregate & {
  serverId: string | null;
  serverRevision: number;
  creatorMemberId: string | null;
  description: string | null;
  occurredAt: string;
  economicDate?: string | null;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  operationResult?: ExpenseOperationResult;
};

export type ExpenseAttachmentEdit = {
  added: readonly PreparedExpenseReceipt[];
  removedIds: readonly string[];
  expectedIds: readonly string[];
  expectedRevision: number;
};

export type LedgerExpenseRepository = {
  createExpense(
    command: LedgerExpenseCommand,
    receipts?: readonly PreparedExpenseReceipt[],
    expenseDraftId?: string,
  ): Promise<LedgerExpense>;
  updateExpense(
    id: string,
    command: LedgerExpenseCommand,
    reason: string,
    attachments?: ExpenseAttachmentEdit,
  ): Promise<LedgerExpense>;
  completeEconomicDate(
    id: string,
    date: string,
    source: "USER_CONFIRMED_V1" | "STAGE9_DATE_ONLY_V1",
  ): Promise<LedgerExpense>;
  listExpensesForJourney(
    journeyId: string,
    includeDeleted?: boolean,
  ): Promise<LedgerExpense[]>;
  getExpense(id: string): Promise<LedgerExpense | null>;
  listPreviousValuations(id: string): Promise<SettlementValuationSnapshot[]>;
  tombstoneExpense(id: string, reason: string): Promise<ExpenseOperationResult>;
  restoreExpense(
    id: string,
    status: Exclude<ExpenseBusinessStatus, "DELETED">,
    reason: string,
  ): Promise<ExpenseOperationResult>;
  markExpenseSyncing(id: string): Promise<void>;
  markExpenseSynced(
    id: string,
    serverId: string,
    serverRevision: number,
    completedOperationId?: string,
  ): Promise<void>;
  markExpensePending?(id: string, operationType: string): Promise<void>;
  reconcileCanonicalExpense(id: string, expense: LedgerExpenseDto): Promise<void>;
  reconcileCanonicalExpenseInTransaction(
    id: string,
    expense: LedgerExpenseDto,
    operationId?: string,
    disposition?: ExpenseOperationReceipt["disposition"],
    receipt?: ExpenseOperationReceipt,
    authoritativeClosure?: boolean,
  ): Promise<void>;
  confirmExpenseOperation(
    operationId: string,
    expense: LedgerExpenseDto,
    disposition?: ExpenseOperationReceipt["disposition"],
    receipt?: ExpenseOperationReceipt,
  ): Promise<void>;
  confirmConflictResolution(
    operationId: string,
    response: ExpenseConflictChainResolutionResponse,
  ): Promise<void>;
  listRateAcceptanceOperations(
    journeyId: string,
  ): Promise<{ title: string; result: ExpenseOperationResult }[]>;
  getOperationResult(operationId: string): Promise<ExpenseOperationResult | null>;
  getLatestOperationResult(expenseId: string): Promise<ExpenseOperationResult | null>;
  bindOperation(
    operation: import("@/data/sync/syncOperationRepository").SyncOperation,
    typed?: boolean,
  ): Promise<import("@/data/sync/syncOperationRepository").SyncOperation>;
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
      expectedRevision?: number;
      expectedSettlement?: Money;
      rateAcceptance?: DisplayedRateBinding;
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
  economicDate?: string | null;
  originalAmountMinor: number;
  originalCurrency: string;
  originalScale: number;
  businessStatus: ExpenseBusinessStatus;
  settlementParticipation: ExpenseSettlementParticipation;
  revision: number;
  serverRevision: number;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
};

type ValuationRow = {
  id: string;
  serverId?: string | null;
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
  referenceEvidenceJson?: string | null;
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
const dateCompletionOperation = "LEDGER_COMPLETE_ECONOMIC_DATE";
const deleteOperation = "LEDGER_DELETE_EXPENSE";
const restoreOperation = "LEDGER_RESTORE_EXPENSE";

export function createLedgerExpenseRepository(
  database: LedgerExpenseDatabase,
  getActiveUserId: () => Promise<string> = defaultGetActiveUserId,
): LedgerExpenseRepository {
  return {
    async createExpense(command, receipts = [], expenseDraftId) {
      assertReplayFixtureWritable(command.journeyId);
      assertExpenseAttachmentDrafts(receipts.map((receipt) => receipt.id));
      const now = new Date().toISOString();
      const userId = await getActiveUserId();
      if (expenseDraftId) {
        const saved = await this.getExpense(expenseDraftId);
        if (saved) {
          if (saved.journeyId !== command.journeyId)
            throw new Error("Expense draft belongs to another Journey.");
          const rows = await database.getAllAsync<{ id: string; sha256: string }>(
            `SELECT id, sha256 FROM ledger_receipt_assets WHERE expense_id = ?`,
            saved.id,
          );
          if (
            rows.length !== receipts.length ||
            receipts.some(
              (receipt) =>
                !rows.some(
                  (row) => row.id === receipt.id && row.sha256 === receipt.sha256,
                ),
            )
          )
            throw new Error("Expense draft attachments changed after Save.");
          return { ...saved, operationResult: noOpExpenseResult(saved.id, "CREATE") };
        }
      }
      for (const receipt of receipts) {
        const existing = await database.getFirstAsync<{
          expenseId: string;
          journeyId: string;
          sha256: string;
          localOwnerUserId: string | null;
        }>(
          `SELECT expense_id AS expenseId, journey_id AS journeyId, sha256,
           local_owner_user_id AS localOwnerUserId FROM ledger_receipt_assets
           WHERE id = ? AND EXISTS (
             SELECT 1 FROM ledger_asset_operations op WHERE op.asset_id = ledger_receipt_assets.id
               AND op.operation_type = 'UPLOAD_RECEIPT' AND op.owner_user_id = ?
           )`,
          receipt.id,
          userId,
        );
        if (existing) {
          if (
            existing.journeyId !== command.journeyId ||
            existing.sha256 !== receipt.sha256 ||
            (existing.localOwnerUserId && existing.localOwnerUserId !== userId)
          )
            throw new Error("Receipt draft was already used by another Expense.");
          if (expenseDraftId && existing.expenseId !== expenseDraftId)
            throw new Error("Receipt draft was already used by another Expense.");
          if (!expenseDraftId && receipts.length === 1)
            return {
              ...(await requireExpense(database, existing.expenseId, userId)),
              operationResult: noOpExpenseResult(existing.expenseId, "CREATE"),
            };
          throw new Error("Receipt draft was already used by another Expense.");
        }
      }
      const expense = buildLocalExpense(
        command,
        expenseDraftId ?? createLocalId("ledger-expense"),
        1,
        now,
      );
      assertCommand(expense);
      let savedOperationId: string | null = null;
      await database.withTransactionAsync(async () => {
        await insertExpenseAggregate(database, expense, "CREATED", null, userId);
        savedOperationId = await enqueueOperation(
          database,
          expense,
          createOperation,
          null,
          null,
          userId,
          expense,
        );
        for (const receipt of receipts)
          await insertExpenseReceiptInTransaction(
            database,
            receipt,
            expense.id,
            command.journeyId,
            userId,
            now,
          );
      });
      return {
        ...expense,
        operationResult:
          (savedOperationId ? await this.getOperationResult(savedOperationId) : null) ??
          undefined,
      };
    },

    async updateExpense(id, command, reason, attachments) {
      const userId = await getActiveUserId();
      const current = await requireExpense(database, id, userId);
      assertReplayFixtureWritable(current.journeyId);
      if (current.status === "DELETED") {
        throw new Error("A deleted expense must be restored before it can be edited.");
      }
      if (
        current.valuation &&
        command.valuation?.id === current.valuation.id &&
        ((command.economicDate ?? null) !== (current.economicDate ?? null) ||
          utcInstant(command.occurredAt).slice(0, 10) !==
            utcInstant(current.occurredAt).slice(0, 10) ||
          command.original.minor !== current.original.minor ||
          command.original.currency !== current.original.currency ||
          command.original.scale !== current.original.scale)
      ) {
        throw new Error(
          "Changed original Money or date cannot retain its old valuation.",
        );
      }
      const now = new Date().toISOString();
      const expense = buildLocalExpense(
        {
          ...command,
          settlementParticipation:
            command.settlementParticipation ?? current.settlementParticipation,
        },
        id,
        current.revision + 1,
        now,
        {
          serverId: current.serverId,
          serverRevision: current.serverRevision,
          createdAt: current.createdAt,
          syncStatus: "PENDING_UPDATE",
        },
      );
      assertCommand(expense);
      const userPatch = buildExpenseUserPatch(
        toOperationSnapshot(current),
        toOperationSnapshot(expense),
      );
      const valuationOrStatusChanged =
        current.status !== expense.status ||
        !sameExpenseValue(
          toOperationSnapshot(current).valuation,
          toOperationSnapshot(expense).valuation,
        );
      if (!userPatch.financial && !userPatch.participantSplit && valuationOrStatusChanged)
        throw new Error("Valuation changes require an explicit valuation command.");
      const businessChanged = !isEmptyExpensePatch(userPatch) || valuationOrStatusChanged;
      let savedOperationId: string | null = null;
      await database.withTransactionAsync(async () => {
        const latestBeforeWrite = await requireExpense(database, id, userId);
        if (
          latestBeforeWrite.revision !== current.revision ||
          latestBeforeWrite.serverRevision !== current.serverRevision
        )
          throw new Error("Expense changed. Review the latest value before saving.");
        await assertLedgerExpenseEditable(
          database,
          userId,
          current.journeyId,
          id,
          current.serverId,
        );
        if (command.journeyId !== current.journeyId)
          throw new Error("Expense cannot move to another Journey.");
        if (attachments) {
          const latest = await requireExpense(database, id, userId);
          if (latest.revision !== attachments.expectedRevision)
            throw new Error("Expense changed. Reopen Edit before saving.");
          const receipts = (
            await createLedgerReceiptRepository(
              database,
              async () => userId,
            ).listReceipts(current.journeyId)
          ).filter(
            (receipt) =>
              receipt.expenseId === id ||
              (current.serverId && receipt.expenseId === current.serverId),
          );
          const activeIds = receipts.map((receipt) => receipt.id);
          if (
            activeIds.length !== attachments.expectedIds.length ||
            activeIds.some((receiptId) => !attachments.expectedIds.includes(receiptId))
          )
            throw new Error("Attachments changed. Reopen Edit before saving.");
          if (attachments.removedIds.some((receiptId) => !activeIds.includes(receiptId)))
            throw new Error("Attachment does not belong to this Expense.");
          const retainedIds = activeIds.filter(
            (receiptId) => !attachments.removedIds.includes(receiptId),
          );
          assertExpenseAttachmentDrafts([
            ...retainedIds,
            ...attachments.added.map((receipt) => receipt.id),
          ]);
          for (const receiptId of attachments.removedIds)
            await deleteExpenseAttachmentInTransaction(database, receiptId, userId);
          for (const receipt of attachments.added)
            await insertExpenseReceiptInTransaction(
              database,
              receipt,
              id,
              current.journeyId,
              userId,
              now,
            );
        }
        if (!businessChanged) return;
        const causalCreate =
          current.serverRevision === 0
            ? await findCausalCreate(database, id, userId)
            : null;
        if (
          causalCreate?.attemptCount === 0 &&
          causalCreate.status === "PENDING" &&
          !causalCreate.lastAttemptAt
        ) {
          expense.syncStatus = "PENDING_CREATE";
        }
        await replaceExpenseAggregate(database, expense, "UPDATED", reason, userId);
        if (
          causalCreate?.attemptCount === 0 &&
          causalCreate.status === "PENDING" &&
          !causalCreate.lastAttemptAt
        ) {
          await coalesceIntoCreate(database, causalCreate.id, expense, userId);
          savedOperationId = causalCreate.id;
        } else if (causalCreate) {
          savedOperationId = await enqueueOrCompactDependentUpdate(
            database,
            expense,
            current,
            reason,
            userId,
            causalCreate.id,
          );
        } else {
          savedOperationId = await enqueueOperation(
            database,
            expense,
            updateOperation,
            current.serverRevision,
            reason,
            userId,
            expense,
            current,
          );
        }
      });
      return {
        ...(businessChanged ? expense : current),
        operationResult: businessChanged
          ? ((savedOperationId
              ? await this.getOperationResult(savedOperationId)
              : null) ?? undefined)
          : noOpExpenseResult(id, "UPDATE"),
      };
    },

    async completeEconomicDate(id, date, source) {
      economicDateSchema.parse(date);
      const userId = await getActiveUserId();
      const current = await requireExpense(database, id, userId);
      assertReplayFixtureWritable(current.journeyId);
      if (
        current.syncStatus !== "SYNCED" ||
        !current.serverId ||
        current.serverRevision !== current.revision ||
        current.economicDate ||
        current.status !== "RATE_REQUIRED" ||
        current.valuation
      )
        throw new Error(
          "Transaction date confirmation needs a current unresolved Expense.",
        );
      const outstanding = await database.getFirstAsync<{ found: number }>(
        `SELECT 1 AS found FROM sync_operations WHERE entity_type = 'ledger_expense'
         AND entity_id = ? AND owner_user_id = ? AND status <> 'COMPLETED' LIMIT 1`,
        id,
        userId,
      );
      if (outstanding) throw new Error("Sync this Expense before confirming its date.");
      const frozen = await database.getFirstAsync<{ revision: number }>(
        `SELECT MAX(input.expense_revision) AS revision
         FROM ledger_settlement_inputs input
         JOIN ledger_settlements settlement ON settlement.id = input.settlement_id
         WHERE input.expense_id IN (?, ?) AND settlement.status IN
           ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')`,
        id,
        current.serverId,
      );
      if (frozen?.revision && frozen.revision >= current.revision)
        throw new Error("The current Expense revision is part of a frozen Settlement.");
      const now = new Date().toISOString();
      const next: LedgerExpense = {
        ...current,
        economicDate: date,
        revision: current.revision + 1,
        syncStatus: "PENDING_UPDATE",
        updatedAt: now,
      };
      await database.withTransactionAsync(async () => {
        const updated = await database.runAsync(
          `UPDATE ledger_expenses SET economic_date = ?, revision = ?, sync_status = 'PENDING_UPDATE',
             local_owner_user_id = ?, updated_at = ?
           WHERE id = ? AND revision = ? AND economic_date IS NULL AND sync_status = 'SYNCED'`,
          date,
          next.revision,
          userId,
          now,
          id,
          current.revision,
        );
        if (updated.changes !== 1)
          throw new Error("The Expense changed while its date was being confirmed.");
        await insertAuditEvent(
          database,
          id,
          next.revision,
          "ECONOMIC_DATE_COMPLETED",
          `Transaction date evidence: ${source}`,
          now,
          next,
        );
        await enqueueOperation(
          database,
          next,
          dateCompletionOperation,
          current.serverRevision,
          source,
          userId,
          next,
          current,
        );
      });
      return next;
    },

    async listExpensesForJourney(journeyId, includeDeleted = false) {
      if (!journeyId.trim()) throw new Error("A Ledger query needs a Journey.");
      const userId = await getActiveUserId();
      const rows = await database.getAllAsync<LedgerExpenseRow>(
        `SELECT
          id, server_id AS serverId, journey_id AS journeyId,
          creator_member_id AS creatorMemberId, payer_member_id AS payerMemberId,
          title, description, category, occurred_at AS occurredAt, economic_date AS economicDate,
          original_amount_minor AS originalAmountMinor,
          original_currency AS originalCurrency, original_scale AS originalScale,
          business_status AS businessStatus,
          settlement_participation AS settlementParticipation, revision,
          server_revision AS serverRevision, deleted_at AS deletedAt,
          sync_status AS syncStatus, created_at AS createdAt, updated_at AS updatedAt
        FROM ledger_expenses
        WHERE journey_id = ? AND (sync_status = 'SYNCED' OR local_owner_user_id = ?)
          AND EXISTS (SELECT 1 FROM ledger_actor_context actor
            WHERE actor.user_id = ? AND actor.journey_id = ledger_expenses.journey_id)
          AND (? = 1 OR deleted_at IS NULL)
          AND (? = 1 OR NOT EXISTS (
            SELECT 1 FROM ledger_settlements settlement
            WHERE settlement.journey_id = ledger_expenses.journey_id
              AND settlement.correction_source_expense_id IN (
                ledger_expenses.id, ledger_expenses.server_id
              )
          ))
        ORDER BY occurred_at DESC, created_at DESC`,
        journeyId,
        userId,
        userId,
        includeDeleted ? 1 : 0,
        includeDeleted ? 1 : 0,
      );
      return Promise.all(rows.map((row) => hydrateExpense(database, row)));
    },

    async getExpense(id) {
      const userId = await getActiveUserId();
      const row = await database.getFirstAsync<LedgerExpenseRow>(
        `SELECT
          id, server_id AS serverId, journey_id AS journeyId,
          creator_member_id AS creatorMemberId, payer_member_id AS payerMemberId,
          title, description, category, occurred_at AS occurredAt, economic_date AS economicDate,
          original_amount_minor AS originalAmountMinor,
          original_currency AS originalCurrency, original_scale AS originalScale,
          business_status AS businessStatus,
          settlement_participation AS settlementParticipation, revision,
          server_revision AS serverRevision, deleted_at AS deletedAt,
          sync_status AS syncStatus, created_at AS createdAt, updated_at AS updatedAt
        FROM ledger_expenses
        WHERE id = ? AND (sync_status = 'SYNCED' OR local_owner_user_id = ?)
          AND EXISTS (SELECT 1 FROM ledger_actor_context actor
            WHERE actor.user_id = ? AND actor.journey_id = ledger_expenses.journey_id)`,
        id,
        userId,
        userId,
      );
      return row ? hydrateExpense(database, row) : null;
    },

    async tombstoneExpense(id, reason) {
      const userId = await getActiveUserId();
      const current = await requireExpense(database, id, userId);
      assertReplayFixtureWritable(current.journeyId);
      if (current.status === "DELETED") return noOpExpenseResult(id, "DELETE");
      const now = new Date().toISOString();
      const nextRevision = current.revision + 1;
      let savedOperationId: string | null = null;
      await database.withTransactionAsync(async () => {
        const latest = await requireExpense(database, id, userId);
        if (
          latest.revision !== current.revision ||
          latest.serverRevision !== current.serverRevision
        )
          throw new Error("Expense changed. Review the latest value before saving.");
        await assertLedgerExpenseEditable(
          database,
          userId,
          current.journeyId,
          id,
          current.serverId,
        );
        await database.runAsync(
          `UPDATE ledger_expenses
           SET business_status = ?, deleted_at = ?, revision = ?, sync_status = ?,
             local_owner_user_id = ?, updated_at = ?
           WHERE id = ?`,
          "DELETED",
          now,
          nextRevision,
          "PENDING_DELETE",
          userId,
          now,
          id,
        );
        await insertAuditEvent(database, id, nextRevision, "TOMBSTONED", reason, now);
        const causalCreate = await findCausalCreate(database, id, userId);
        savedOperationId = await enqueueOperation(
          database,
          { ...current, revision: nextRevision },
          deleteOperation,
          current.serverRevision,
          reason,
          userId,
          undefined,
          current,
          causalCreate?.id,
        );
      });
      return (
        (savedOperationId ? await this.getOperationResult(savedOperationId) : null) ??
        noOpExpenseResult(id, "DELETE")
      );
    },

    async restoreExpense(id, status, reason) {
      const userId = await getActiveUserId();
      const current = await requireExpense(database, id, userId);
      assertReplayFixtureWritable(current.journeyId);
      if (current.status !== "DELETED") return noOpExpenseResult(id, "RESTORE");
      const now = new Date().toISOString();
      const nextRevision = current.revision + 1;
      let savedOperationId: string | null = null;
      await database.withTransactionAsync(async () => {
        const latest = await requireExpense(database, id, userId);
        if (
          latest.revision !== current.revision ||
          latest.serverRevision !== current.serverRevision
        )
          throw new Error("Expense changed. Review the latest value before saving.");
        await database.runAsync(
          `UPDATE ledger_expenses
           SET business_status = ?, deleted_at = NULL, revision = ?, sync_status = ?,
             local_owner_user_id = ?, updated_at = ?
           WHERE id = ?`,
          status,
          nextRevision,
          "PENDING_UPDATE",
          userId,
          now,
          id,
        );
        await insertAuditEvent(database, id, nextRevision, "RESTORED", reason, now);
        const causalCreate = await findCausalCreate(database, id, userId);
        savedOperationId = await enqueueOperation(
          database,
          { ...current, revision: nextRevision },
          restoreOperation,
          current.serverRevision,
          reason,
          userId,
          undefined,
          current,
          causalCreate?.id,
        );
      });
      return (
        (savedOperationId ? await this.getOperationResult(savedOperationId) : null) ??
        noOpExpenseResult(id, "RESTORE")
      );
    },

    async markExpenseSyncing(id) {
      await setExpenseSyncStatus(database, id, "SYNCING", await getActiveUserId());
    },

    async markExpenseSynced(id, serverId, serverRevision, completedOperationId) {
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        if (completedOperationId) {
          const event = await database.getFirstAsync<{
            id: string;
            inputDigest: string;
          }>(
            `SELECT id, input_digest AS inputDigest
             FROM data_health_repair_events
             WHERE account_id = ? AND target_type = 'sync_operation'
               AND target_id = ? AND action = ? AND status = 'APPLIED'
             ORDER BY created_at DESC LIMIT 1`,
            userId,
            completedOperationId,
            HISTORICAL_EXPENSE_RECOVERY_ACTION,
          );
          if (event) {
            const existing = await database.getFirstAsync(
              `SELECT 1 FROM sync_operations WHERE owner_user_id = ?
                 AND entity_type = 'ledger_expense' AND entity_id = ?
                 AND operation_type = ?
                 AND CASE WHEN json_valid(payload_json)
                   THEN json_extract(payload_json, '$.historicalRecovery.eventId')
                 END = ?`,
              userId,
              id,
              updateOperation,
              event.id,
            );
            if (!existing) {
              const current = await requireExpense(database, id, userId);
              const operations = await readHistoricalRecoveryOperations(
                database,
                userId,
                id,
              );
              const evidence = inspectHistoricalExpenseRecovery({
                accountId: userId,
                journeyAuthorized: true,
                expense: current,
                operations,
                requireFailedCreate: false,
              });
              if (
                evidence?.createOperationId === completedOperationId &&
                evidence.inputDigest === event.inputDigest
              )
                await enqueueHistoricalRecoveryUpdate(
                  database,
                  current,
                  userId,
                  completedOperationId,
                  serverRevision,
                  event.id,
                  evidence,
                );
            }
          }
        }
        const dependent = await database.getFirstAsync<{ operationType: string }>(
          `SELECT operation_type AS operationType FROM sync_operations
           WHERE owner_user_id = ? AND entity_type = 'ledger_expense' AND entity_id = ?
             AND status NOT IN ('COMPLETED', 'CONFLICT', 'FAILED')
             AND operation_type <> ? AND id <> ?
           ORDER BY created_at DESC, rowid DESC LIMIT 1`,
          userId,
          id,
          createOperation,
          completedOperationId ?? "",
        );
        const syncStatus = operationSyncStatus(dependent?.operationType);
        await database.runAsync(
          `UPDATE ledger_expenses
           SET server_id = ?, server_revision = ?, sync_status = ?, local_owner_user_id = ?,
               last_synced_at = ?, updated_at = ?
           WHERE id = ? AND local_owner_user_id = ?`,
          serverId,
          serverRevision,
          syncStatus,
          dependent ? userId : null,
          new Date().toISOString(),
          new Date().toISOString(),
          id,
          userId,
        );
      });
    },

    async markExpensePending(id, operationType) {
      await setExpenseSyncStatus(
        database,
        id,
        operationSyncStatus(operationType),
        await getActiveUserId(),
      );
    },

    async bindOperation(operation, typed = false) {
      const accountId = await getActiveUserId();
      if (operation.ownerUserId !== accountId)
        throw new Error("Expense operation belongs to another account.");
      return bindExpenseOperation(database, accountId, operation, typed);
    },

    async getLatestOperationResult(expenseId) {
      const accountId = await getActiveUserId();
      const latest = await database.getFirstAsync<{ operationId: string }>(
        `SELECT operation_id AS operationId FROM ledger_expense_commands WHERE account_id = ? AND expense_id = ? ORDER BY intent_sequence DESC LIMIT 1`,
        accountId,
        expenseId,
      );
      return latest
        ? getExpenseOperationResult(database, accountId, latest.operationId)
        : null;
    },

    async listRateAcceptanceOperations(journeyId) {
      const userId = await getActiveUserId();
      const rows = await database.getAllAsync<{ operationId: string; title: string }>(
        `SELECT c.operation_id AS operationId, e.title FROM ledger_expense_commands c
         JOIN ledger_expenses e ON e.id = c.expense_id
         JOIN sync_operations o ON o.id = c.operation_id
         WHERE c.account_id = ? AND e.journey_id = ?
           AND json_extract(c.intent_json,'$.valuation.rateAcceptance') IS NOT NULL
           AND o.status <> 'COMPLETED'
           AND c.intent_sequence = (SELECT MAX(n.intent_sequence) FROM ledger_expense_commands n WHERE n.account_id = c.account_id AND n.expense_id = c.expense_id AND json_extract(n.intent_json,'$.valuation.rateAcceptance') IS NOT NULL)`,
        userId,
        journeyId,
      );
      const results = await Promise.all(
        rows.map(async (row) => ({
          title: row.title,
          result: await this.getOperationResult(row.operationId),
        })),
      );
      return results.filter(
        (row): row is { title: string; result: ExpenseOperationResult } =>
          row.result !== null,
      );
    },

    async getOperationResult(operationId) {
      return getExpenseOperationResult(database, await getActiveUserId(), operationId);
    },

    async confirmExpenseOperation(
      operationId,
      canonical,
      disposition = "APPLIED",
      receipt,
    ) {
      const accountId = await getActiveUserId();
      const operation = await database.getFirstAsync<{ expenseId: string }>(
        `SELECT entity_id AS expenseId FROM sync_operations WHERE id = ? AND owner_user_id = ?`,
        operationId,
        accountId,
      );
      if (!operation) throw new Error("Expense operation belongs to another account.");
      await database.withTransactionAsync(async () => {
        await this.reconcileCanonicalExpenseInTransaction(
          operation.expenseId,
          canonical,
          operationId,
          disposition,
          receipt,
        );
      });
    },

    async confirmConflictResolution(operationId, value) {
      const generation = getAccountGeneration();
      const accountId = await getActiveUserId();
      const response = expenseConflictChainResolutionResponseSchema.parse(value);
      await database.withTransactionAsync(async () => {
        const op = await database.getFirstAsync<{
          expenseId: string;
          key: string;
          payload: string;
        }>(
          `SELECT entity_id AS expenseId,idempotency_key AS key,payload_json AS payload FROM sync_operations WHERE id=? AND owner_user_id=? AND operation_type='LEDGER_RESOLVE_EXPENSE_CONFLICT'`,
          operationId,
          accountId,
        );
        if (!op) throw new Error("Resolution operation belongs to another account.");
        const request = expenseConflictChainResolutionRequestSchema.parse(
          JSON.parse(op.payload),
        );
        if (
          response.resolutionReceipt.idempotencyKey !== op.key ||
          response.resolutionReceipt.commandId !== request.commandId ||
          response.resolutionReceipt.commandType !== request.intentType
        )
          throw new Error("Resolution receipt does not match the submitted operation.");
        const previous = await database.getFirstAsync<{ json: string }>(
          `SELECT response_json AS json FROM ledger_expense_resolution_receipts WHERE account_id=? AND operation_id=?`,
          accountId,
          operationId,
        );
        if (previous) {
          if (!sameExpenseValue(JSON.parse(previous.json), response))
            throw new Error("Immutable resolution replay differs.");
          return;
        }
        const commands = await readExpenseCommands(database, accountId, op.expenseId);
        for (const outcome of response.conflictOutcomes) {
          if (outcome.lifecycle === "OPEN") continue;
          if (!request.coveredConflictIds.includes(outcome.conflictId)) continue;
          const conflict = await database.getFirstAsync<{ operationId: string }>(
            `SELECT operation_id AS operationId FROM ledger_expense_conflicts WHERE conflict_id=? AND expense_id=?`,
            outcome.conflictId,
            op.expenseId,
          );
          const command =
            commands.find((c) => c.operationId === conflict?.operationId) ??
            commands.find((c) => c.operationId === outcome.operationReceipt?.operationId);
          if (command && !outcome.operationReceipt)
            throw new Error("Covered Expense command is missing its server receipt.");
          if (command && outcome.operationReceipt)
            await storeExpenseReceipt(
              database,
              accountId,
              command,
              response.canonical,
              outcome.operationReceipt.disposition,
              outcome.operationReceipt,
            );
          else if (conflict?.operationId)
            await database.runAsync(
              `UPDATE sync_operations SET status='COMPLETED',failure_category=NULL,claim_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND owner_user_id=?`,
              new Date().toISOString(),
              conflict.operationId,
              accountId,
            );
          await database.runAsync(
            `UPDATE ledger_expense_conflicts SET status=?,resolved_at=? WHERE conflict_id=? AND expense_id=?`,
            outcome.lifecycle,
            new Date().toISOString(),
            outcome.conflictId,
            op.expenseId,
          );
        }
        await database.runAsync(
          `INSERT INTO ledger_expense_resolution_receipts(account_id,operation_id,response_json) VALUES(?,?,?)`,
          accountId,
          operationId,
          JSON.stringify(response),
        );
        await database.runAsync(
          `UPDATE sync_operations SET status='COMPLETED',failure_category=NULL,last_error_code=NULL,last_error_message=NULL,claim_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND owner_user_id=?`,
          new Date().toISOString(),
          operationId,
          accountId,
        );
        await this.reconcileCanonicalExpenseInTransaction(
          op.expenseId,
          response.canonical,
          undefined,
          "APPLIED",
          undefined,
          true,
        );
        await database.runAsync(
          `UPDATE ledger_expense_conflict_chains SET chain_json=NULL WHERE account_id=? AND expense_id=?`,
          accountId,
          op.expenseId,
        );
        await database.runAsync(
          `UPDATE sync_operations SET status='PENDING',failure_category=NULL,next_attempt_at=NULL WHERE owner_user_id=? AND status='DEPENDENCY_BLOCKED' AND EXISTS(SELECT 1 FROM ledger_expense_operation_receipts r WHERE r.account_id=? AND r.operation_id=sync_operations.dependency_operation_id AND json_extract(r.receipt_json,'$.disposition')='APPLIED')`,
          accountId,
          accountId,
        );
        if (
          generation !== getAccountGeneration() ||
          accountId !== (await getActiveUserId())
        )
          throw new Error("Account changed during conflict resolution.");
      });
    },

    async reconcileCanonicalExpense(id, canonical) {
      await database.withTransactionAsync(async () => {
        await this.reconcileCanonicalExpenseInTransaction(id, canonical);
      });
    },

    async reconcileCanonicalExpenseInTransaction(
      id,
      incoming,
      operationId,
      disposition = "APPLIED",
      receipt,
      authoritativeClosure = false,
    ) {
      const generation = getAccountGeneration();
      const userId = await getActiveUserId();
      const current = await requireExpense(database, id, userId);
      if (
        incoming.journeyId !== current.journeyId ||
        (current.serverId && incoming.id !== current.serverId)
      )
        throw new Error("Canonical Expense identity does not match local operation.");
      // Pull may discover the remote row before CREATE's acknowledgement maps its local ID.
      const discovered = await readExpenseCanonical(database, userId, incoming.id);
      if (discovered) await storeExpenseCanonical(database, userId, id, discovered);
      const duplicate = await database.getFirstAsync<{ id: string }>(
        `SELECT id FROM ledger_expenses WHERE journey_id = ? AND (id = ? OR server_id = ?)
         AND id <> ? AND sync_status = 'SYNCED' AND local_owner_user_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM sync_operations op WHERE op.entity_id = ledger_expenses.id
           AND op.entity_type = 'ledger_expense' AND op.status <> 'COMPLETED') LIMIT 1`,
        current.journeyId,
        incoming.id,
        incoming.id,
        id,
      );
      if (duplicate) {
        await database.runAsync(
          "UPDATE ledger_valuation_snapshots SET is_active = 0 WHERE expense_id = ?",
          duplicate.id,
        );
        for (const table of ["ledger_expense_participants", "ledger_expense_splits"])
          await database.runAsync(
            `DELETE FROM ${table} WHERE expense_id = ?`,
            duplicate.id,
          );
        for (const table of [
          "ledger_valuation_snapshots",
          "ledger_payment_records",
          "ledger_expense_audit_events",
          "ledger_expense_conflicts",
          "ledger_correction_requests",
        ])
          await database.runAsync(
            `UPDATE ${table} SET expense_id = ? WHERE expense_id = ?`,
            id,
            duplicate.id,
          );
        await database.runAsync("DELETE FROM ledger_expenses WHERE id = ?", duplicate.id);
      }
      const commands = await readExpenseCommands(database, userId, id);
      if (operationId) {
        const command = commands.find((row) => row.operationId === operationId);
        if (!command) throw new Error("Expense operation has no causal evidence.");
        const intent = JSON.parse(command.intentJson) as ExpenseTypedIntent;
        if (intent.type === "APPLY_VALUATION" && incoming.valuation) {
          await this.markValuationSynced(
            intent.valuation.localValuationId,
            incoming.valuation.id,
            intent.valuation.localRateSnapshotId,
            incoming.valuation.rateSnapshotId,
          );
        }
        await storeExpenseReceipt(
          database,
          userId,
          command,
          incoming,
          disposition,
          receipt,
        );
      }
      await storeExpenseCanonical(database, userId, id, incoming);
      const canonical = (await readExpenseCanonical(database, userId, id)) ?? incoming;
      if (canonical.revision < current.serverRevision) return;
      const active = commands.filter(
        (command) => command.operationId !== operationId && !command.receiptJson,
      );
      const legacy = await database.getFirstAsync<{ id: string }>(
        `SELECT op.id FROM sync_operations op WHERE op.owner_user_id = ? AND op.entity_type = 'ledger_expense'
         AND op.entity_id = ? AND op.status <> 'COMPLETED' AND op.id <> ?
         AND op.operation_type <> 'LEDGER_RESOLVE_EXPENSE_CONFLICT'
         AND NOT EXISTS (SELECT 1 FROM ledger_expense_commands command WHERE command.account_id = op.owner_user_id AND command.operation_id = op.id) LIMIT 1`,
        userId,
        id,
        operationId ?? "",
      );
      let expense: LedgerExpense = {
        ...current,
        serverId: canonical.id,
        serverRevision: canonical.revision,
        creatorMemberId: canonical.creatorMemberId,
        payerMemberId: canonical.payerMemberId,
        title: canonical.title,
        description: canonical.description,
        category: canonical.category,
        occurredAt: canonical.occurredAt,
        economicDate: canonical.economicDate ?? null,
        original: canonical.original,
        participants: canonical.participants,
        splits: canonical.splits,
        valuation: canonical.valuation,
        paymentRecords: canonical.paymentRecords,
        status: canonical.businessStatus,
        settlementParticipation: canonical.settlementParticipation,
        revision: Math.max(current.revision, canonical.revision),
        deletedAt: canonical.deletedAt,
        syncStatus: "SYNCED",
        updatedAt: canonical.updatedAt,
      };
      if (
        legacy ||
        (!authoritativeClosure &&
          !operationId &&
          !active.length &&
          current.syncStatus !== "SYNCED")
      ) {
        // Historical unresolved intent has no trusted patch: preserve its projection.
        expense = {
          ...current,
          serverId: canonical.id,
          serverRevision: canonical.revision,
        };
      } else {
        for (const command of active) expense = projectExpenseIntent(expense, command);
        if (active.length) {
          const latest = active[active.length - 1]!;
          expense.syncStatus = active.some((row) => row.status === "CONFLICT")
            ? "CONFLICT"
            : active.some((row) => row.status === "FAILED")
              ? "FAILED"
              : JSON.parse(latest.intentJson).type === "DELETE"
                ? "PENDING_DELETE"
                : JSON.parse(latest.intentJson).type === "CREATE"
                  ? "PENDING_CREATE"
                  : "PENDING_UPDATE";
        }
      }
      if (generation !== getAccountGeneration() || userId !== (await getActiveUserId()))
        throw new Error("Account changed during Expense reconciliation.");
      await replaceExpenseData(database, expense, userId);
      for (const event of canonical.auditEvents) {
        await database.runAsync(
          `INSERT OR IGNORE INTO ledger_expense_audit_events (
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
      if (operationId)
        await database.runAsync(
          `UPDATE sync_operations SET status = 'PENDING', failure_category = NULL,
         last_error_code = NULL, last_error_message = NULL, next_attempt_at = NULL
         WHERE owner_user_id = ? AND dependency_operation_id = ? AND status = 'DEPENDENCY_BLOCKED'
         AND EXISTS (SELECT 1 FROM ledger_expense_operation_receipts receipt
           WHERE receipt.account_id = ? AND receipt.operation_id = ?
             AND json_extract(receipt.receipt_json, '$.disposition') = 'APPLIED')`,
          userId,
          operationId,
          userId,
          operationId,
        );
    },

    async markExpenseFailed(id) {
      await setExpenseSyncStatus(database, id, "FAILED", await getActiveUserId());
    },

    async markExpenseConflict(id) {
      await setExpenseSyncStatus(database, id, "CONFLICT", await getActiveUserId());
    },

    async cacheRateQuote(quote) {
      await database.runAsync(
        `INSERT OR REPLACE INTO ledger_rate_quotes (
          id, journey_id, quote_currency, base_currency, decimal_rate,
          effective_date, observed_at, provider, provider_reference, expires_at, updated_at,
          economic_date, reference_date, policy_version, source_reference
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        quote.economicDate ?? null,
        quote.referenceDate ?? null,
        quote.policyVersion ?? null,
        quote.sourceReference ?? null,
      );
    },

    async listRateQuotes(journeyId, quoteCurrency, baseCurrency) {
      const userId = await getActiveUserId();
      return database.getAllAsync<RateQuote>(
        `SELECT id, journey_id AS journeyId, quote_currency AS quoteCurrency,
          base_currency AS baseCurrency, decimal_rate AS decimalRate,
          effective_date AS effectiveDate, observed_at AS observedAt, provider,
          provider_reference AS providerReference, expires_at AS expiresAt,
          economic_date AS economicDate, reference_date AS referenceDate,
          policy_version AS policyVersion, source_reference AS sourceReference
         FROM ledger_rate_quotes
         WHERE journey_id = ? AND quote_currency = ? AND base_currency = ?
           AND EXISTS (SELECT 1 FROM ledger_actor_context actor
             WHERE actor.user_id = ? AND actor.journey_id = ledger_rate_quotes.journey_id)
         ORDER BY observed_at DESC`,
        journeyId,
        quoteCurrency,
        baseCurrency,
        userId,
      );
    },

    async addPaymentRecord(expenseId, input) {
      const userId = await getActiveUserId();
      const expense = await requireExpense(database, expenseId, userId);
      assertReplayFixtureWritable(expense.journeyId);
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
          userId,
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

    async listPreviousValuations(id) {
      const userId = await getActiveUserId();
      await requireExpense(database, id, userId);
      const rows = await database.getAllAsync<ValuationRow>(
        `SELECT id, server_id AS serverId, policy, original_amount_minor AS originalMinor,
          original_currency AS originalCurrency, original_scale AS originalScale,
          settlement_amount_minor AS settlementMinor,
          settlement_currency AS settlementCurrency, settlement_scale AS settlementScale,
          rate_snapshot_id AS rateSnapshotId, payment_record_id AS paymentRecordId,
          reason, decimal_rate AS decimalRate, rounding_mode AS roundingMode,
          effective_at AS effectiveAt, supersedes_valuation_id AS supersedesValuationId,
          reference_evidence_json AS referenceEvidenceJson
         FROM ledger_valuation_snapshots WHERE expense_id = ? AND is_active = 0
         ORDER BY expense_revision DESC`,
        id,
      );
      const seen = new Set<string>();
      return rows
        .filter((row) => {
          const canonicalId = row.serverId ?? row.id;
          if (seen.has(canonicalId)) return false;
          seen.add(canonicalId);
          return true;
        })
        .slice(0, 5)
        .map(normalizeValuation);
    },

    async applyValuation(expenseId, input) {
      const generation = getAccountGeneration();
      const assertAccount = () => {
        if (generation !== getAccountGeneration())
          throw new Error("Account changed. Reopen Settlement.");
      };
      const userId = await getActiveUserId();
      assertAccount();
      const current = await requireExpense(database, expenseId, userId);
      assertReplayFixtureWritable(current.journeyId);
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
              provider_reference AS providerReference, expires_at AS expiresAt,
              economic_date AS economicDate, reference_date AS referenceDate,
              policy_version AS policyVersion, source_reference AS sourceReference
             FROM ledger_rate_quotes WHERE id = ? AND journey_id = ?`,
            input.rateQuoteId,
            current.journeyId,
          )
        : undefined;
      if (input.policy === "REFERENCE_RATE") {
        const referenceDate = rateQuote?.referenceDate;
        const days =
          referenceDate && current.economicDate
            ? (Date.parse(`${current.economicDate}T00:00:00Z`) -
                Date.parse(`${referenceDate}T00:00:00Z`)) /
              86_400_000
            : NaN;
        if (
          !rateQuote ||
          !current.economicDate ||
          rateQuote.economicDate !== current.economicDate ||
          rateQuote.policyVersion !== "ECB_DAILY_V1" ||
          rateQuote.provider !== "ECB" ||
          rateQuote.sourceReference !==
            "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" ||
          rateQuote.providerReference !==
            `https://api.frankfurter.dev/v2/providers/ecb/rate/${rateQuote.quoteCurrency}/${rateQuote.baseCurrency}?date=${rateQuote.economicDate}` ||
          rateQuote.quoteCurrency !== current.original.currency ||
          rateQuote.baseCurrency !== journey.settlementCurrency ||
          rateQuote.effectiveDate !== referenceDate ||
          !Number.isInteger(days) ||
          days < 0 ||
          days > 7 ||
          Date.parse(rateQuote.expiresAt) <= Date.now()
        )
          throw new Error("A matching historical ECB candidate is required.");
      }
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
      if (
        input.expectedRevision !== undefined &&
        (current.revision !== input.expectedRevision ||
          current.syncStatus !== "SYNCED" ||
          ((current.status !== "RATE_REQUIRED" || current.valuation) &&
            !(
              input.rateAcceptance &&
              compatibleReferenceValue(input.rateAcceptance, current.valuation)
            )))
      )
        throw new Error("Expense changed. Review the latest rate before accepting.");
      if (
        input.expectedSettlement &&
        (preview.settlement.minor !== input.expectedSettlement.minor ||
          preview.settlement.currency !== input.expectedSettlement.currency ||
          preview.settlement.scale !== input.expectedSettlement.scale)
      )
        throw new Error(
          "Journey value changed. Review the latest rate before accepting.",
        );
      if (
        input.rateAcceptance &&
        !rateBindingMatches(
          input.rateAcceptance,
          current,
          journey.settlementCurrency,
          journey.settlementScale,
        )
      )
        throw new Error(
          "Expense or Journey value changed. Review the latest rate before accepting.",
        );
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
      let savedOperationId: string | null = null;
      await database.withTransactionAsync(async () => {
        assertAccount();
        const latest = await requireExpense(database, expenseId, userId);
        if (
          input.expectedRevision !== undefined &&
          (latest.syncStatus !== "SYNCED" ||
            ((latest.status !== "RATE_REQUIRED" || latest.valuation) &&
              !(
                input.rateAcceptance &&
                compatibleReferenceValue(input.rateAcceptance, latest.valuation)
              )))
        )
          throw new Error("Expense changed. Review the latest rate before accepting.");
        if (latest.revision !== current.revision)
          throw new Error("Expense changed. Review the latest value before accepting.");
        if (input.rateAcceptance) {
          const settings = await database.getFirstAsync<{
            currency: string;
            scale: number;
          }>(
            "SELECT settlement_currency AS currency, settlement_scale AS scale FROM ledger_journeys WHERE journey_id = ?",
            current.journeyId,
          );
          if (
            !settings ||
            !rateBindingMatches(
              input.rateAcceptance,
              latest,
              settings.currency,
              settings.scale,
            )
          )
            throw new Error(
              "Expense or Journey value changed. Review the latest rate before accepting.",
            );
        }
        await database.runAsync(
          `UPDATE ledger_expenses SET business_status = 'ACCEPTED', revision = ?,
            sync_status = 'PENDING_UPDATE', local_owner_user_id = ?, updated_at = ?
            WHERE id = ?`,
          revision,
          userId,
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
        savedOperationId = await enqueueEvidenceOperation(
          database,
          current,
          current.id,
          "LEDGER_APPLY_VALUATION",
          {
            localValuationId: valuation.id,
            localRateSnapshotId: rateSnapshotId,
            baseRevision: current.serverRevision,
            policy: input.policy,
            ...(input.rateAcceptance ? { rateAcceptance: input.rateAcceptance } : {}),
            economicDate: input.policy === "REFERENCE_RATE" ? current.economicDate : null,
            rateQuoteId: input.rateQuoteId ?? null,
            paymentRecordId: input.paymentRecordId ?? null,
            manualRate: input.manualRate ?? null,
            reason: preview.reason,
            previewSettlement: preview.settlement,
            baseExpense: toOperationSnapshot(current),
          },
          userId,
          "ledger_expense",
          current.serverRevision,
        );
        assertAccount();
      });
      return {
        ...next,
        operationResult:
          (savedOperationId ? await this.getOperationResult(savedOperationId) : null) ??
          undefined,
      };
    },
  };
}

async function defaultGetActiveUserId() {
  return (await import("@/data/auth/authRepository")).requireActiveUserId();
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
    economicDate: command.economicDate ?? null,
    original: command.original,
    participants: command.participants,
    splits: command.splits,
    valuation: command.valuation,
    paymentRecords: [],
    status: command.status,
    settlementParticipation: command.settlementParticipation ?? "INCLUDED",
    revision,
    deletedAt: null,
    syncStatus:
      persisted.syncStatus ?? (persisted.serverId ? "PENDING_UPDATE" : "PENDING_CREATE"),
    createdAt: persisted.createdAt ?? now,
    updatedAt: now,
  };
}

function assertCommand(expense: LedgerExpense) {
  if (expense.economicDate !== null) economicDateSchema.parse(expense.economicDate);
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
  userId: string,
) {
  await database.runAsync(
    `INSERT INTO ledger_expenses (
      id, server_id, journey_id, creator_member_id, payer_member_id, title, description,
      category, occurred_at, economic_date, original_amount_minor, original_currency, original_scale,
      business_status, settlement_participation, revision, server_revision, deleted_at,
      sync_status, last_synced_at, created_at, updated_at, local_owner_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    expense.id,
    expense.serverId,
    expense.journeyId,
    expense.creatorMemberId,
    expense.payerMemberId,
    expense.title,
    expense.description,
    expense.category,
    expense.occurredAt,
    expense.economicDate ?? null,
    expense.original.minor,
    expense.original.currency,
    expense.original.scale,
    expense.status,
    expense.settlementParticipation,
    expense.revision,
    expense.serverRevision,
    expense.deletedAt,
    expense.syncStatus,
    null,
    expense.createdAt,
    expense.updatedAt,
    userId,
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
  userId: string,
) {
  await replaceExpenseData(database, expense, userId);
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
  userId: string,
) {
  await database.runAsync(
    `UPDATE ledger_expenses SET
      journey_id = ?, creator_member_id = ?, payer_member_id = ?, title = ?, description = ?,
      category = ?, occurred_at = ?, economic_date = ?, original_amount_minor = ?, original_currency = ?,
      original_scale = ?, business_status = ?, settlement_participation = ?, revision = ?, server_id = ?,
      server_revision = ?, deleted_at = ?, sync_status = ?, last_synced_at = ?,
      local_owner_user_id = ?, updated_at = ?
     WHERE id = ?`,
    expense.journeyId,
    expense.creatorMemberId,
    expense.payerMemberId,
    expense.title,
    expense.description,
    expense.category,
    expense.occurredAt,
    expense.economicDate ?? null,
    expense.original.minor,
    expense.original.currency,
    expense.original.scale,
    expense.status,
    expense.settlementParticipation,
    expense.revision,
    expense.serverId,
    expense.serverRevision,
    expense.deletedAt,
    expense.syncStatus,
    expense.syncStatus === "SYNCED" ? new Date().toISOString() : null,
    expense.syncStatus === "SYNCED" ? null : userId,
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
        rounding_mode, effective_at, supersedes_valuation_id, reference_evidence_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      expense.valuation.referenceEvidence
        ? JSON.stringify(expense.valuation.referenceEvidence)
        : null,
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
  userId: string,
  entityType = "ledger_payment_record",
  baseVersion: number | null = null,
) {
  const now = new Date().toISOString();
  const operationId = createLocalId("ledger-operation");
  await database.runAsync(
    `INSERT INTO sync_operations (
      id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
      base_version, payload_json, owner_user_id, status, attempt_count, next_attempt_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, NULL, ?, ?)`,
    operationId,
    expense.journeyId,
    entityType,
    entityId,
    operationType,
    createLocalId("ledger-idempotency"),
    baseVersion,
    JSON.stringify({ expenseId: expense.id, ...((payload as object) ?? {}) }),
    userId,
    now,
    now,
  );
  if (entityType === "ledger_expense" && operationType === "LEDGER_APPLY_VALUATION") {
    const {
      baseRevision: _baseRevision,
      baseExpense: _baseExpense,
      ...valuation
    } = payload as Record<string, unknown>;
    await recordExpenseCommand(
      database,
      userId,
      operationId,
      await requireExpense(database, expense.id, userId),
      {
        type: "APPLY_VALUATION",
        valuation: valuation as Extract<
          ExpenseTypedIntent,
          { type: "APPLY_VALUATION" }
        >["valuation"],
      },
    );
  }
  return operationId;
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
  userId: string,
  snapshot?: LedgerExpense,
  baseSnapshot?: LedgerExpense,
  dependencyOperationId?: string,
) {
  const now = new Date().toISOString();
  const operationId = createLocalId("ledger-operation");
  await database.runAsync(
    `INSERT INTO sync_operations (
      id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
      base_version, payload_json, owner_user_id, status, attempt_count, next_attempt_at,
      dependency_operation_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    operationId,
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
    userId,
    dependencyOperationId ? "DEPENDENCY_BLOCKED" : "PENDING",
    0,
    null,
    dependencyOperationId ?? null,
    now,
    now,
  );
  const projection = snapshot ?? (await requireExpense(database, expense.id, userId));
  const intent: ExpenseTypedIntent =
    operationType === restoreOperation
      ? {
          type: "RESTORE",
          businessStatus: projection.status === "DELETED" ? "DRAFT" : projection.status,
        }
      : localExpenseIntent(
          projection,
          operationType === createOperation ? undefined : baseSnapshot,
        );
  await recordExpenseCommand(database, userId, operationId, projection, intent);
  return operationId;
}

async function readHistoricalRecoveryOperations(
  database: LedgerExpenseDatabase,
  userId: string,
  expenseId: string,
) {
  return database.getAllAsync<HistoricalExpenseOperation>(
    `SELECT id, trip_id AS journeyId, entity_id AS entityId,
       operation_type AS operationType, idempotency_key AS idempotencyKey,
       payload_json AS payloadJson, status, attempt_count AS attemptCount,
       failure_category AS failureCategory, last_error_code AS errorCode,
       last_error_message AS errorMessage, last_attempt_at AS lastAttemptAt,
       dependency_operation_id AS dependencyOperationId,
       created_at AS createdAt, updated_at AS updatedAt
     FROM sync_operations WHERE owner_user_id = ?
       AND entity_type = 'ledger_expense' AND entity_id = ?
     ORDER BY created_at, rowid`,
    userId,
    expenseId,
  );
}

async function enqueueHistoricalRecoveryUpdate(
  database: LedgerExpenseDatabase,
  expense: LedgerExpense,
  userId: string,
  createOperationId: string,
  serverRevision: number,
  eventId: string,
  evidence: HistoricalExpenseRecoveryEvidence,
) {
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO sync_operations (
      id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
      base_version, payload_json, owner_user_id, status, attempt_count,
      next_attempt_at, dependency_operation_id, created_at, updated_at
    ) VALUES (?, ?, 'ledger_expense', ?, ?, ?, ?, ?, ?, 'DEPENDENCY_BLOCKED',
      0, NULL, ?, ?, ?)`,
    createLocalId("ledger-operation"),
    expense.journeyId,
    expense.id,
    updateOperation,
    createLocalId("ledger-idempotency"),
    serverRevision,
    JSON.stringify({
      ...operationPayload(expense, "Recovered protected local edits.", expense),
      historicalRecovery: {
        eventId,
        evidenceDigest: evidence.inputDigest,
        supersededOperationIds: evidence.historicalUpdateIds,
      },
    }),
    userId,
    createOperationId,
    now,
    now,
  );
}

async function findCausalCreate(
  database: LedgerExpenseDatabase,
  entityId: string,
  userId: string,
) {
  return database.getFirstAsync<{
    id: string;
    status: string;
    attemptCount: number;
    lastAttemptAt: string | null;
  }>(
    `SELECT id, status, attempt_count AS attemptCount, last_attempt_at AS lastAttemptAt FROM sync_operations
     WHERE owner_user_id = ? AND entity_type = 'ledger_expense' AND entity_id = ?
       AND operation_type = ? AND status <> 'COMPLETED'
     ORDER BY created_at, rowid LIMIT 1`,
    userId,
    entityId,
    createOperation,
  );
}

async function coalesceIntoCreate(
  database: LedgerExpenseDatabase,
  operationId: string,
  expense: LedgerExpense,
  userId: string,
) {
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE sync_operations SET payload_json = ?, failure_category = NULL,
       last_error_code = NULL, last_error_message = NULL, next_attempt_at = NULL,
       updated_at = ? WHERE id = ? AND owner_user_id = ?`,
    JSON.stringify(operationPayload(expense, null, expense)),
    now,
    operationId,
    userId,
  );
  await recordExpenseCommand(
    database,
    userId,
    operationId,
    expense,
    localExpenseIntent(expense),
  );
  await database.runAsync(
    `UPDATE sync_operations SET status = 'COMPLETED', updated_at = ?
     WHERE owner_user_id = ? AND entity_type = 'ledger_expense' AND entity_id = ?
       AND operation_type = ? AND status <> 'PROCESSING' AND status <> 'COMPLETED'`,
    now,
    userId,
    expense.id,
    updateOperation,
  );
}

async function enqueueOrCompactDependentUpdate(
  database: LedgerExpenseDatabase,
  expense: LedgerExpense,
  baseExpense: LedgerExpense,
  reason: string | null,
  userId: string,
  dependencyOperationId: string,
) {
  const existing = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM sync_operations
     WHERE owner_user_id = ? AND entity_type = 'ledger_expense' AND entity_id = ?
       AND operation_type = ? AND dependency_operation_id = ? AND attempt_count = 0 AND last_attempt_at IS NULL
       AND status <> 'PROCESSING' AND status <> 'COMPLETED'
     ORDER BY created_at, rowid LIMIT 1`,
    userId,
    expense.id,
    updateOperation,
    dependencyOperationId,
  );
  if (!existing) {
    return enqueueOperation(
      database,
      expense,
      updateOperation,
      baseExpense.serverRevision,
      reason,
      userId,
      expense,
      baseExpense,
      dependencyOperationId,
    );
  }
  await database.runAsync(
    `UPDATE sync_operations SET payload_json = ?, base_version = ?,
       status = 'DEPENDENCY_BLOCKED', failure_category = 'DEPENDENCY',
       last_error_code = 'DEPENDENCY_BLOCKED',
       last_error_message = 'Waiting for Expense create.', updated_at = ?
     WHERE id = ? AND owner_user_id = ?`,
    JSON.stringify(operationPayload(expense, reason, expense, baseExpense)),
    baseExpense.serverRevision,
    new Date().toISOString(),
    existing.id,
    userId,
  );
  await recordExpenseCommand(
    database,
    userId,
    existing.id,
    expense,
    localExpenseIntent(expense, baseExpense),
  );
  return existing.id;
}

function operationPayload(
  expense: Pick<LedgerExpense, "id" | "revision">,
  reason: string | null,
  snapshot?: LedgerExpense,
  baseSnapshot?: LedgerExpense,
) {
  return {
    expenseId: expense.id,
    revision: expense.revision,
    reason,
    expense: snapshot ? toOperationSnapshot(snapshot) : null,
    baseExpense: baseSnapshot ? toOperationSnapshot(baseSnapshot) : null,
  };
}

function operationSyncStatus(operationType?: string): SyncStatus {
  if (!operationType) return "SYNCED";
  if (operationType === createOperation) return "PENDING_CREATE";
  if (operationType === deleteOperation) return "PENDING_DELETE";
  return "PENDING_UPDATE";
}

function toOperationSnapshot(expense: LedgerExpense) {
  return {
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
      `SELECT COALESCE(server_id, id) AS id, policy,
        original_amount_minor AS originalMinor, original_currency AS originalCurrency,
        original_scale AS originalScale, settlement_amount_minor AS settlementMinor,
        settlement_currency AS settlementCurrency, settlement_scale AS settlementScale,
        rate_snapshot_id AS rateSnapshotId, payment_record_id AS paymentRecordId, reason,
        decimal_rate AS decimalRate, rounding_mode AS roundingMode,
        effective_at AS effectiveAt, supersedes_valuation_id AS supersedesValuationId,
        reference_evidence_json AS referenceEvidenceJson
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
    economicDate: row.economicDate ?? null,
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
    settlementParticipation: row.settlementParticipation,
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
    referenceEvidence: value.referenceEvidenceJson
      ? (JSON.parse(
          value.referenceEvidenceJson,
        ) as SettlementValuationSnapshot["referenceEvidence"])
      : null,
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

async function requireExpense(
  database: LedgerExpenseDatabase,
  id: string,
  userId: string,
) {
  const repository = createLedgerExpenseRepository(database, async () => userId);
  const expense = await repository.getExpense(id);
  if (!expense) throw new Error("Ledger expense was not found.");
  return expense;
}

async function setExpenseSyncStatus(
  database: LedgerExpenseDatabase,
  id: string,
  syncStatus: SyncStatus,
  userId: string,
) {
  await database.runAsync(
    `UPDATE ledger_expenses SET sync_status = ?, updated_at = ?
     WHERE id = ? AND local_owner_user_id = ?`,
    syncStatus,
    new Date().toISOString(),
    id,
    userId,
  );
}

function noOpExpenseResult(
  expenseId: string,
  commandType: ExpenseOperationResult["commandType"],
): ExpenseOperationResult {
  return {
    expenseId,
    commandType,
    operationId: null,
    intentSequence: null,
    changed: false,
    state: "LOCAL_SAVED",
    disposition: null,
  };
}
