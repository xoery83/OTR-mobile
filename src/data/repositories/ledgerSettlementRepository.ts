import type * as SQLite from "expo-sqlite";

import type { FinalizedSettlementDto } from "@/data/api/ledgerSettlementContracts";

export type LedgerSettlementDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export function createLedgerSettlementRepository(database: LedgerSettlementDatabase) {
  return {
    async applyFinalized(settlement: FinalizedSettlementDto) {
      await database.withTransactionAsync(() =>
        applyFinalizedSettlement(database, settlement),
      );
    },

    async listFinalized(journeyId: string) {
      const rows = await database.getAllAsync<{ id: string }>(
        `SELECT id FROM ledger_settlements
         WHERE journey_id = ? ORDER BY finalized_at DESC, id`,
        journeyId,
      );
      return Promise.all(rows.map((row) => readSettlement(database, row.id)));
    },

    async hasPendingFinancialOperations(journeyId: string) {
      const row = await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM sync_operations
         WHERE trip_id = ?
           AND entity_type IN ('ledger_expense', 'ledger_payment_record', 'ledger_correction')
           AND status <> 'COMPLETED'`,
        journeyId,
      );
      return (row?.count ?? 0) > 0;
    },

    async canFinalize(journeyId: string) {
      const row = await database.getFirstAsync<{ capabilitiesJson: string }>(
        `SELECT capabilities_json AS capabilitiesJson
         FROM ledger_actor_context WHERE journey_id = ?`,
        journeyId,
      );
      if (!row) return false;
      const capabilities = JSON.parse(row.capabilitiesJson) as {
        canFinalizeSettlement?: boolean;
      };
      return capabilities.canFinalizeSettlement === true;
    },
  };
}

export async function applyFinalizedSettlement(
  database: LedgerSettlementDatabase,
  settlement: FinalizedSettlementDto,
) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_settlements (
      id, journey_id, status, through_timestamp, settlement_currency,
      settlement_scale, settings_revision, algorithm_version, input_digest,
      revision, finalized_by, finalized_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    settlement.id,
    settlement.journeyId,
    settlement.status,
    settlement.throughTimestamp,
    settlement.settlementCurrency,
    settlement.settlementScale,
    settlement.settingsRevision,
    settlement.algorithmVersion,
    settlement.inputDigest,
    settlement.revision,
    settlement.finalizedBy,
    settlement.finalizedAt,
  );
  for (const table of [
    "ledger_settlement_inputs",
    "ledger_settlement_member_balances",
    "ledger_settlement_transfers",
    "ledger_settlement_audit_events",
  ]) {
    await database.runAsync(
      `DELETE FROM ${table} WHERE settlement_id = ?`,
      settlement.id,
    );
  }
  for (const input of settlement.inputs) {
    await database.runAsync(
      `INSERT INTO ledger_settlement_inputs (
        settlement_id, expense_id, expense_revision, normalized_snapshot_json
      ) VALUES (?, ?, ?, ?)`,
      settlement.id,
      input.expenseId,
      input.expenseRevision,
      JSON.stringify(input),
    );
  }
  for (const balance of settlement.balances) {
    await database.runAsync(
      `INSERT INTO ledger_settlement_member_balances (
        settlement_id, member_id, display_name_snapshot, paid_minor, owed_minor,
        transferred_minor, net_minor, currency, scale
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      settlement.id,
      balance.memberId,
      balance.displayNameSnapshot,
      balance.paidMinor,
      balance.owedMinor,
      balance.transferredMinor,
      balance.netMinor,
      balance.currency,
      balance.scale,
    );
  }
  for (const transfer of settlement.transfers) {
    await database.runAsync(
      `INSERT INTO ledger_settlement_transfers (
        id, settlement_id, from_member_id, to_member_id,
        obligation_amount_minor, currency, scale, status, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      transfer.id,
      settlement.id,
      transfer.fromMemberId,
      transfer.toMemberId,
      transfer.amount.minor,
      transfer.amount.currency,
      transfer.amount.scale,
      transfer.status,
      transfer.revision,
    );
  }
  for (const audit of settlement.auditEvents) {
    await database.runAsync(
      `INSERT INTO ledger_settlement_audit_events (
        id, settlement_id, event_type, actor_user_id, actor_member_id,
        reason, settlement_revision, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      audit.id,
      settlement.id,
      audit.eventType,
      audit.actorUserId,
      audit.actorMemberId,
      audit.reason,
      audit.revision,
      audit.createdAt,
    );
  }
}

async function readSettlement(
  database: LedgerSettlementDatabase,
  id: string,
): Promise<FinalizedSettlementDto> {
  const settlement = await database.getFirstAsync<{
    id: string;
    journeyId: string;
    status: "FINALIZED";
    throughTimestamp: string;
    settlementCurrency: string;
    settlementScale: number;
    settingsRevision: number;
    algorithmVersion: "ledger-settlement-greedy-v1";
    inputDigest: string;
    revision: number;
    finalizedBy: string;
    finalizedAt: string;
  }>(
    `SELECT id, journey_id AS journeyId, status,
      through_timestamp AS throughTimestamp,
      settlement_currency AS settlementCurrency,
      settlement_scale AS settlementScale,
      settings_revision AS settingsRevision,
      algorithm_version AS algorithmVersion,
      input_digest AS inputDigest, revision,
      finalized_by AS finalizedBy, finalized_at AS finalizedAt
     FROM ledger_settlements WHERE id = ?`,
    id,
  );
  if (!settlement) throw new Error("Finalized Settlement is missing.");
  const [inputs, balances, transfers, auditEvents] = await Promise.all([
    database.getAllAsync<{ snapshot: string }>(
      `SELECT normalized_snapshot_json AS snapshot
       FROM ledger_settlement_inputs WHERE settlement_id = ? ORDER BY expense_id`,
      id,
    ),
    database.getAllAsync<FinalizedSettlementDto["balances"][number]>(
      `SELECT member_id AS memberId, display_name_snapshot AS displayNameSnapshot,
        paid_minor AS paidMinor, owed_minor AS owedMinor,
        transferred_minor AS transferredMinor, net_minor AS netMinor,
        currency, scale
       FROM ledger_settlement_member_balances
       WHERE settlement_id = ? ORDER BY member_id`,
      id,
    ),
    database.getAllAsync<{
      id: string;
      fromMemberId: string;
      toMemberId: string;
      minor: number;
      currency: string;
      scale: number;
      status: "OPEN";
      revision: number;
    }>(
      `SELECT id, from_member_id AS fromMemberId, to_member_id AS toMemberId,
        obligation_amount_minor AS minor, currency, scale, status, revision
       FROM ledger_settlement_transfers WHERE settlement_id = ? ORDER BY id`,
      id,
    ),
    database.getAllAsync<FinalizedSettlementDto["auditEvents"][number]>(
      `SELECT id, event_type AS eventType, actor_user_id AS actorUserId,
        actor_member_id AS actorMemberId, reason,
        settlement_revision AS revision, created_at AS createdAt
       FROM ledger_settlement_audit_events
       WHERE settlement_id = ? ORDER BY settlement_revision, created_at`,
      id,
    ),
  ]);
  return {
    ...settlement,
    inputs: inputs.map((row) => JSON.parse(row.snapshot)),
    balances,
    transfers: transfers.map((transfer) => ({
      id: transfer.id,
      fromMemberId: transfer.fromMemberId,
      toMemberId: transfer.toMemberId,
      amount: {
        minor: transfer.minor,
        currency: transfer.currency,
        scale: transfer.scale,
      },
      status: transfer.status,
      revision: transfer.revision,
    })),
    auditEvents,
  };
}
