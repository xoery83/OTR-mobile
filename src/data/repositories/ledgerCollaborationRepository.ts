import type * as SQLite from "expo-sqlite";

import type {
  LedgerCorrectionActionRequest,
  LedgerExpenseConflictResponse,
  ResolveLedgerExpenseConflictRequest,
} from "@/data/api/ledgerMutationContracts";
import type { LedgerCorrectionRequest } from "@/data/api/ledgerReadContracts";
import { createLocalId } from "@/domain/localId";

import type { SyncOperation } from "../sync/syncOperationRepository";

type CorrectionDto = LedgerCorrectionRequest;

export type LedgerCollaborationDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export function createLedgerCollaborationRepository(
  database: LedgerCollaborationDatabase,
  getActiveUserId: () => Promise<string> = defaultGetActiveUserId,
) {
  return {
    async recordConflict(
      localExpenseId: string,
      operation: SyncOperation,
      response: LedgerExpenseConflictResponse,
    ) {
      const userId = await getActiveUserId();
      if (operation.ownerUserId !== userId)
        throw new Error("Conflict operation belongs to another account.");
      const now = new Date().toISOString();
      const payload = JSON.parse(operation.payloadJson) as {
        baseExpense?: unknown;
      };
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE ledger_expense_conflicts
           SET status = 'SUPERSEDED', resolved_at = ?
           WHERE expense_id = ? AND status = 'OPEN' AND conflict_id <> ?`,
          now,
          localExpenseId,
          response.error.conflictId,
        );
        await database.runAsync(
          `INSERT OR IGNORE INTO ledger_expense_conflicts (
            conflict_id, journey_id, expense_id, operation_id, base_revision,
            current_revision, base_snapshot_json, submitted_snapshot_json,
            canonical_snapshot_json, changed_groups_json, audit_summaries_json,
            status, created_at, resolved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, NULL)`,
          response.error.conflictId,
          operation.tripId,
          localExpenseId,
          operation.id,
          response.error.baseRevision,
          response.error.currentRevision,
          JSON.stringify(payload.baseExpense ?? response.error.submitted),
          JSON.stringify(response.error.submitted),
          JSON.stringify(response.error.current),
          JSON.stringify(response.error.changedGroups),
          JSON.stringify(response.error.auditSummaries),
          now,
        );
        await database.runAsync(
          "UPDATE ledger_expenses SET sync_status = 'CONFLICT', updated_at = ? WHERE id = ?",
          now,
          localExpenseId,
        );
      });
    },

    getOpenConflict(localExpenseId: string) {
      return database.getFirstAsync<{
        conflictId: string;
        baseRevision: number;
        currentRevision: number;
        baseSnapshotJson: string;
        submittedSnapshotJson: string;
        canonicalSnapshotJson: string;
        changedGroupsJson: string;
      }>(
        `SELECT conflict_id AS conflictId, base_revision AS baseRevision,
          current_revision AS currentRevision, base_snapshot_json AS baseSnapshotJson,
          submitted_snapshot_json AS submittedSnapshotJson,
          canonical_snapshot_json AS canonicalSnapshotJson,
          changed_groups_json AS changedGroupsJson
         FROM ledger_expense_conflicts
         WHERE expense_id = ? AND status = 'OPEN'
         ORDER BY created_at DESC LIMIT 1`,
        localExpenseId,
      );
    },

    async queueConflictResolution(
      localExpenseId: string,
      journeyId: string,
      input: ResolveLedgerExpenseConflictRequest,
    ) {
      const userId = await getActiveUserId();
      const conflict = await database.getFirstAsync<{ canonicalSnapshotJson: string }>(
        `SELECT canonical_snapshot_json AS canonicalSnapshotJson
         FROM ledger_expense_conflicts
         WHERE conflict_id = ? AND expense_id = ? AND status = 'OPEN'`,
        input.conflictId,
        localExpenseId,
      );
      if (!conflict) throw new Error("The conflict is no longer open.");
      await enqueue(database, userId, {
        journeyId,
        entityType: "ledger_expense",
        entityId: localExpenseId,
        operationType: "LEDGER_RESOLVE_EXPENSE_CONFLICT",
        baseVersion: input.currentRevision,
        payload: {
          ...input,
          baseExpense: JSON.parse(conflict.canonicalSnapshotJson),
        },
      });
    },

    async resolveConflict(conflictId: string) {
      await database.runAsync(
        `UPDATE ledger_expense_conflicts SET status = 'RESOLVED', resolved_at = ?
         WHERE conflict_id = ? AND status = 'OPEN'`,
        new Date().toISOString(),
        conflictId,
      );
    },

    async createCorrection(input: {
      journeyId: string;
      expenseId: string;
      expenseServerId: string;
      baseRevision: number;
      proposedExpense: CorrectionDto["proposedExpense"];
      reason: string;
      requestedByMemberId: string;
    }) {
      const userId = await getActiveUserId();
      const id = createLocalId("ledger-correction");
      const now = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `INSERT INTO ledger_correction_requests (
            id, journey_id, expense_id, base_revision, proposed_aggregate_json,
            reason, status, requested_by_member_id, server_revision, sync_status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, 0, 'PENDING_CREATE', ?, ?)`,
          id,
          input.journeyId,
          input.expenseId,
          input.baseRevision,
          JSON.stringify(input.proposedExpense),
          input.reason.trim(),
          input.requestedByMemberId,
          now,
          now,
        );
        await enqueue(database, userId, {
          journeyId: input.journeyId,
          entityType: "ledger_correction",
          entityId: id,
          operationType: "LEDGER_PROPOSE_EXPENSE_CORRECTION",
          baseVersion: input.baseRevision,
          payload: {
            expenseServerId: input.expenseServerId,
            localId: id,
            baseRevision: input.baseRevision,
            proposedExpense: input.proposedExpense,
            reason: input.reason.trim(),
          },
        });
      });
      return id;
    },

    async queueCorrectionAction(
      localCorrectionId: string,
      journeyId: string,
      action: "accept" | "reject" | "withdraw",
      input: LedgerCorrectionActionRequest,
    ) {
      const userId = await getActiveUserId();
      const correction = await database.getFirstAsync<{
        serverId: string | null;
        expenseId: string;
      }>(
        `SELECT server_id AS serverId, expense_id AS expenseId
         FROM ledger_correction_requests WHERE id = ?`,
        localCorrectionId,
      );
      if (!correction?.serverId)
        throw new Error("Correction must sync before resolution.");
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          "UPDATE ledger_correction_requests SET sync_status = 'PENDING_UPDATE', updated_at = ? WHERE id = ?",
          new Date().toISOString(),
          localCorrectionId,
        );
        await enqueue(database, userId, {
          journeyId,
          entityType: "ledger_correction",
          entityId: localCorrectionId,
          operationType: `LEDGER_${action.toUpperCase()}_EXPENSE_CORRECTION`,
          baseVersion: input.baseRequestRevision,
          payload: {
            correctionServerId: correction.serverId,
            expenseLocalId: correction.expenseId,
            action,
            ...input,
          },
        });
      });
    },

    async reconcileCorrection(localId: string, correction: CorrectionDto) {
      await database.runAsync(
        `UPDATE ledger_correction_requests SET
          server_id = ?, journey_id = ?, base_revision = ?, proposed_aggregate_json = ?,
          reason = ?, status = ?, requested_by_user_id = ?, requested_by_member_id = ?,
          resolved_by_user_id = ?, resolved_by_member_id = ?, resolution_reason = ?,
          resulting_expense_revision = ?, server_revision = ?, sync_status = 'SYNCED',
          last_synced_at = ?, updated_at = ? WHERE id = ?`,
        correction.id,
        correction.journeyId,
        correction.baseExpenseRevision,
        JSON.stringify(correction.proposedExpense),
        correction.reason,
        correction.status,
        correction.requestedByUserId,
        correction.requestedByMemberId,
        correction.resolvedByUserId,
        correction.resolvedByMemberId,
        correction.resolutionReason,
        correction.resultingExpenseRevision,
        correction.revision,
        new Date().toISOString(),
        correction.updatedAt,
        localId,
      );
    },

    listCorrections(expenseId: string) {
      return database.getAllAsync<{
        id: string;
        serverId: string | null;
        status: CorrectionDto["status"];
        reason: string;
        proposedAggregateJson: string;
        syncStatus: string;
        serverRevision: number;
      }>(
        `SELECT id, server_id AS serverId, status, reason,
          proposed_aggregate_json AS proposedAggregateJson,
          sync_status AS syncStatus, server_revision AS serverRevision
         FROM ledger_correction_requests WHERE expense_id = ? ORDER BY updated_at DESC`,
        expenseId,
      );
    },
  };
}

async function defaultGetActiveUserId() {
  return (await import("@/data/auth/authRepository")).requireActiveUserId();
}

async function enqueue(
  database: LedgerCollaborationDatabase,
  userId: string,
  input: {
    journeyId: string;
    entityType: string;
    entityId: string;
    operationType: string;
    baseVersion: number;
    payload: unknown;
  },
) {
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO sync_operations (
      id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
      base_version, payload_json, owner_user_id, status, attempt_count, next_attempt_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, NULL, ?, ?)`,
    createLocalId("ledger-operation"),
    input.journeyId,
    input.entityType,
    input.entityId,
    input.operationType,
    createLocalId("ledger-idempotency"),
    input.baseVersion,
    JSON.stringify(input.payload),
    userId,
    now,
    now,
  );
}
