import type * as SQLite from "expo-sqlite";

import type {
  FinalizedSettlementDto,
  RecordSettlementPaymentRequest,
  SettlementAdjustmentFinalizeRequest,
} from "@/data/api/ledgerSettlementContracts";
import {
  assertRepaymentProposition,
  deriveTransferPaymentState,
  type RepaymentProposition,
} from "@/domain/ledger/paymentLifecycle";
import { createLocalId } from "@/domain/localId";

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
           AND entity_type IN (
             'ledger_expense', 'ledger_payment_record', 'ledger_correction',
             'ledger_settlement_adjustment'
           )
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

    async recordPayment(
      transferId: string,
      proposition: RepaymentProposition & {
        paidAt: string;
        evidenceAssetId: string | null;
        notes: string | null;
        reason?: string | null;
      },
    ) {
      const context = await requireLocalTransferContext(database, transferId);
      assertRepaymentProposition(proposition, context.transfer.amount);
      if (
        proposition.assertedDischarge.minor > context.transfer.availableToReport.minor
      ) {
        throw new Error("Payment would exceed available Transfer amount.");
      }
      const reportingAuthority =
        context.actor.memberId === context.transfer.fromMemberId
          ? "PAYER"
          : context.actor.role === "owner" && context.debtorStatus !== "linked"
            ? "ORGANIZER_OVERRIDE"
            : null;
      const reason = proposition.reason?.trim() || null;
      if (!reportingAuthority || (reportingAuthority === "ORGANIZER_OVERRIDE" && !reason))
        throw new Error("This member cannot report the Transfer Payment.");

      const now = new Date().toISOString();
      const id = createLocalId("settlement-payment");
      const valuation = proposition.repaymentValuation
        ? { id: createLocalId("repayment-valuation"), ...proposition.repaymentValuation }
        : null;
      const payment: FinalizedSettlementDto["transfers"][number]["payments"][number] = {
        id,
        transferId,
        status: "AWAITING_CONFIRMATION",
        payment: proposition.payment,
        assertedDischarge: proposition.assertedDischarge,
        repaymentValuation: valuation,
        feeTreatment: proposition.feeTreatment,
        reportedByUserId: context.actor.userId,
        reportedByMemberId: context.actor.memberId,
        reportingAuthority,
        reportingReason: reason,
        paidAt: proposition.paidAt,
        evidenceAssetId: proposition.evidenceAssetId,
        notes: proposition.notes,
        supersedesPaymentId: null,
        revision: 1,
        createdAt: now,
        syncStatus: "PENDING",
        discharge: null,
      };
      const request: RecordSettlementPaymentRequest = {
        localId: id,
        baseTransferRevision: context.transfer.revision,
        payment: proposition.payment,
        assertedDischarge: proposition.assertedDischarge,
        repaymentValuation: proposition.repaymentValuation,
        feeTreatment: proposition.feeTreatment,
        paidAt: proposition.paidAt,
        evidenceAssetId: proposition.evidenceAssetId,
        notes: proposition.notes,
        reportingAuthority,
        reason,
      };
      await database.withTransactionAsync(async () => {
        if (valuation) {
          await database.runAsync(
            `INSERT INTO ledger_repayment_valuation_snapshots (
              id, transfer_id, decimal_rate, source, source_label, effective_at, reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            valuation.id,
            transferId,
            valuation.decimalRate,
            valuation.source,
            valuation.sourceLabel,
            valuation.effectiveAt,
            valuation.reason,
          );
        }
        await insertLocalSettlementPayment(database, payment, "PENDING");
        await enqueueSettlementOperation(
          database,
          context.journeyId,
          id,
          "LEDGER_RECORD_TRANSFER_PAYMENT",
          { transferId, ...request },
          context.transfer.revision,
        );
      });
      return payment;
    },

    async queuePaymentAction(
      paymentId: string,
      action: "confirm" | "reject" | "dispute",
      reason: string | null,
      authority?: "PAYER" | "RECIPIENT" | "ORGANIZER_OVERRIDE",
    ) {
      const context = await requireLocalPaymentContext(database, paymentId);
      if (context.payment.status !== "AWAITING_CONFIRMATION")
        throw new Error("Payment is no longer awaiting confirmation.");
      const normalizedReason = reason?.trim() || null;
      if (action !== "confirm" && !normalizedReason)
        throw new Error("A reason is required.");
      const inferredAuthority =
        authority ??
        (context.actor.memberId === context.transfer.fromMemberId
          ? "PAYER"
          : context.actor.memberId === context.transfer.toMemberId
            ? "RECIPIENT"
            : "ORGANIZER_OVERRIDE");
      await enqueueSettlementOperation(
        database,
        context.journeyId,
        paymentId,
        `LEDGER_${action.toUpperCase()}_TRANSFER_PAYMENT`,
        {
          basePaymentRevision: context.payment.revision,
          authority: inferredAuthority,
          reason: normalizedReason,
        },
        context.payment.revision,
      );
    },

    async correctPayment(
      paymentId: string,
      proposition: RepaymentProposition & {
        paidAt: string;
        evidenceAssetId: string | null;
        notes: string | null;
      },
      reason: string,
    ) {
      const context = await requireLocalPaymentContext(database, paymentId);
      const normalizedReason = reason.trim();
      if (context.actor.role !== "owner" || !normalizedReason)
        throw new Error("Organizer Payment correction requires a reason.");
      if (context.payment.status === "CONFIRMED")
        throw new Error("Confirmed Payment requires a later Adjustment.");
      assertRepaymentProposition(proposition, context.transfer.amount);
      const released =
        context.payment.status === "AWAITING_CONFIRMATION"
          ? context.payment.assertedDischarge.minor
          : 0;
      if (
        proposition.assertedDischarge.minor >
        context.transfer.availableToReport.minor + released
      ) {
        throw new Error("Corrected Payment would exceed available Transfer amount.");
      }
      const id = createLocalId("settlement-payment");
      const now = new Date().toISOString();
      const valuation = proposition.repaymentValuation
        ? { id: createLocalId("repayment-valuation"), ...proposition.repaymentValuation }
        : null;
      const replacement: FinalizedSettlementDto["transfers"][number]["payments"][number] =
        {
          id,
          transferId: context.transfer.id,
          status: "AWAITING_CONFIRMATION",
          payment: proposition.payment,
          assertedDischarge: proposition.assertedDischarge,
          repaymentValuation: valuation,
          feeTreatment: proposition.feeTreatment,
          reportedByUserId: context.actor.userId,
          reportedByMemberId: context.actor.memberId,
          reportingAuthority: "ORGANIZER_OVERRIDE",
          reportingReason: normalizedReason,
          paidAt: proposition.paidAt,
          evidenceAssetId: proposition.evidenceAssetId,
          notes: proposition.notes,
          supersedesPaymentId: paymentId,
          revision: 1,
          createdAt: now,
          syncStatus: "PENDING",
          discharge: null,
        };
      await database.withTransactionAsync(async () => {
        if (context.payment.status === "AWAITING_CONFIRMATION") {
          await database.runAsync(
            `UPDATE ledger_settlement_payments
             SET status = 'CORRECTED' WHERE id = ?`,
            paymentId,
          );
        }
        if (valuation) {
          await database.runAsync(
            `INSERT INTO ledger_repayment_valuation_snapshots (
              id, transfer_id, decimal_rate, source, source_label, effective_at, reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            valuation.id,
            context.transfer.id,
            valuation.decimalRate,
            valuation.source,
            valuation.sourceLabel,
            valuation.effectiveAt,
            valuation.reason,
          );
        }
        await insertLocalSettlementPayment(database, replacement, "PENDING");
        await enqueueSettlementOperation(
          database,
          context.journeyId,
          id,
          "LEDGER_CORRECT_TRANSFER_PAYMENT",
          {
            paymentId,
            replacementLocalId: id,
            basePaymentRevision: context.payment.revision,
            payment: proposition.payment,
            assertedDischarge: proposition.assertedDischarge,
            repaymentValuation: proposition.repaymentValuation,
            feeTreatment: proposition.feeTreatment,
            paidAt: proposition.paidAt,
            evidenceAssetId: proposition.evidenceAssetId,
            notes: proposition.notes,
            reason: normalizedReason,
          },
          context.payment.revision,
        );
      });
      return replacement;
    },

    async applyPaymentMutation(settlement: FinalizedSettlementDto) {
      await database.withTransactionAsync(() =>
        applyFinalizedSettlement(database, settlement),
      );
    },

    async queueAdjustment(
      journeyId: string,
      rootSettlementId: string,
      input: SettlementAdjustmentFinalizeRequest,
    ) {
      if (!(await this.isOrganizer(journeyId)))
        throw new Error("Organizer Adjustment access is required.");
      await enqueueSettlementOperation(
        database,
        journeyId,
        rootSettlementId,
        "LEDGER_FINALIZE_SETTLEMENT_ADJUSTMENT",
        { rootSettlementId, ...input },
        0,
        "ledger_settlement_adjustment",
      );
    },

    async getActorMemberId(journeyId: string) {
      const row = await database.getFirstAsync<{ memberId: string | null }>(
        `SELECT member_id AS memberId FROM ledger_actor_context WHERE journey_id = ?`,
        journeyId,
      );
      return row?.memberId ?? null;
    },

    async isOrganizer(journeyId: string) {
      const row = await database.getFirstAsync<{ role: string | null }>(
        `SELECT role FROM ledger_actor_context WHERE journey_id = ?`,
        journeyId,
      );
      return row?.role === "owner";
    },
  };
}

async function enqueueSettlementOperation(
  database: LedgerSettlementDatabase,
  journeyId: string,
  entityId: string,
  operationType: string,
  payload: unknown,
  baseVersion: number,
  entityType = "ledger_settlement_payment",
) {
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO sync_operations (
      id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
      base_version, payload_json, status, attempt_count, next_attempt_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, NULL, ?, ?)`,
    createLocalId("ledger-operation"),
    journeyId,
    entityType,
    entityId,
    operationType,
    createLocalId("ledger-idempotency"),
    baseVersion,
    JSON.stringify(payload),
    now,
    now,
  );
}

async function requireLocalTransferContext(
  database: LedgerSettlementDatabase,
  transferId: string,
) {
  const row = await database.getFirstAsync<{
    settlementId: string;
    journeyId: string;
    debtorStatus: string | null;
  }>(
    `SELECT t.settlement_id AS settlementId, s.journey_id AS journeyId,
      m.status AS debtorStatus
     FROM ledger_settlement_transfers t
     JOIN ledger_settlements s ON s.id = t.settlement_id
     LEFT JOIN ledger_members m ON m.id = t.from_member_id
     WHERE t.id = ?`,
    transferId,
  );
  if (!row) throw new Error("Settlement Transfer was not found.");
  const settlement = await readSettlement(database, row.settlementId);
  const transfer = settlement.transfers.find((item) => item.id === transferId);
  if (!transfer) throw new Error("Settlement Transfer was not found.");
  const actor = await database.getFirstAsync<{
    memberId: string | null;
    userId: string | null;
    role: string | null;
  }>(
    `SELECT member_id AS memberId, user_id AS userId, role
     FROM ledger_actor_context WHERE journey_id = ?`,
    row.journeyId,
  );
  if (!actor?.memberId || !actor.userId) throw new Error("Ledger actor is unavailable.");
  return {
    journeyId: row.journeyId,
    transfer,
    debtorStatus: row.debtorStatus,
    actor: { memberId: actor.memberId, userId: actor.userId, role: actor.role },
  };
}

async function requireLocalPaymentContext(
  database: LedgerSettlementDatabase,
  paymentId: string,
) {
  const row = await database.getFirstAsync<{ transferId: string }>(
    `SELECT transfer_id AS transferId FROM ledger_settlement_payments WHERE id = ?`,
    paymentId,
  );
  if (!row) throw new Error("Settlement Payment was not found.");
  const context = await requireLocalTransferContext(database, row.transferId);
  const payment = context.transfer.payments.find((item) => item.id === paymentId);
  if (!payment) throw new Error("Settlement Payment was not found.");
  return { ...context, payment };
}

export async function applyFinalizedSettlement(
  database: LedgerSettlementDatabase,
  settlement: FinalizedSettlementDto,
) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_settlements (
      id, journey_id, status, through_timestamp, settlement_currency,
      settlement_scale, settings_revision, algorithm_version, input_digest,
      revision, finalized_by, finalized_at, settlement_kind, root_settlement_id,
      parent_adjustment_id, lineage_sequence, prior_input_digest,
      adjustment_reason, eligibility_version, adjustment_state,
      lineage_head_id, outstanding_balances_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    settlement.kind ?? "ROOT",
    settlement.rootSettlementId ?? null,
    settlement.parentAdjustmentId ?? null,
    settlement.lineageSequence ?? 0,
    settlement.priorInputDigest ?? null,
    settlement.adjustmentReason ?? null,
    settlement.eligibilityVersion ?? "ledger-settlement-eligibility-v1",
    settlement.adjustmentState ?? null,
    settlement.lineageHeadId ?? null,
    settlement.outstandingBalances
      ? JSON.stringify(settlement.outstandingBalances)
      : null,
  );
  for (const table of [
    "ledger_settlement_inputs",
    "ledger_settlement_member_balances",
    "ledger_settlement_adjustment_deltas",
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
  for (const delta of settlement.adjustmentDeltas ?? []) {
    await database.runAsync(
      `INSERT INTO ledger_settlement_adjustment_deltas (
        settlement_id, member_id, display_name_snapshot, delta_minor, currency, scale
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      settlement.id,
      delta.memberId,
      delta.displayNameSnapshot,
      delta.deltaMinor,
      delta.currency,
      delta.scale,
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
        reason, settlement_revision, transfer_id, payment_id, discharge_id,
        authority, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      audit.id,
      settlement.id,
      audit.eventType,
      audit.actorUserId,
      audit.actorMemberId,
      audit.reason,
      audit.revision,
      audit.transferId,
      audit.paymentId,
      audit.dischargeId,
      audit.authority,
      audit.createdAt,
    );
  }
  for (const transfer of settlement.transfers) {
    for (const payment of transfer.payments) {
      if (payment.repaymentValuation) {
        const valuation = payment.repaymentValuation;
        await database.runAsync(
          `INSERT OR REPLACE INTO ledger_repayment_valuation_snapshots (
            id, transfer_id, decimal_rate, source, source_label, effective_at, reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          valuation.id,
          transfer.id,
          valuation.decimalRate,
          valuation.source,
          valuation.sourceLabel,
          valuation.effectiveAt,
          valuation.reason,
        );
      }
      await insertLocalSettlementPayment(database, payment, "SYNCED");
      if (payment.discharge) {
        const discharge = payment.discharge;
        await database.runAsync(
          `INSERT OR REPLACE INTO ledger_settlement_payment_discharges (
            id, payment_id, amount_minor, settlement_currency, settlement_scale,
            confirmation_authority, confirmed_by_user_id, confirmed_by_member_id,
            reason, confirmed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          discharge.id,
          payment.id,
          discharge.amount.minor,
          discharge.amount.currency,
          discharge.amount.scale,
          discharge.confirmationAuthority,
          discharge.confirmedByUserId,
          discharge.confirmedByMemberId,
          discharge.reason,
          discharge.confirmedAt,
        );
      }
    }
  }
}

async function insertLocalSettlementPayment(
  database: LedgerSettlementDatabase,
  payment: FinalizedSettlementDto["transfers"][number]["payments"][number],
  syncStatus: "PENDING" | "SYNCED" | "FAILED",
) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_settlement_payments (
      id, transfer_id, status, payment_amount_minor, payment_currency,
      payment_scale, asserted_discharge_minor, settlement_currency,
      settlement_scale, repayment_valuation_snapshot_id, fee_amount_minor,
      fee_currency, fee_scale, fee_borne_by, reported_by_user_id,
      reported_by_member_id, reporting_authority, reporting_reason, paid_at,
      evidence_asset_id, notes, supersedes_payment_id, revision, sync_status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    payment.id,
    payment.transferId,
    payment.status,
    payment.payment.minor,
    payment.payment.currency,
    payment.payment.scale,
    payment.assertedDischarge.minor,
    payment.assertedDischarge.currency,
    payment.assertedDischarge.scale,
    payment.repaymentValuation?.id ?? null,
    payment.feeTreatment?.fee.minor ?? null,
    payment.feeTreatment?.fee.currency ?? null,
    payment.feeTreatment?.fee.scale ?? null,
    payment.feeTreatment?.borneBy ?? null,
    payment.reportedByUserId || null,
    payment.reportedByMemberId || null,
    payment.reportingAuthority,
    payment.reportingReason,
    payment.paidAt,
    payment.evidenceAssetId,
    payment.notes,
    payment.supersedesPaymentId,
    payment.revision,
    syncStatus,
    payment.createdAt,
  );
}

async function readSettlement(
  database: LedgerSettlementDatabase,
  id: string,
): Promise<FinalizedSettlementDto> {
  const settlement = await database.getFirstAsync<{
    id: string;
    journeyId: string;
    status: FinalizedSettlementDto["status"];
    throughTimestamp: string;
    settlementCurrency: string;
    settlementScale: number;
    settingsRevision: number;
    algorithmVersion: "ledger-settlement-greedy-v1";
    inputDigest: string;
    revision: number;
    finalizedBy: string;
    finalizedAt: string;
    kind: "ROOT" | "ADJUSTMENT";
    rootSettlementId: string | null;
    parentAdjustmentId: string | null;
    lineageSequence: number;
    priorInputDigest: string | null;
    adjustmentReason: string | null;
    eligibilityVersion: string;
    adjustmentState: FinalizedSettlementDto["adjustmentState"] | null;
    lineageHeadId: string | null;
    outstandingBalancesJson: string | null;
  }>(
    `SELECT id, journey_id AS journeyId, status,
      through_timestamp AS throughTimestamp,
      settlement_currency AS settlementCurrency,
      settlement_scale AS settlementScale,
      settings_revision AS settingsRevision,
      algorithm_version AS algorithmVersion,
      input_digest AS inputDigest, revision,
      finalized_by AS finalizedBy, finalized_at AS finalizedAt,
      settlement_kind AS kind, root_settlement_id AS rootSettlementId,
      parent_adjustment_id AS parentAdjustmentId,
      lineage_sequence AS lineageSequence, prior_input_digest AS priorInputDigest,
      adjustment_reason AS adjustmentReason, eligibility_version AS eligibilityVersion,
      adjustment_state AS adjustmentState, lineage_head_id AS lineageHeadId,
      outstanding_balances_json AS outstandingBalancesJson
     FROM ledger_settlements WHERE id = ?`,
    id,
  );
  if (!settlement) throw new Error("Finalized Settlement is missing.");
  const [inputs, balances, adjustmentDeltas, transfers, auditEvents] = await Promise.all([
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
    database.getAllAsync<NonNullable<FinalizedSettlementDto["adjustmentDeltas"]>[number]>(
      `SELECT member_id AS memberId, display_name_snapshot AS displayNameSnapshot,
        delta_minor AS deltaMinor, currency, scale
       FROM ledger_settlement_adjustment_deltas
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
      status: FinalizedSettlementDto["transfers"][number]["status"];
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
        settlement_revision AS revision, transfer_id AS transferId,
        payment_id AS paymentId, discharge_id AS dischargeId, authority,
        created_at AS createdAt
       FROM ledger_settlement_audit_events
       WHERE settlement_id = ? ORDER BY settlement_revision, created_at`,
      id,
    ),
  ]);
  const transferIds = transfers.map((transfer) => transfer.id);
  const paymentRows = transferIds.length
    ? await database.getAllAsync<{
        id: string;
        transferId: string;
        status: FinalizedSettlementDto["transfers"][number]["payments"][number]["status"];
        paymentMinor: number;
        paymentCurrency: string;
        paymentScale: number;
        dischargeMinor: number;
        settlementCurrency: string;
        settlementScale: number;
        valuationId: string | null;
        feeMinor: number | null;
        feeCurrency: string | null;
        feeScale: number | null;
        feeBorneBy: "DEBTOR" | "CREDITOR" | "SHARED" | null;
        reportedByUserId: string | null;
        reportedByMemberId: string | null;
        reportingAuthority: "PAYER" | "ORGANIZER_OVERRIDE";
        reportingReason: string | null;
        paidAt: string;
        evidenceAssetId: string | null;
        notes: string | null;
        supersedesPaymentId: string | null;
        revision: number;
        syncStatus: "PENDING" | "SYNCED" | "FAILED";
        createdAt: string;
      }>(
        `SELECT id, transfer_id AS transferId, status,
          payment_amount_minor AS paymentMinor, payment_currency AS paymentCurrency,
          payment_scale AS paymentScale,
          asserted_discharge_minor AS dischargeMinor,
          settlement_currency AS settlementCurrency,
          settlement_scale AS settlementScale,
          repayment_valuation_snapshot_id AS valuationId,
          fee_amount_minor AS feeMinor, fee_currency AS feeCurrency,
          fee_scale AS feeScale, fee_borne_by AS feeBorneBy,
          reported_by_user_id AS reportedByUserId,
          reported_by_member_id AS reportedByMemberId,
          reporting_authority AS reportingAuthority,
          reporting_reason AS reportingReason, paid_at AS paidAt,
          evidence_asset_id AS evidenceAssetId, notes,
          supersedes_payment_id AS supersedesPaymentId, revision,
          sync_status AS syncStatus, created_at AS createdAt
         FROM ledger_settlement_payments
         WHERE transfer_id IN (${transferIds.map(() => "?").join(",")})
         ORDER BY created_at, id`,
        ...transferIds,
      )
    : [];
  const [valuationRows, dischargeRows] = await Promise.all([
    database.getAllAsync<{
      id: string;
      decimalRate: string;
      source: "REFERENCE_RATE" | "MANUAL_AGREED";
      sourceLabel: string;
      effectiveAt: string;
      reason: string | null;
    }>(
      `SELECT id, decimal_rate AS decimalRate, source,
        source_label AS sourceLabel, effective_at AS effectiveAt, reason
       FROM ledger_repayment_valuation_snapshots`,
    ),
    database.getAllAsync<{
      id: string;
      paymentId: string;
      amountMinor: number;
      currency: string;
      scale: number;
      confirmationAuthority: "RECIPIENT" | "ORGANIZER_OVERRIDE";
      confirmedByUserId: string;
      confirmedByMemberId: string;
      reason: string | null;
      confirmedAt: string;
    }>(
      `SELECT id, payment_id AS paymentId, amount_minor AS amountMinor,
        settlement_currency AS currency, settlement_scale AS scale,
        confirmation_authority AS confirmationAuthority,
        confirmed_by_user_id AS confirmedByUserId,
        confirmed_by_member_id AS confirmedByMemberId, reason,
        confirmed_at AS confirmedAt
       FROM ledger_settlement_payment_discharges`,
    ),
  ]);
  const mappedTransfers = transfers.map((transfer) => {
    const payments = paymentRows
      .filter((payment) => payment.transferId === transfer.id)
      .map((payment) => {
        const valuation = valuationRows.find((row) => row.id === payment.valuationId);
        const discharge = dischargeRows.find((row) => row.paymentId === payment.id);
        return {
          id: payment.id,
          transferId: payment.transferId,
          status: payment.status,
          payment: {
            minor: payment.paymentMinor,
            currency: payment.paymentCurrency,
            scale: payment.paymentScale,
          },
          assertedDischarge: {
            minor: payment.dischargeMinor,
            currency: payment.settlementCurrency,
            scale: payment.settlementScale,
          },
          repaymentValuation: valuation ?? null,
          feeTreatment:
            payment.feeMinor === null
              ? null
              : {
                  fee: {
                    minor: payment.feeMinor,
                    currency: payment.feeCurrency!,
                    scale: payment.feeScale!,
                  },
                  borneBy: payment.feeBorneBy!,
                },
          reportedByUserId: payment.reportedByUserId ?? payment.reportedByMemberId!,
          reportedByMemberId: payment.reportedByMemberId!,
          reportingAuthority: payment.reportingAuthority,
          reportingReason: payment.reportingReason,
          paidAt: payment.paidAt,
          evidenceAssetId: payment.evidenceAssetId,
          notes: payment.notes,
          supersedesPaymentId: payment.supersedesPaymentId,
          revision: payment.revision,
          createdAt: payment.createdAt,
          syncStatus: payment.syncStatus,
          discharge: discharge
            ? {
                id: discharge.id,
                amount: {
                  minor: discharge.amountMinor,
                  currency: discharge.currency,
                  scale: discharge.scale,
                },
                confirmationAuthority: discharge.confirmationAuthority,
                confirmedByUserId: discharge.confirmedByUserId,
                confirmedByMemberId: discharge.confirmedByMemberId,
                reason: discharge.reason,
                confirmedAt: discharge.confirmedAt,
              }
            : null,
        };
      });
    const amounts = deriveTransferPaymentState(
      transfer.minor,
      payments.map((payment) => ({
        status: payment.status,
        assertedDischargeMinor: payment.assertedDischarge.minor,
        dischargeMinor: payment.discharge?.amount.minor ?? null,
      })),
    );
    const money = (minor: number) => ({
      minor,
      currency: transfer.currency,
      scale: transfer.scale,
    });
    return {
      id: transfer.id,
      fromMemberId: transfer.fromMemberId,
      toMemberId: transfer.toMemberId,
      amount: money(transfer.minor),
      confirmedDischarge: money(amounts.confirmedDischargeMinor),
      confirmedRemaining: money(amounts.confirmedRemainingMinor),
      awaitingAmount: money(amounts.awaitingAmountMinor),
      availableToReport: money(amounts.availableToReportMinor),
      status: amounts.status,
      revision: transfer.revision,
      payments,
    };
  });
  return {
    ...settlement,
    adjustmentState: settlement.adjustmentState ?? undefined,
    outstandingBalances: settlement.outstandingBalancesJson
      ? JSON.parse(settlement.outstandingBalancesJson)
      : undefined,
    inputs: inputs.map((row) => JSON.parse(row.snapshot)),
    balances,
    adjustmentDeltas,
    transfers: mappedTransfers,
    auditEvents,
  };
}
