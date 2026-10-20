import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { createLocalId } from "@/domain/localId";
import { announceLedgerQueueWorkAvailable } from "@/data/sync/ledgerQueueActivity";
import { createLedgerExpenseMutationTransport } from "@/data/sync/ledgerExpenseMutationTransport";
import {
  expenseConflictChainResponseSchema,
  expenseConflictChainResolutionRequestSchema,
  type ExpenseConflictChainResponse,
  type ExpenseConflictChainResolutionRequest,
} from "@/data/api/ledgerMutationContracts";
import type { LedgerCollaborationDatabase } from "./ledgerCollaborationRepository";
import { storeExpenseConflictMetadata } from "./ledgerExpenseConsistency";
import { createLedgerExpenseRepository } from "./ledgerExpenseRepository";

export function createLedgerExpenseConflictRepository(
  database: LedgerCollaborationDatabase,
  getUser = requireActiveUserId,
  transport = createLedgerExpenseMutationTransport(),
) {
  return {
    async listOpen(journeyId?: string) {
      const account = await getUser();
      return database.getAllAsync<{
        id: string;
        journeyId: string;
        title: string;
        deletedAt: string | null;
        conflictCount: number;
      }>(
        `SELECT e.id,e.journey_id AS journeyId,e.title,e.deleted_at AS deletedAt,COUNT(DISTINCT c.conflict_id) AS conflictCount
         FROM ledger_expenses e JOIN ledger_expense_conflicts c ON c.expense_id=e.id AND c.status='OPEN'
         JOIN ledger_actor_context a ON a.journey_id=e.journey_id AND a.user_id=?
         WHERE (e.local_owner_user_id IS NULL OR e.local_owner_user_id=?) AND (? IS NULL OR e.journey_id=?)
         GROUP BY e.id ORDER BY e.updated_at DESC`,
        account,
        account,
        journeyId ?? null,
        journeyId ?? null,
      );
    },
    async readCached(expenseId: string) {
      const row = await database.getFirstAsync<{ chainJson: string | null }>(
        `SELECT chain_json AS chainJson FROM ledger_expense_conflict_chains WHERE account_id=? AND expense_id=?`,
        await getUser(),
        expenseId,
      );
      return row?.chainJson
        ? expenseConflictChainResponseSchema.parse(JSON.parse(row.chainJson))
        : null;
    },
    async refresh(expenseId: string) {
      const generation = getAccountGeneration();
      const account = await getUser();
      const expense = await database.getFirstAsync<{
        serverId: string | null;
        journeyId: string;
      }>(
        `SELECT server_id AS serverId,journey_id AS journeyId FROM ledger_expenses WHERE id=? AND (local_owner_user_id IS NULL OR local_owner_user_id=?)`,
        expenseId,
        account,
      );
      if (!expense?.serverId)
        throw new Error(
          "The Expense must reach the server before its conflict can be reviewed.",
        );
      const chain = await transport.readConflictChain(
        expense.journeyId,
        expense.serverId,
      );
      await database.withTransactionAsync(async () => {
        if (generation !== getAccountGeneration() || account !== (await getUser()))
          throw new Error("Account changed during conflict read.");
        await storeExpenseConflictMetadata(database, account, expense.journeyId, {
          expenseId: chain.canonical.id,
          chainDigest: chain.chainDigest,
          conflictIds: chain.conflicts.map((c) => c.conflictId),
          openConflictIds: chain.conflicts
            .filter((c) => c.lifecycle === "OPEN")
            .map((c) => c.conflictId),
        });
        await createLedgerExpenseRepository(
          database,
          getUser,
        ).reconcileCanonicalExpenseInTransaction(expenseId, chain.canonical);
        await database.runAsync(
          `UPDATE ledger_expense_conflict_chains SET chain_json=? WHERE account_id=? AND expense_id=?`,
          JSON.stringify(chain),
          account,
          expenseId,
        );
        for (const conflict of chain.conflicts)
          await database.runAsync(
            `UPDATE ledger_expense_conflicts SET status=?,resolved_at=CASE WHEN ?='OPEN' THEN NULL ELSE ? END WHERE conflict_id=? AND expense_id=?`,
            conflict.lifecycle,
            conflict.lifecycle,
            new Date().toISOString(),
            conflict.conflictId,
            expenseId,
          );
        if (generation !== getAccountGeneration() || account !== (await getUser()))
          throw new Error("Account changed during conflict read.");
      });
      return chain;
    },
    async queueResolution(
      expenseId: string,
      input: ExpenseConflictChainResolutionRequest,
    ) {
      const generation = getAccountGeneration();
      const request = expenseConflictChainResolutionRequestSchema.parse(input);
      const account = await getUser();
      const id = createLocalId("ledger-resolution");
      const now = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        if (generation !== getAccountGeneration() || account !== (await getUser()))
          throw new Error("Your account changed. Review this Expense again.");
        const cache = await this.readCached(expenseId);
        if (
          !cache ||
          cache.chainDigest !== request.expectedChainDigest ||
          cache.canonical.revision !== request.currentServerRevision
        )
          throw new Error("Check the latest value before making this decision.");
        const primary = cache.conflicts.find(
          (c) =>
            c.commandId === request.commandId &&
            c.lifecycle === "OPEN" &&
            request.coveredConflictIds.includes(c.conflictId),
        );
        if (!primary) throw new Error("This saved change no longer needs a decision.");
        const pending = await database.getFirstAsync(
          `SELECT id FROM sync_operations WHERE owner_user_id=? AND entity_id=? AND operation_type='LEDGER_RESOLVE_EXPENSE_CONFLICT' AND status IN ('PENDING','PROCESSING','RETRYABLE','DEPENDENCY_BLOCKED')`,
          account,
          expenseId,
        );
        if (pending) throw new Error("Your previous decision is still being applied.");
        await database.runAsync(
          `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,owner_user_id,status,attempt_count,created_at,updated_at)
          VALUES(?,?,'ledger_expense',?,'LEDGER_RESOLVE_EXPENSE_CONFLICT',?,?,?,?,'PENDING',0,?,?)`,
          id,
          cache.canonical.journeyId,
          expenseId,
          createLocalId("ledger-idempotency"),
          request.currentServerRevision,
          JSON.stringify(request),
          account,
          now,
          now,
        );
        if (generation !== getAccountGeneration() || account !== (await getUser()))
          throw new Error("Your account changed. Review this Expense again.");
      });
      announceLedgerQueueWorkAvailable();
      return id;
    },
    async getResolutionResult(expenseId: string) {
      return database.getFirstAsync<{
        operationId: string;
        status: string;
        errorCode: string | null;
        errorMessage: string | null;
        responseJson: string | null;
        payloadJson: string;
      }>(
        `SELECT op.id AS operationId,op.status,op.last_error_code AS errorCode,op.last_error_message AS errorMessage,op.payload_json AS payloadJson,r.response_json AS responseJson
         FROM sync_operations op LEFT JOIN ledger_expense_resolution_receipts r ON r.operation_id=op.id AND r.account_id=op.owner_user_id
         WHERE op.owner_user_id=? AND op.entity_id=? AND op.operation_type='LEDGER_RESOLVE_EXPENSE_CONFLICT' AND json_extract(op.payload_json,'$.contractVersion')=2 ORDER BY op.created_at DESC,op.rowid DESC LIMIT 1`,
        await getUser(),
        expenseId,
      );
    },
  };
}
export async function getDefaultLedgerExpenseConflictRepository() {
  return createLedgerExpenseConflictRepository(await openDatabase());
}
export type { ExpenseConflictChainResponse, ExpenseConflictChainResolutionRequest };
export type { LedgerExpenseDto } from "@/data/api/ledgerReadContracts";
