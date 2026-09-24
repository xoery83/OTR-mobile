import type * as SQLite from "expo-sqlite";

import {
  planDataHealthRepairs,
  type DataHealthOperationEvidence,
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

export type DataHealthDependencies = {
  database: Database;
  getActiveAccountId(): Promise<string>;
  getAccountGeneration(): number;
  fileExists(uri: string): Promise<boolean | null>;
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

  return {
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
       dependency.trip_id AS dependencyJourneyId
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
       dependency.journey_id AS dependencyJourneyId
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
    operation.dependencyOperationId ?? "none",
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
  return [
    ...manifest.operations.map((operation) => ({
      accountId: manifest.accountId,
      journeyId: operation.journeyId,
      targetType: "sync_operation" as const,
      targetId: operation.id,
      status: operation.status,
      failureCategory: operation.failureCategory,
      nextAttemptAt: operation.nextAttemptAt,
      leaseExpiresAt: operation.leaseExpiresAt,
      dependencyOperationId: operation.dependencyOperationId,
      dependencyStatus: operation.dependencyStatus,
      dependencyJourneyId: operation.dependencyJourneyId,
    })),
    ...manifest.assetOperations.map((operation) => ({
      accountId: manifest.accountId,
      journeyId: operation.journeyId,
      targetType: "asset_operation" as const,
      targetId: operation.id,
      status: operation.status,
      failureCategory: operation.failureCategory,
      nextAttemptAt: operation.nextAttemptAt,
      leaseExpiresAt: operation.leaseExpiresAt,
      dependencyOperationId: operation.dependencyOperationId,
      dependencyStatus: operation.dependencyStatus,
      dependencyJourneyId: operation.dependencyJourneyId,
    })),
  ];
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
