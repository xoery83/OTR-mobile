import type * as SQLite from "expo-sqlite";

import { ApiClientError } from "@/data/api/client";
import { createLocalId } from "@/domain/localId";

import {
  planDataHealthRepairs,
  type DataHealthOperationEvidence,
  type DataHealthRepairActionId,
  type DataHealthRepairPlan,
} from "./dataHealthRepairPolicy";

export type DataHealthCategory =
  | "HEALTHY"
  | "RETRYABLE"
  | "AUTH_PAUSED"
  | "DEPENDENCY_BLOCKED"
  | "ACTIONABLE_INPUT"
  | "CONFLICT"
  | "MIRROR_STALE"
  | "ORPHAN_REBUILDABLE"
  | "PROTECTED_LOCAL"
  | "ISOLATION_VIOLATION"
  | "UNRECOVERABLE_INPUT";

export type DataHealthOutcome = "HEALTHY" | "WAITING" | "NEEDS_ATTENTION";
export type DataHealthTrigger = "CHEAP" | "DEEP" | "MANUAL";
export type DataHealthConvergenceState =
  | "UP_TO_DATE"
  | "RECOVERED"
  | "REFRESHED"
  | "LOCAL_REPAIRED_WAITING"
  | "WAITING"
  | "NEEDS_ATTENTION"
  | "PROTECTED";

export type DataHealthConvergence = {
  state: DataHealthConvergenceState;
  localRepairCount: number;
  recoveredChangeCount: number;
  refreshedJourneyCount: number;
  syncAttempted: boolean;
};

export type DataHealthFinding = {
  ruleId: string;
  category: Exclude<DataHealthCategory, "HEALTHY">;
  journeyId: string | null;
  targetType: string;
  targetId: string;
  inputDigest: string;
};

export type DataHealthReport = {
  accountId: string;
  generation: number;
  trigger: DataHealthTrigger;
  outcome: DataHealthOutcome;
  reportDigest: string;
  journeyCount: number;
  protectedIntentCount: number;
  findings: DataHealthFinding[];
  repairPlans: DataHealthRepairPlan[];
  counts: Partial<Record<DataHealthCategory, number>>;
  convergence?: DataHealthConvergence;
};

export type DataHealthRuleDefinition = {
  id: string;
  detection: string;
  protectedState: string;
  futureDisposition: string;
  verification: string;
  possibleEscalation: string | null;
};

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

type Operation = {
  id: string;
  journeyId: string | null;
  entityType: string;
  entityId: string;
  operationType: string;
  status: string;
  attemptCount: number;
  failureCategory: string | null;
  errorCode: string | null;
  nextAttemptAt: string | null;
  leaseExpiresAt: string | null;
  dependencyOperationId: string | null;
  dependencyStatus: string | null;
  dependencyJourneyId: string | null;
  dependencyEntityId: string | null;
  serverIdentityAvailable: number;
};

type Expense = {
  id: string;
  journeyId: string;
  serverId: string | null;
  revision: number;
  serverRevision: number;
  syncStatus: string;
  localOwnerUserId: string | null;
  businessStatus: string;
};

type PersonalPayment = {
  id: string;
  journeyId: string;
  serverRevision: number;
  syncStatus: string;
  revision: number;
  amountMinor: number;
  currency: string;
  scale: number;
  economicDate: string | null;
};

type AssetOperation = {
  id: string;
  journeyId: string;
  assetId: string;
  operationType: string;
  status: string;
  attemptCount: number;
  failureCategory: string | null;
  errorCode: string | null;
  nextAttemptAt: string | null;
  leaseExpiresAt: string | null;
  dependencyOperationId: string | null;
  dependencyStatus: string | null;
  dependencyJourneyId: string | null;
  dependencyEntityId: string | null;
  serverIdentityAvailable: number;
};

type Receipt = {
  id: string;
  journeyId: string;
  serverId: string | null;
  localUri: string | null;
  uploadStatus: string;
  localOwnerUserId: string | null;
};

type Cursor = {
  kind: "LEDGER" | "PERSONAL_PAYMENT";
  journeyId: string;
  cursor: string | null;
};

type DeferredChange = { journeyId: string; entityId: string; revision: number };

type ExpenseValuation = {
  id: string;
  journeyId: string;
  expenseId: string;
  expenseRevision: number;
  currentRevision: number;
  originalAmountMinor: number;
  currentAmountMinor: number;
  originalCurrency: string;
  currentCurrency: string;
  originalScale: number;
  currentScale: number;
  settlementCurrency: string;
  journeyCurrency: string;
  settlementScale: number;
  journeyScale: number;
};

type PaymentProjection = {
  id: string;
  journeyId: string;
  paymentId: string;
  state: string;
  failureCategory: string | null;
  sourcePaymentRevision: number;
  paymentRevision: number;
  originalAmountMinor: number;
  paymentAmountMinor: number;
  originalCurrency: string;
  paymentCurrency: string;
  originalScale: number;
  paymentScale: number;
  economicDate: string;
  paymentEconomicDate: string | null;
};

type ReviewState = {
  journeyId: string;
  syncStatus: string;
  pendingOperationId: string | null;
};

type ReviewFinding = {
  id: string;
  journeyId: string;
  expenseId: string | null;
  targetSourceRevision: number | null;
  expenseRevision: number | null;
};

type Manifest = {
  accountId: string;
  generation: number;
  journeyIds: string[];
  operations: Operation[];
  expenses: Expense[];
  personalPayments: PersonalPayment[];
  assetOperations: AssetOperation[];
  receipts: Receipt[];
  cursors: Cursor[];
  deferredChanges: DeferredChange[];
  expenseValuations: ExpenseValuation[];
  paymentProjections: PaymentProjection[];
  reviewStates: ReviewState[];
  reviewFindings: ReviewFinding[];
};

type RepairEvent = {
  id: string;
  targetType: string;
  targetId: string;
  action: DataHealthRepairActionId;
};

export type DataHealthDependencies = {
  database: Database;
  getActiveAccountId(): Promise<string>;
  getAccountGeneration(): number;
  fileExists(uri: string): Promise<boolean | null>;
  runOperationalSync?(): Promise<void>;
  refreshJourneyLedger?(journeyId: string): Promise<boolean>;
  now?(): Date;
};

export class DataHealthScopeChangedError extends Error {
  constructor() {
    super("The active account changed during the data health scan.");
    this.name = "DataHealthScopeChangedError";
  }
}

const ATTENTION = new Set<DataHealthCategory>([
  "ACTIONABLE_INPUT",
  "CONFLICT",
  "ISOLATION_VIOLATION",
  "UNRECOVERABLE_INPUT",
]);
const VERIFIED_REPAIR_EVENT_LIMIT = 200;

export const dataHealthRules: readonly DataHealthRuleDefinition[] = [
  {
    id: "DH_SYNC_OPERATION_STATE_V1",
    detection: "Active-account non-completed operation classification",
    protectedState: "Operation identity, entity identity, and causal dependency",
    futureDisposition: "Phase C may reclassify or resume only through the existing queue",
    verification: "Operation completes or remains durably classified",
    possibleEscalation: "Structured input, permission, or conflict action",
  },
  {
    id: "DH_LOCAL_ENTITY_INTENT_V1",
    detection: "Active-account local-only or unsynced Expense/Personal Payment",
    protectedState: "Local aggregate and known server identity/revision baseline",
    futureDisposition: "Phase C may reconcile through its existing mutation path",
    verification: "Server identity and current local intent converge",
    possibleEscalation: "Structured validation or genuine conflict",
  },
  {
    id: "DH_RECEIPT_ORIGINAL_V1",
    detection: "Active-account receipt original and pending asset operation state",
    protectedState: "Local file identity, hash metadata, and link/upload intent",
    futureDisposition: "Phase C may use the existing authenticated hash gate",
    verification: "Original exists or exact remote recovery is proven",
    possibleEscalation: "User reattaches an irreplaceable missing original",
  },
  {
    id: "DH_CURSOR_SCOPE_V1",
    detection: "Account cursor has authorized Journey scope and nonblank value",
    protectedState: "Local intent in that account/Journey remains untouched",
    futureDisposition: "Phase C may replace only through scoped reconciliation",
    verification: "A subsequent continuation is valid",
    possibleEscalation: "Repeated server contract failure",
  },
  {
    id: "DH_DEFERRED_CHANGE_V1",
    detection: "Authorized Journey retains a deferred server Expense change",
    protectedState: "Local mutation and deferred server revision",
    futureDisposition: "Phase C may drain through normal reconciliation",
    verification: "Deferred row is absent after convergence",
    possibleEscalation: "Unmergeable revision conflict",
  },
  {
    id: "DH_EXPENSE_FX_BINDING_V1",
    detection: "Active Expense valuation disagrees with its source revision or Money",
    protectedState: "Original Money and immutable accepted evidence",
    futureDisposition: "Phase C may rebuild only the derived active selection",
    verification: "Active valuation binds the exact current source",
    possibleEscalation: "Manual-required valuation input",
  },
  {
    id: "DH_PERSONAL_PAYMENT_FX_BINDING_V1",
    detection: "Current-target Personal Payment projection source no longer matches",
    protectedState: "Original Payment and historical target evidence",
    futureDisposition: "Phase C may reuse the existing projection/scanner path",
    verification: "Confirmed current-target projection matches source input",
    possibleEscalation: null,
  },
  {
    id: "DH_REVIEW_DERIVED_STATE_V1",
    detection:
      "Pending Review intent or active finding bound to an older source revision",
    protectedState: "Pending actor action and immutable finding history",
    futureDisposition: "Phase C may refresh derived projection with pending overlay",
    verification: "Projection and actor decision revisions agree",
    possibleEscalation: "True action conflict",
  },
  {
    id: "DH_ACCOUNT_JOURNEY_ISOLATION_V1",
    detection: "Active-account owned state lacks matching cached actor authorization",
    protectedState: "Affected rows remain frozen and hidden from other accounts",
    futureDisposition: "Phase C requires scoped authorization proof before mutation",
    verification: "Account and Journey scope are proven by authorized state",
    possibleEscalation: "Security/support review",
  },
] as const;

export function createDataHealthCoordinator(dependencies: DataHealthDependencies) {
  const now = dependencies.now ?? (() => new Date());

  const coordinator = {
    async run(trigger: DataHealthTrigger = "MANUAL"): Promise<DataHealthReport> {
      const accountId = await dependencies.getActiveAccountId();
      const generation = dependencies.getAccountGeneration();
      const planningTime = now();
      const startedAt = planningTime.toISOString();
      let manifest: Manifest | null = null;
      let runGeneration = 1;

      await dependencies.database.withTransactionAsync(async () => {
        const state = await dependencies.database.getFirstAsync<{
          runGeneration: number;
        }>(
          `SELECT run_generation AS runGeneration FROM data_health_state
           WHERE account_id = ?`,
          accountId,
        );
        runGeneration = (state?.runGeneration ?? 0) + 1;
        manifest = await buildManifest(dependencies.database, accountId, generation);
        await dependencies.database.runAsync(
          `INSERT INTO data_health_state (
             account_id, run_generation, run_state, updated_at
           ) VALUES (?, ?, 'RUNNING', ?)
           ON CONFLICT(account_id) DO UPDATE SET
             run_generation = excluded.run_generation,
             run_state = 'RUNNING', updated_at = excluded.updated_at`,
          accountId,
          runGeneration,
          startedAt,
        );
      });

      await assertScope(dependencies, accountId, generation);
      const findings = await detectFindings(manifest!, dependencies.fileExists);
      await assertScope(dependencies, accountId, generation);

      const sorted = findings.sort(compareFinding);
      const repairPlans = planDataHealthRepairs({
        accountId,
        generation,
        findings: sorted,
        operationEvidence: operationEvidence(manifest!),
        now: planningTime,
      });
      const counts: Partial<Record<DataHealthCategory, number>> = {};
      for (const finding of sorted)
        counts[finding.category] = (counts[finding.category] ?? 0) + 1;
      const attentionCount = sorted.filter((finding) =>
        ATTENTION.has(finding.category),
      ).length;
      const outcome: DataHealthOutcome = attentionCount
        ? "NEEDS_ATTENTION"
        : sorted.length
          ? "WAITING"
          : "HEALTHY";
      const reportDigest = digest(
        sorted.map((finding) =>
          [
            finding.ruleId,
            finding.category,
            finding.journeyId ?? "",
            finding.targetType,
            finding.targetId,
            finding.inputDigest,
          ].join(":"),
        ),
      );
      const completedAt = now().toISOString();

      await assertScope(dependencies, accountId, generation);
      await dependencies.database.runAsync(
        `UPDATE data_health_state SET
           run_state = 'COMPLETED',
           last_cheap_scan_at = CASE WHEN ? = 'CHEAP' THEN ? ELSE last_cheap_scan_at END,
           last_deep_scan_at = CASE WHEN ? = 'DEEP' THEN ? ELSE last_deep_scan_at END,
           last_manual_scan_at = CASE WHEN ? = 'MANUAL' THEN ? ELSE last_manual_scan_at END,
           last_aggregate_outcome = ?, last_report_digest = ?,
           last_finding_count = ?, last_attention_count = ?, updated_at = ?
         WHERE account_id = ? AND run_generation = ?`,
        trigger,
        completedAt,
        trigger,
        completedAt,
        trigger,
        completedAt,
        outcome,
        reportDigest,
        sorted.length,
        attentionCount,
        completedAt,
        accountId,
        runGeneration,
      );

      return {
        accountId,
        generation,
        trigger,
        outcome,
        reportDigest,
        journeyCount: manifest!.journeyIds.length,
        protectedIntentCount: protectedIntentCount(manifest!),
        findings: sorted,
        repairPlans,
        counts,
      };
    },

    async repair(trigger: DataHealthTrigger = "MANUAL"): Promise<DataHealthReport> {
      let report = await coordinator.run(trigger);
      try {
        await verifyAppliedRepairEvents(
          dependencies,
          report.accountId,
          report.generation,
          now,
        );
        for (const plan of report.repairPlans) {
          if (plan.eligibility !== "ELIGIBLE" || !plan.actionId) continue;
          if (!(await applyRepairPlan(dependencies, plan, now))) {
            report = await coordinator.run(trigger);
            continue;
          }
          report = await coordinator.run(trigger);
          await verifyAppliedRepairEvents(
            dependencies,
            report.accountId,
            report.generation,
            now,
          );
        }
        return report;
      } catch (error) {
        if (error instanceof DataHealthScopeChangedError) return coordinator.run(trigger);
        throw error;
      }
    },

    async converge(trigger: DataHealthTrigger = "MANUAL"): Promise<DataHealthReport> {
      if (!dependencies.runOperationalSync || !dependencies.refreshJourneyLedger)
        return coordinator.repair(trigger);

      const planned = await coordinator.run(trigger);
      const initialOperationIds = new Set(
        planned.findings
          .filter((finding) =>
            ["sync_operation", "asset_operation"].includes(finding.targetType),
          )
          .map((finding) => `${finding.targetType}:${finding.targetId}`),
      );
      const eligiblePlans = planned.repairPlans.filter(
        (plan) => plan.eligibility === "ELIGIBLE" && plan.actionId,
      );
      let report = await coordinator.repair(trigger);
      if (
        planned.accountId !== report.accountId ||
        planned.generation !== report.generation
      )
        return withConvergence(report, {
          state: "PROTECTED",
          localRepairCount: 0,
          recoveredChangeCount: 0,
          refreshedJourneyCount: 0,
          syncAttempted: false,
        });
      const accountId = report.accountId;
      const generation = report.generation;
      const localRepairCount = await countRecordedRepairs(
        dependencies.database,
        eligiblePlans,
      );
      const scopes = new Set(
        [...planned.findings, ...report.findings]
          .map((finding) => finding.journeyId)
          .filter((journeyId): journeyId is string => Boolean(journeyId)),
      );
      const prioritizedScopes = await coordinator.getScopePlan();
      if (prioritizedScopes[0]) scopes.add(prioritizedScopes[0]);

      let syncAttempted = false;
      let refreshedJourneyCount = 0;
      let expectedNetworkFailure = false;
      let protectedScope = false;
      try {
        report = await coordinator.run(trigger);
        await assertScope(dependencies, accountId, generation);
        if (hasRunnableQueueWork(report)) {
          if (networkAllowed(report)) {
            syncAttempted = true;
            await dependencies.runOperationalSync();
            await assertScope(dependencies, accountId, generation);
          } else {
            protectedScope ||= hasNetworkBlocker(report, "ISOLATION_VIOLATION");
            expectedNetworkFailure ||= hasNetworkBlocker(report, "AUTH_PAUSED");
          }
        }

        for (const journeyId of scopes) {
          report = await coordinator.run(trigger);
          await assertScope(dependencies, accountId, generation);
          if (!networkAllowed(report, journeyId)) {
            protectedScope ||= hasNetworkBlocker(
              report,
              "ISOLATION_VIOLATION",
              journeyId,
            );
            expectedNetworkFailure ||= hasNetworkBlocker(report, "AUTH_PAUSED");
            continue;
          }
          try {
            if (await dependencies.refreshJourneyLedger(journeyId))
              refreshedJourneyCount += 1;
            await assertScope(dependencies, accountId, generation);
          } catch (error) {
            if (!(error instanceof ApiClientError)) throw error;
            expectedNetworkFailure = true;
            break;
          }
        }
        report = await coordinator.run(trigger);
      } catch (error) {
        if (!(error instanceof DataHealthScopeChangedError)) throw error;
        const changed = await coordinator.run(trigger);
        return withConvergence(changed, {
          state: "PROTECTED",
          localRepairCount,
          recoveredChangeCount: 0,
          refreshedJourneyCount,
          syncAttempted,
        });
      }

      const finalOperationIds = new Set(
        report.findings
          .filter((finding) =>
            ["sync_operation", "asset_operation"].includes(finding.targetType),
          )
          .map((finding) => `${finding.targetType}:${finding.targetId}`),
      );
      const recoveredChangeCount = [...initialOperationIds].filter(
        (id) => !finalOperationIds.has(id),
      ).length;
      return withConvergence(report, {
        state: convergenceState({
          report,
          localRepairCount,
          recoveredChangeCount,
          refreshedJourneyCount,
          expectedNetworkFailure,
          protectedScope,
        }),
        localRepairCount,
        recoveredChangeCount,
        refreshedJourneyCount,
        syncAttempted,
      });
    },

    async shouldRunCheapScan(maxAgeMs = 15 * 60_000) {
      const accountId = await dependencies.getActiveAccountId();
      const state = await dependencies.database.getFirstAsync<{
        lastCheapScanAt: string | null;
        runState: string;
      }>(
        `SELECT last_cheap_scan_at AS lastCheapScanAt, run_state AS runState
         FROM data_health_state WHERE account_id = ?`,
        accountId,
      );
      if (!state || state.runState === "RUNNING" || !state.lastCheapScanAt) return true;
      const suspicious = await dependencies.database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM sync_operations
         WHERE owner_user_id = ? AND status <> 'COMPLETED'`,
        accountId,
      );
      if ((suspicious?.count ?? 0) > 0) return true;
      return now().getTime() - new Date(state.lastCheapScanAt).getTime() >= maxAgeMs;
    },

    async getLatestState() {
      const accountId = await dependencies.getActiveAccountId();
      return dependencies.database.getFirstAsync<{
        runState: string;
        outcome: DataHealthOutcome | null;
        findingCount: number;
        attentionCount: number;
        updatedAt: string;
      }>(
        `SELECT run_state AS runState, last_aggregate_outcome AS outcome,
           last_finding_count AS findingCount,
           last_attention_count AS attentionCount, updated_at AS updatedAt
         FROM data_health_state WHERE account_id = ?`,
        accountId,
      );
    },

    async getScopePlan() {
      const accountId = await dependencies.getActiveAccountId();
      const rows = await dependencies.database.getAllAsync<{ journeyId: string }>(
        `WITH authorized AS (
           SELECT journey_id FROM ledger_actor_context WHERE user_id = ?
         ), suspicious AS (
           SELECT trip_id AS journey_id FROM sync_operations
            WHERE owner_user_id = ? AND status <> 'COMPLETED' AND trip_id IS NOT NULL
           UNION SELECT journey_id FROM ledger_asset_operations
            WHERE owner_user_id = ? AND status <> 'COMPLETED'
           UNION SELECT journey_id FROM ledger_expenses
            WHERE local_owner_user_id = ? AND sync_status <> 'SYNCED'
           UNION SELECT journey_id FROM ledger_personal_payment_records
            WHERE projection_user_id = ? AND sync_status <> 'SYNCED'
         )
         SELECT a.journey_id AS journeyId FROM authorized a
         LEFT JOIN account_local_state selected
           ON selected.user_id = ? AND selected.selected_journey_id = a.journey_id
         LEFT JOIN suspicious s ON s.journey_id = a.journey_id
         LEFT JOIN ledger_journeys j ON j.journey_id = a.journey_id
         ORDER BY (selected.selected_journey_id IS NOT NULL) DESC,
           (s.journey_id IS NOT NULL) DESC, j.updated_at DESC, a.journey_id`,
        accountId,
        accountId,
        accountId,
        accountId,
        accountId,
        accountId,
      );
      return rows.map((row) => row.journeyId);
    },
  };
  return coordinator;
}

async function countRecordedRepairs(database: Database, plans: DataHealthRepairPlan[]) {
  let count = 0;
  for (const plan of plans) {
    const event = await database.getFirstAsync(
      `SELECT 1 FROM data_health_repair_events
       WHERE account_id = ? AND rule_id = ? AND target_type = ? AND target_id = ?
         AND input_digest = ? AND action = ?`,
      plan.accountId,
      plan.ruleId,
      plan.targetType,
      plan.targetId,
      plan.findingDigest,
      plan.actionId,
    );
    if (event) count += 1;
  }
  return count;
}

function hasRunnableQueueWork(report: DataHealthReport) {
  return report.findings.some(
    (finding) =>
      ["sync_operation", "asset_operation"].includes(finding.targetType) &&
      finding.category === "RETRYABLE",
  );
}

function networkAllowed(report: DataHealthReport, journeyId?: string) {
  if (hasNetworkBlocker(report, "AUTH_PAUSED")) return false;
  return !hasNetworkBlocker(report, "ISOLATION_VIOLATION", journeyId);
}

function hasNetworkBlocker(
  report: DataHealthReport,
  category: "AUTH_PAUSED" | "ISOLATION_VIOLATION",
  journeyId?: string,
) {
  return report.findings.some(
    (finding) =>
      finding.category === category && (!journeyId || finding.journeyId === journeyId),
  );
}

function convergenceState(input: {
  report: DataHealthReport;
  localRepairCount: number;
  recoveredChangeCount: number;
  refreshedJourneyCount: number;
  expectedNetworkFailure: boolean;
  protectedScope: boolean;
}): DataHealthConvergenceState {
  if (input.report.outcome === "NEEDS_ATTENTION") return "NEEDS_ATTENTION";
  const allProtected =
    input.report.findings.length > 0 &&
    input.report.findings.every((finding) => finding.category === "PROTECTED_LOCAL");
  if (input.protectedScope || allProtected) return "PROTECTED";
  if (input.report.outcome === "WAITING" || input.expectedNetworkFailure)
    return input.localRepairCount > 0 ? "LOCAL_REPAIRED_WAITING" : "WAITING";
  if (input.recoveredChangeCount > 0) return "RECOVERED";
  if (input.refreshedJourneyCount > 0) return "REFRESHED";
  return "UP_TO_DATE";
}

function withConvergence(
  report: DataHealthReport,
  convergence: DataHealthConvergence,
): DataHealthReport {
  return { ...report, convergence };
}

async function applyRepairPlan(
  dependencies: DataHealthDependencies,
  plan: DataHealthRepairPlan,
  now: () => Date,
) {
  if (plan.eligibility !== "ELIGIBLE" || !plan.actionId) return false;
  await assertScope(dependencies, plan.accountId, plan.generation);
  let applied = false;
  await dependencies.database.withTransactionAsync(async () => {
    await assertScope(dependencies, plan.accountId, plan.generation);
    const repairTime = now();
    const current = await currentOperationPlan(dependencies.database, plan, repairTime);
    if (!current || !sameRepairPlan(current, plan)) return;

    const table =
      plan.targetType === "sync_operation"
        ? "sync_operations"
        : plan.targetType === "asset_operation"
          ? "ledger_asset_operations"
          : null;
    if (!table) return;
    const timestamp = repairTime.toISOString();
    let result: Awaited<ReturnType<Database["runAsync"]>>;
    if (plan.actionId === "RECOVER_EXPIRED_OPERATION_LEASE_V1") {
      result = await dependencies.database.runAsync(
        `UPDATE ${table} SET status = 'RETRYABLE', next_attempt_at = ?,
           last_error_message = 'INTERRUPTED', claim_owner = NULL,
           lease_expires_at = NULL, updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND status = 'PROCESSING'
           AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?`,
        timestamp,
        timestamp,
        plan.targetId,
        plan.accountId,
        timestamp,
      );
    } else if (plan.actionId === "WAKE_COMPLETED_OPERATION_DEPENDENCY_V1") {
      result = await dependencies.database.runAsync(
        `UPDATE ${table} SET status = 'PENDING', failure_category = NULL,
           last_error_code = NULL, last_error_message = NULL,
           next_attempt_at = NULL, claim_owner = NULL, lease_expires_at = NULL,
           updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND status = 'DEPENDENCY_BLOCKED'`,
        timestamp,
        plan.targetId,
        plan.accountId,
      );
    } else if (plan.actionId === "REACTIVATE_RETRYABLE_OPERATION_V1") {
      result = await dependencies.database.runAsync(
        `UPDATE ${table} SET next_attempt_at = NULL, updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND status = 'RETRYABLE'
           AND next_attempt_at IS NOT NULL AND next_attempt_at > ?
           AND failure_category IN ('UNKNOWN', 'NETWORK', 'TIMEOUT', 'SERVER',
             'RATE_LIMIT', 'RESPONSE_INVALID')`,
        timestamp,
        plan.targetId,
        plan.accountId,
        timestamp,
      );
    } else return;
    if (result.changes !== 1) return;
    await dependencies.database.runAsync(
      `INSERT INTO data_health_repair_events (
         id, account_id, journey_id, rule_id, target_type, target_id,
         input_digest, action, status, affected_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPLIED', 1, ?, ?)
       ON CONFLICT (
         account_id, rule_id, target_type, target_id, input_digest, action
       ) DO NOTHING`,
      createLocalId("health-repair"),
      plan.accountId,
      plan.journeyId,
      plan.ruleId,
      plan.targetType,
      plan.targetId,
      plan.findingDigest,
      plan.actionId,
      timestamp,
      timestamp,
    );
    await assertScope(dependencies, plan.accountId, plan.generation);
    applied = true;
  });
  await assertScope(dependencies, plan.accountId, plan.generation);
  return applied;
}

async function currentOperationPlan(
  database: Database,
  expected: DataHealthRepairPlan,
  now: Date,
) {
  const targetType =
    expected.targetType === "sync_operation"
      ? "sync_operation"
      : expected.targetType === "asset_operation"
        ? "asset_operation"
        : null;
  if (!targetType) return null;
  const operation = await readOperationForRepair(
    database,
    targetType,
    expected.targetId,
    expected.accountId,
  );
  if (!operation) return null;
  const journeyAuthorized =
    operation.journeyId === null
      ? true
      : Boolean(
          await database.getFirstAsync(
            `SELECT 1 FROM ledger_actor_context
           WHERE user_id = ? AND journey_id = ?`,
            expected.accountId,
            operation.journeyId,
          ),
        );
  const finding = operationFinding(operation, targetType);
  return planDataHealthRepairs({
    accountId: expected.accountId,
    generation: expected.generation,
    findings: [finding],
    operationEvidence: [
      toOperationEvidence(expected.accountId, targetType, operation, journeyAuthorized),
    ],
    now,
  })[0];
}

async function readOperationForRepair(
  database: Database,
  targetType: string,
  targetId: string,
  accountId: string,
): Promise<Operation | AssetOperation | null> {
  if (targetType === "sync_operation")
    return database.getFirstAsync<Operation>(
      `SELECT operation.id, operation.trip_id AS journeyId,
         operation.entity_type AS entityType, operation.entity_id AS entityId,
         operation.operation_type AS operationType, operation.status,
         operation.attempt_count AS attemptCount,
         operation.failure_category AS failureCategory,
         operation.last_error_code AS errorCode,
         operation.next_attempt_at AS nextAttemptAt,
         operation.lease_expires_at AS leaseExpiresAt,
         operation.dependency_operation_id AS dependencyOperationId,
         dependency.status AS dependencyStatus,
         dependency.trip_id AS dependencyJourneyId,
         dependency.entity_id AS dependencyEntityId,
         CASE
           WHEN operation.entity_type = 'ledger_expense' THEN EXISTS (
             SELECT 1 FROM ledger_expenses entity
             WHERE entity.id = operation.entity_id
               AND entity.journey_id = operation.trip_id
               AND entity.local_owner_user_id = operation.owner_user_id
               AND entity.server_id IS NOT NULL AND entity.server_revision > 0
           )
           WHEN operation.entity_type = 'ledger_personal_payment' THEN EXISTS (
             SELECT 1 FROM ledger_personal_payment_records entity
             WHERE entity.id = operation.entity_id
               AND entity.journey_id = operation.trip_id
               AND entity.projection_user_id = operation.owner_user_id
               AND entity.server_revision > 0
           )
           ELSE 0
         END AS serverIdentityAvailable
       FROM sync_operations operation
       LEFT JOIN sync_operations dependency
         ON dependency.id = operation.dependency_operation_id
        AND dependency.owner_user_id = operation.owner_user_id
       WHERE operation.id = ? AND operation.owner_user_id = ?`,
      targetId,
      accountId,
    );
  if (targetType === "asset_operation")
    return database.getFirstAsync<AssetOperation>(
      `SELECT operation.id, operation.journey_id AS journeyId,
         operation.asset_id AS assetId, operation.operation_type AS operationType,
         operation.status, operation.attempt_count AS attemptCount,
         operation.failure_category AS failureCategory,
         operation.last_error_code AS errorCode,
         operation.next_attempt_at AS nextAttemptAt,
         operation.lease_expires_at AS leaseExpiresAt,
         operation.dependency_operation_id AS dependencyOperationId,
         dependency.status AS dependencyStatus,
         dependency.journey_id AS dependencyJourneyId,
         dependency.asset_id AS dependencyEntityId,
         EXISTS (
           SELECT 1 FROM ledger_receipt_assets asset
           WHERE asset.id = operation.asset_id
             AND asset.journey_id = operation.journey_id
             AND asset.local_owner_user_id = operation.owner_user_id
             AND asset.server_id IS NOT NULL
         ) AS serverIdentityAvailable
       FROM ledger_asset_operations operation
       LEFT JOIN ledger_asset_operations dependency
         ON dependency.id = operation.dependency_operation_id
        AND dependency.owner_user_id = operation.owner_user_id
       WHERE operation.id = ? AND operation.owner_user_id = ?`,
      targetId,
      accountId,
    );
  return null;
}

function sameRepairPlan(left: DataHealthRepairPlan, right: DataHealthRepairPlan) {
  return (
    left.accountId === right.accountId &&
    left.generation === right.generation &&
    left.journeyId === right.journeyId &&
    left.ruleId === right.ruleId &&
    left.targetType === right.targetType &&
    left.targetId === right.targetId &&
    left.findingDigest === right.findingDigest &&
    left.disposition === right.disposition &&
    left.eligibility === right.eligibility &&
    left.evidenceRequirement === right.evidenceRequirement &&
    left.actionId === right.actionId &&
    left.verifierId === right.verifierId
  );
}

async function verifyAppliedRepairEvents(
  dependencies: DataHealthDependencies,
  accountId: string,
  generation: number,
  now: () => Date,
) {
  await assertScope(dependencies, accountId, generation);
  await dependencies.database.withTransactionAsync(async () => {
    await assertScope(dependencies, accountId, generation);
    const events = await dependencies.database.getAllAsync<RepairEvent>(
      `SELECT id, target_type AS targetType, target_id AS targetId, action
       FROM data_health_repair_events
       WHERE account_id = ? AND status = 'APPLIED'
       ORDER BY created_at, id`,
      accountId,
    );
    const timestamp = now().toISOString();
    for (const event of events) {
      const state = await readRepairState(
        dependencies.database,
        event.targetType,
        event.targetId,
        accountId,
      );
      if (!repairVerified(event.action, state, timestamp)) continue;
      await dependencies.database.runAsync(
        `UPDATE data_health_repair_events SET status = 'VERIFIED',
           verified_at = ?, updated_at = ?
         WHERE id = ? AND account_id = ? AND status = 'APPLIED'`,
        timestamp,
        timestamp,
        event.id,
        accountId,
      );
    }
    await dependencies.database.runAsync(
      `DELETE FROM data_health_repair_events
       WHERE account_id = ? AND status = 'VERIFIED' AND id NOT IN (
         SELECT id FROM data_health_repair_events
         WHERE account_id = ? AND status = 'VERIFIED'
         ORDER BY updated_at DESC, id DESC LIMIT ?
       )`,
      accountId,
      accountId,
      VERIFIED_REPAIR_EVENT_LIMIT,
    );
    await assertScope(dependencies, accountId, generation);
  });
}

async function readRepairState(
  database: Database,
  targetType: string,
  targetId: string,
  accountId: string,
) {
  const table =
    targetType === "sync_operation"
      ? "sync_operations"
      : targetType === "asset_operation"
        ? "ledger_asset_operations"
        : null;
  if (!table) return null;
  return database.getFirstAsync<{
    status: string;
    nextAttemptAt: string | null;
    leaseExpiresAt: string | null;
  }>(
    `SELECT status, next_attempt_at AS nextAttemptAt,
       lease_expires_at AS leaseExpiresAt
     FROM ${table} WHERE id = ? AND owner_user_id = ?`,
    targetId,
    accountId,
  );
}

function repairVerified(
  action: DataHealthRepairActionId,
  state: {
    status: string;
    nextAttemptAt: string | null;
    leaseExpiresAt: string | null;
  } | null,
  timestamp: string,
) {
  if (!state) return true;
  if (action === "RECOVER_EXPIRED_OPERATION_LEASE_V1")
    return !(
      state.status === "PROCESSING" &&
      state.leaseExpiresAt &&
      state.leaseExpiresAt <= timestamp
    );
  if (action === "WAKE_COMPLETED_OPERATION_DEPENDENCY_V1")
    return ["PENDING", "PROCESSING", "RETRYABLE", "COMPLETED"].includes(state.status);
  if (action === "REACTIVATE_RETRYABLE_OPERATION_V1")
    return (
      (state.status === "RETRYABLE" && state.nextAttemptAt === null) ||
      ["PENDING", "PROCESSING", "COMPLETED"].includes(state.status)
    );
  return false;
}

async function assertScope(
  dependencies: DataHealthDependencies,
  accountId: string,
  generation: number,
) {
  if (
    dependencies.getAccountGeneration() !== generation ||
    (await dependencies.getActiveAccountId()) !== accountId
  )
    throw new DataHealthScopeChangedError();
}

async function buildManifest(
  database: Database,
  accountId: string,
  generation: number,
): Promise<Manifest> {
  const journeyRows = await database.getAllAsync<{ journeyId: string }>(
    `SELECT journey_id AS journeyId FROM ledger_actor_context
     WHERE user_id = ? ORDER BY journey_id`,
    accountId,
  );
  const operations = await database.getAllAsync<Operation>(
    `SELECT operation.id, operation.trip_id AS journeyId,
       operation.entity_type AS entityType, operation.entity_id AS entityId,
       operation.operation_type AS operationType, operation.status,
       operation.attempt_count AS attemptCount,
       operation.failure_category AS failureCategory,
       operation.last_error_code AS errorCode,
       operation.next_attempt_at AS nextAttemptAt,
       operation.lease_expires_at AS leaseExpiresAt,
       operation.dependency_operation_id AS dependencyOperationId,
       dependency.status AS dependencyStatus,
       dependency.trip_id AS dependencyJourneyId,
       dependency.entity_id AS dependencyEntityId,
       CASE
         WHEN operation.entity_type = 'ledger_expense' THEN EXISTS (
           SELECT 1 FROM ledger_expenses entity
           WHERE entity.id = operation.entity_id
             AND entity.journey_id = operation.trip_id
             AND entity.local_owner_user_id = operation.owner_user_id
             AND entity.server_id IS NOT NULL AND entity.server_revision > 0
         )
         WHEN operation.entity_type = 'ledger_personal_payment' THEN EXISTS (
           SELECT 1 FROM ledger_personal_payment_records entity
           WHERE entity.id = operation.entity_id
             AND entity.journey_id = operation.trip_id
             AND entity.projection_user_id = operation.owner_user_id
             AND entity.server_revision > 0
         )
         ELSE 0
       END AS serverIdentityAvailable
     FROM sync_operations operation
     LEFT JOIN sync_operations dependency
       ON dependency.id = operation.dependency_operation_id
      AND dependency.owner_user_id = operation.owner_user_id
     WHERE operation.owner_user_id = ? AND operation.status <> 'COMPLETED'`,
    accountId,
  );
  const expenses = await database.getAllAsync<Expense>(
    `SELECT e.id, e.journey_id AS journeyId, e.server_id AS serverId,
       e.revision, e.server_revision AS serverRevision, e.sync_status AS syncStatus,
       e.local_owner_user_id AS localOwnerUserId,
       e.business_status AS businessStatus
     FROM ledger_expenses e
     WHERE e.local_owner_user_id = ? OR EXISTS (
       SELECT 1 FROM ledger_actor_context actor
       WHERE actor.user_id = ? AND actor.journey_id = e.journey_id
     )`,
    accountId,
    accountId,
  );
  const personalPayments = await database.getAllAsync<PersonalPayment>(
    `SELECT id, journey_id AS journeyId, server_revision AS serverRevision,
       sync_status AS syncStatus, server_revision AS revision,
       amount_minor AS amountMinor, currency, scale, economic_date AS economicDate
     FROM ledger_personal_payment_records WHERE projection_user_id = ?`,
    accountId,
  );
  const assetOperations = await database.getAllAsync<AssetOperation>(
    `SELECT operation.id, operation.journey_id AS journeyId,
       operation.asset_id AS assetId, operation.operation_type AS operationType,
       operation.status, operation.attempt_count AS attemptCount,
       operation.failure_category AS failureCategory,
       operation.last_error_code AS errorCode,
       operation.next_attempt_at AS nextAttemptAt,
       operation.lease_expires_at AS leaseExpiresAt,
       operation.dependency_operation_id AS dependencyOperationId,
       dependency.status AS dependencyStatus,
       dependency.journey_id AS dependencyJourneyId,
       dependency.asset_id AS dependencyEntityId,
       EXISTS (
         SELECT 1 FROM ledger_receipt_assets asset
         WHERE asset.id = operation.asset_id
           AND asset.journey_id = operation.journey_id
           AND asset.local_owner_user_id = operation.owner_user_id
           AND asset.server_id IS NOT NULL
       ) AS serverIdentityAvailable
     FROM ledger_asset_operations operation
     LEFT JOIN ledger_asset_operations dependency
       ON dependency.id = operation.dependency_operation_id
      AND dependency.owner_user_id = operation.owner_user_id
     WHERE operation.owner_user_id = ? AND operation.status <> 'COMPLETED'`,
    accountId,
  );
  const receipts = await database.getAllAsync<Receipt>(
    `SELECT r.id, r.journey_id AS journeyId, r.server_id AS serverId,
       r.local_uri AS localUri, r.upload_status AS uploadStatus,
       r.local_owner_user_id AS localOwnerUserId
     FROM ledger_receipt_assets r
     WHERE r.local_owner_user_id = ? OR EXISTS (
       SELECT 1 FROM ledger_actor_context actor
       WHERE actor.user_id = ? AND actor.journey_id = r.journey_id
     )`,
    accountId,
    accountId,
  );
  const ledgerCursors = await database.getAllAsync<Omit<Cursor, "kind">>(
    `SELECT journey_id AS journeyId, cursor FROM ledger_sync_cursors WHERE user_id = ?`,
    accountId,
  );
  const personalCursors = await database.getAllAsync<Omit<Cursor, "kind">>(
    `SELECT journey_id AS journeyId, cursor
     FROM ledger_personal_payment_sync_cursors WHERE user_id = ?`,
    accountId,
  );
  const deferredChanges = await database.getAllAsync<DeferredChange>(
    `SELECT change.journey_id AS journeyId, change.entity_id AS entityId,
       change.revision
     FROM ledger_deferred_server_changes change
     JOIN ledger_actor_context actor ON actor.journey_id = change.journey_id
     WHERE actor.user_id = ?`,
    accountId,
  );
  const expenseValuations = await database.getAllAsync<ExpenseValuation>(
    `SELECT valuation.id, expense.journey_id AS journeyId,
       expense.id AS expenseId, valuation.expense_revision AS expenseRevision,
       expense.revision AS currentRevision,
       valuation.original_amount_minor AS originalAmountMinor,
       expense.original_amount_minor AS currentAmountMinor,
       valuation.original_currency AS originalCurrency,
       expense.original_currency AS currentCurrency,
       valuation.original_scale AS originalScale,
       expense.original_scale AS currentScale,
       valuation.settlement_currency AS settlementCurrency,
       journey.settlement_currency AS journeyCurrency,
       valuation.settlement_scale AS settlementScale,
       journey.settlement_scale AS journeyScale
     FROM ledger_valuation_snapshots valuation
     JOIN ledger_expenses expense ON expense.id = valuation.expense_id
     JOIN ledger_journeys journey ON journey.journey_id = expense.journey_id
     JOIN ledger_actor_context actor ON actor.journey_id = expense.journey_id
     WHERE actor.user_id = ? AND valuation.is_active = 1`,
    accountId,
  );
  const paymentProjections = await database.getAllAsync<PaymentProjection>(
    `SELECT projection.id, projection.journey_id AS journeyId,
       projection.payment_id AS paymentId, projection.state,
       projection.failure_category AS failureCategory,
       projection.source_payment_revision AS sourcePaymentRevision,
       payment.server_revision AS paymentRevision,
       projection.original_amount_minor AS originalAmountMinor,
       payment.amount_minor AS paymentAmountMinor,
       projection.original_currency AS originalCurrency,
       payment.currency AS paymentCurrency,
       projection.original_scale AS originalScale, payment.scale AS paymentScale,
       projection.economic_date AS economicDate,
       payment.economic_date AS paymentEconomicDate
     FROM ledger_personal_payment_fx_projections projection
     JOIN ledger_personal_payment_records payment
       ON payment.projection_user_id = projection.projection_user_id
      AND payment.id = projection.payment_id
     JOIN ledger_journeys journey ON journey.journey_id = projection.journey_id
     WHERE projection.projection_user_id = ?
       AND projection.target_currency = journey.settlement_currency`,
    accountId,
  );
  const reviewStates = await database.getAllAsync<ReviewState>(
    `SELECT journey_id AS journeyId, sync_status AS syncStatus,
       pending_operation_id AS pendingOperationId
     FROM ledger_personal_settlement_review_state WHERE user_id = ?`,
    accountId,
  );
  const reviewFindings = await database.getAllAsync<ReviewFinding>(
    `SELECT finding.id, finding.journey_id AS journeyId,
       finding.expense_id AS expenseId,
       COALESCE(finding.target_source_revision, finding.entity_revision)
         AS targetSourceRevision,
       expense.revision AS expenseRevision
     FROM ledger_review_findings finding
     JOIN ledger_review_visibility visibility ON visibility.finding_id = finding.id
     LEFT JOIN ledger_expenses expense ON expense.id = finding.expense_id
     WHERE visibility.user_id = ? AND finding.lifecycle = 'ACTIVE'`,
    accountId,
  );

  return {
    accountId,
    generation,
    journeyIds: journeyRows.map((row) => row.journeyId),
    operations,
    expenses,
    personalPayments,
    assetOperations,
    receipts,
    cursors: [
      ...ledgerCursors.map((cursor) => ({ ...cursor, kind: "LEDGER" as const })),
      ...personalCursors.map((cursor) => ({
        ...cursor,
        kind: "PERSONAL_PAYMENT" as const,
      })),
    ],
    deferredChanges,
    expenseValuations,
    paymentProjections,
    reviewStates,
    reviewFindings,
  };
}

async function detectFindings(
  manifest: Manifest,
  fileExists: DataHealthDependencies["fileExists"],
) {
  const findings: DataHealthFinding[] = [];
  const authorized = new Set(manifest.journeyIds);

  for (const operation of manifest.operations)
    findings.push(operationFinding(operation, "sync_operation"));
  for (const operation of manifest.assetOperations)
    findings.push(operationFinding(operation, "asset_operation"));

  for (const expense of manifest.expenses)
    if (
      expense.localOwnerUserId === manifest.accountId &&
      (!expense.serverId ||
        expense.serverRevision === 0 ||
        expense.syncStatus !== "SYNCED")
    )
      findings.push(
        finding(
          "DH_LOCAL_ENTITY_INTENT_V1",
          "PROTECTED_LOCAL",
          expense.journeyId,
          "expense",
          expense.id,
          [expense.serverId ?? "local", expense.serverRevision, expense.syncStatus],
        ),
      );

  for (const payment of manifest.personalPayments)
    if (payment.serverRevision === 0 || payment.syncStatus !== "SYNCED")
      findings.push(
        finding(
          "DH_LOCAL_ENTITY_INTENT_V1",
          "PROTECTED_LOCAL",
          payment.journeyId,
          "personal_payment",
          payment.id,
          [payment.serverRevision, payment.syncStatus],
        ),
      );

  const pendingUploads = new Set(
    manifest.assetOperations
      .filter((operation) => operation.operationType === "UPLOAD_RECEIPT")
      .map((operation) => operation.assetId),
  );
  for (const receipt of manifest.receipts) {
    const localOriginalRequired =
      receipt.localOwnerUserId === manifest.accountId &&
      (receipt.uploadStatus !== "UPLOADED" || pendingUploads.has(receipt.id));
    if (!localOriginalRequired) continue;
    const exists = receipt.localUri ? await fileExists(receipt.localUri) : false;
    if (exists === false)
      findings.push(
        finding(
          "DH_RECEIPT_ORIGINAL_V1",
          "UNRECOVERABLE_INPUT",
          receipt.journeyId,
          "receipt",
          receipt.id,
          [receipt.uploadStatus, receipt.serverId ?? "local", "missing"],
        ),
      );
    else
      findings.push(
        finding(
          "DH_RECEIPT_ORIGINAL_V1",
          "PROTECTED_LOCAL",
          receipt.journeyId,
          "receipt",
          receipt.id,
          [receipt.uploadStatus, receipt.serverId ?? "local", "present"],
        ),
      );
  }

  for (const cursor of manifest.cursors) {
    if (!authorized.has(cursor.journeyId))
      findings.push(
        finding(
          "DH_CURSOR_SCOPE_V1",
          "ISOLATION_VIOLATION",
          cursor.journeyId,
          "cursor",
          `${cursor.kind}:${cursor.journeyId}`,
          [cursor.kind, "unauthorized"],
        ),
      );
    else if (cursor.cursor !== null && cursor.cursor.trim() === "")
      findings.push(
        finding(
          "DH_CURSOR_SCOPE_V1",
          "MIRROR_STALE",
          cursor.journeyId,
          "cursor",
          `${cursor.kind}:${cursor.journeyId}`,
          [cursor.kind, "blank"],
        ),
      );
  }

  for (const change of manifest.deferredChanges)
    findings.push(
      finding(
        "DH_DEFERRED_CHANGE_V1",
        "MIRROR_STALE",
        change.journeyId,
        "deferred_change",
        change.entityId,
        [change.revision],
      ),
    );

  for (const valuation of manifest.expenseValuations)
    if (
      valuation.expenseRevision !== valuation.currentRevision ||
      valuation.originalAmountMinor !== valuation.currentAmountMinor ||
      valuation.originalCurrency !== valuation.currentCurrency ||
      valuation.originalScale !== valuation.currentScale ||
      valuation.settlementCurrency !== valuation.journeyCurrency ||
      valuation.settlementScale !== valuation.journeyScale
    )
      findings.push(
        finding(
          "DH_EXPENSE_FX_BINDING_V1",
          "ORPHAN_REBUILDABLE",
          valuation.journeyId,
          "expense_valuation",
          valuation.id,
          [valuation.expenseId, valuation.expenseRevision, valuation.currentRevision],
        ),
      );

  for (const projection of manifest.paymentProjections) {
    const stale =
      projection.sourcePaymentRevision !== projection.paymentRevision ||
      projection.originalAmountMinor !== projection.paymentAmountMinor ||
      projection.originalCurrency !== projection.paymentCurrency ||
      projection.originalScale !== projection.paymentScale ||
      projection.economicDate !== projection.paymentEconomicDate;
    if (stale)
      findings.push(
        finding(
          "DH_PERSONAL_PAYMENT_FX_BINDING_V1",
          "ORPHAN_REBUILDABLE",
          projection.journeyId,
          "personal_payment_projection",
          projection.id,
          [
            projection.paymentId,
            projection.sourcePaymentRevision,
            projection.paymentRevision,
          ],
        ),
      );
    else if (projection.state !== "CONFIRMED")
      findings.push(
        finding(
          "DH_PERSONAL_PAYMENT_FX_BINDING_V1",
          "RETRYABLE",
          projection.journeyId,
          "personal_payment_projection",
          projection.id,
          [projection.paymentId, projection.state, projection.failureCategory ?? "none"],
        ),
      );
  }

  for (const state of manifest.reviewStates)
    if (state.syncStatus !== "SYNCED")
      findings.push(
        finding(
          "DH_REVIEW_DERIVED_STATE_V1",
          state.syncStatus === "CONFLICT" ? "CONFLICT" : "PROTECTED_LOCAL",
          state.journeyId,
          "review_state",
          state.journeyId,
          [state.syncStatus, state.pendingOperationId ?? "none"],
        ),
      );
  for (const review of manifest.reviewFindings)
    if (
      review.expenseId &&
      review.targetSourceRevision !== null &&
      review.expenseRevision !== null &&
      review.targetSourceRevision !== review.expenseRevision
    )
      findings.push(
        finding(
          "DH_REVIEW_DERIVED_STATE_V1",
          "MIRROR_STALE",
          review.journeyId,
          "review_finding",
          review.id,
          [review.expenseId, review.targetSourceRevision, review.expenseRevision],
        ),
      );

  for (const item of [
    ...manifest.operations.map((row) => ({
      journeyId: row.journeyId,
      type: "sync_operation",
      id: row.id,
    })),
    ...manifest.assetOperations.map((row) => ({
      journeyId: row.journeyId,
      type: "asset_operation",
      id: row.id,
    })),
    ...manifest.expenses
      .filter((row) => row.localOwnerUserId === manifest.accountId)
      .map((row) => ({ journeyId: row.journeyId, type: "expense", id: row.id })),
    ...manifest.personalPayments.map((row) => ({
      journeyId: row.journeyId,
      type: "personal_payment",
      id: row.id,
    })),
  ])
    if (item.journeyId && !authorized.has(item.journeyId))
      findings.push(
        finding(
          "DH_ACCOUNT_JOURNEY_ISOLATION_V1",
          "ISOLATION_VIOLATION",
          item.journeyId,
          item.type,
          item.id,
          ["missing_actor_scope"],
        ),
      );

  return uniqueFindings(findings);
}

function operationFinding(
  operation: Operation | AssetOperation,
  targetType: string,
): DataHealthFinding {
  const values = [
    operation.status,
    operation.failureCategory ?? "none",
    operation.errorCode ?? "none",
    operation.attemptCount,
    operation.nextAttemptAt ?? "none",
    operation.leaseExpiresAt ?? "none",
    operation.dependencyOperationId ?? "none",
    operation.dependencyStatus ?? "none",
    operation.dependencyJourneyId ?? "none",
    operation.dependencyEntityId ?? "none",
    operation.serverIdentityAvailable,
  ];
  if (operation.status === "DEPENDENCY_BLOCKED")
    return finding(
      "DH_SYNC_OPERATION_STATE_V1",
      "DEPENDENCY_BLOCKED",
      operation.journeyId,
      targetType,
      operation.id,
      values,
    );
  if (operation.status === "CONFLICT" || operation.failureCategory === "CONFLICT")
    return finding(
      "DH_SYNC_OPERATION_STATE_V1",
      "CONFLICT",
      operation.journeyId,
      targetType,
      operation.id,
      values,
    );
  if (operation.failureCategory === "AUTH")
    return finding(
      "DH_SYNC_OPERATION_STATE_V1",
      "AUTH_PAUSED",
      operation.journeyId,
      targetType,
      operation.id,
      values,
    );
  if (operation.status === "FAILED" && operation.failureCategory === "VALIDATION")
    return finding(
      "DH_SYNC_OPERATION_STATE_V1",
      "ACTIONABLE_INPUT",
      operation.journeyId,
      targetType,
      operation.id,
      values,
    );
  if (operation.status === "FAILED")
    return finding(
      "DH_SYNC_OPERATION_STATE_V1",
      "PROTECTED_LOCAL",
      operation.journeyId,
      targetType,
      operation.id,
      values,
    );
  return finding(
    "DH_SYNC_OPERATION_STATE_V1",
    "RETRYABLE",
    operation.journeyId,
    targetType,
    operation.id,
    values,
  );
}

function finding(
  ruleId: string,
  category: DataHealthFinding["category"],
  journeyId: string | null,
  targetType: string,
  targetId: string,
  evidence: (string | number | null)[],
): DataHealthFinding {
  return {
    ruleId,
    category,
    journeyId,
    targetType,
    targetId,
    inputDigest: digest([ruleId, category, targetType, targetId, ...evidence]),
  };
}

function digest(parts: (string | number | null)[]) {
  let value = 0x811c9dc5;
  for (const character of parts.join("\u001f")) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 0x01000193);
  }
  return `dh-${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function compareFinding(left: DataHealthFinding, right: DataHealthFinding) {
  return (
    [
      left.ruleId.localeCompare(right.ruleId),
      (left.journeyId ?? "").localeCompare(right.journeyId ?? ""),
      left.targetType.localeCompare(right.targetType),
      left.targetId.localeCompare(right.targetId),
      left.category.localeCompare(right.category),
    ].find((value) => value !== 0) ?? 0
  );
}

function uniqueFindings(findings: DataHealthFinding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = [
      finding.ruleId,
      finding.category,
      finding.journeyId,
      finding.targetType,
      finding.targetId,
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function operationEvidence(manifest: Manifest): DataHealthOperationEvidence[] {
  const authorized = new Set(manifest.journeyIds);
  return [
    ...manifest.operations.map((operation) =>
      toOperationEvidence(
        manifest.accountId,
        "sync_operation",
        operation,
        operation.journeyId === null || authorized.has(operation.journeyId),
      ),
    ),
    ...manifest.assetOperations.map((operation) =>
      toOperationEvidence(
        manifest.accountId,
        "asset_operation",
        operation,
        authorized.has(operation.journeyId),
      ),
    ),
  ];
}

function toOperationEvidence(
  accountId: string,
  targetType: DataHealthOperationEvidence["targetType"],
  operation: Operation | AssetOperation,
  journeyAuthorized: boolean,
): DataHealthOperationEvidence {
  return {
    accountId,
    journeyId: operation.journeyId,
    targetType,
    targetId: operation.id,
    entityId: "entityId" in operation ? operation.entityId : operation.assetId,
    status: operation.status,
    attemptCount: operation.attemptCount,
    failureCategory: operation.failureCategory,
    nextAttemptAt: operation.nextAttemptAt,
    leaseExpiresAt: operation.leaseExpiresAt,
    dependencyOperationId: operation.dependencyOperationId,
    dependencyStatus: operation.dependencyStatus,
    dependencyJourneyId: operation.dependencyJourneyId,
    dependencyEntityId: operation.dependencyEntityId,
    journeyAuthorized,
    serverIdentityAvailable: operation.serverIdentityAvailable === 1,
  };
}

function protectedIntentCount(manifest: Manifest) {
  return (
    manifest.operations.length +
    manifest.assetOperations.length +
    manifest.expenses.filter(
      (expense) =>
        expense.localOwnerUserId === manifest.accountId &&
        (!expense.serverId ||
          expense.serverRevision === 0 ||
          expense.syncStatus !== "SYNCED"),
    ).length +
    manifest.personalPayments.filter(
      (payment) => payment.serverRevision === 0 || payment.syncStatus !== "SYNCED",
    ).length +
    manifest.receipts.filter(
      (receipt) =>
        receipt.localOwnerUserId === manifest.accountId &&
        receipt.uploadStatus !== "UPLOADED",
    ).length +
    manifest.reviewStates.filter((state) => state.syncStatus !== "SYNCED").length
  );
}
