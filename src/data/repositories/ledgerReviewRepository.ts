import type * as SQLite from "expo-sqlite";

import type {
  LedgerReviewActionDto,
  LedgerReviewFindingDto,
  LedgerReviewRaiseRequest,
} from "@/data/api/ledgerReviewContracts";
import { createLocalId } from "@/domain/localId";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

type ReviewChange = "projection" | "expense_saved";
const listeners = new Set<(journeyId: string, change: ReviewChange) => void>();
export function subscribeLedgerReview(
  listener: (journeyId: string, change: ReviewChange) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function changed(journeyId: string, change: ReviewChange = "projection") {
  for (const listener of listeners) listener(journeyId, change);
}

export function notifyLedgerReviewExpenseSaved(journeyId: string) {
  changed(journeyId, "expense_saved");
}

export function createLedgerReviewRepository(
  database: Database,
  getActiveUserId: () => Promise<string> = defaultGetActiveUserId,
) {
  return {
    async apply(
      journeyId: string,
      findings: LedgerReviewFindingDto[],
      actions: LedgerReviewActionDto[],
    ) {
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        await applyReviewProjection(database, userId, journeyId, findings, actions);
      });
      changed(journeyId);
    },
    async list(journeyId: string) {
      const userId = await getActiveUserId();
      return database
        .getAllAsync<LedgerReviewFindingDto>(
          `SELECT f.id, f.journey_id AS journeyId, f.expense_id AS expenseId,
          f.settlement_id AS settlementId, f.layer, f.finding_type AS findingType,
          f.severity, f.confidence, f.evidence_codes_json AS evidenceCodesJson,
          CASE WHEN f.rule_id IS NULL AND f.status IN ('STALE', 'RESOLVED') THEN f.status
            WHEN f.lifecycle IS NOT NULL AND f.lifecycle <> 'ACTIVE' THEN 'STALE'
            ELSE coalesce(d.decision, 'OPEN') END AS status,
          coalesce(d.decision, 'NEEDS_REVIEW') AS personalDecision,
          coalesce(d.revision, 0) AS decisionRevision,
          f.ruleset_version AS rulesetVersion, f.entity_revision AS entityRevision,
          f.rule_id AS ruleId, f.rule_version AS ruleVersion, f.rule_category AS ruleCategory,
          f.rule_input_fingerprint AS ruleInputFingerprint,
          f.comparison_fingerprint AS comparisonFingerprint,
          f.observation_context_json AS observationContextJson,
          f.lifecycle, f.observation_generation AS observationGeneration,
          f.resolved_at AS resolvedAt, f.resolution_reason AS resolutionReason,
          f.superseded_at AS supersededAt,
          f.superseded_by_finding_id AS supersededByFindingId,
          f.origin, f.author_user_id AS authorUserId,
          f.author_member_id AS authorMemberId, f.target_type AS targetType,
          f.target_member_id AS targetMemberId,
          f.personal_payment_id AS personalPaymentId,
          f.target_source_revision AS targetSourceRevision,
          f.human_note AS humanNote, f.origin_operation_id AS originOperationId,
          f.revision, f.created_at AS createdAt, f.updated_at AS updatedAt
         FROM ledger_review_findings f
         JOIN ledger_review_visibility v ON v.finding_id = f.id AND v.user_id = ?
         LEFT JOIN ledger_review_decisions d ON d.finding_id = f.id AND d.user_id = ?
         WHERE f.journey_id = ?
           AND EXISTS (SELECT 1 FROM ledger_actor_context actor
             WHERE actor.user_id = ? AND actor.journey_id = f.journey_id)
         ORDER BY CASE severity WHEN 'BLOCKING' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,
          updated_at DESC`,
          userId,
          userId,
          journeyId,
          userId,
        )
        .then((rows) =>
          rows.map((row) => ({
            ...row,
            evidenceCodes: JSON.parse(
              (row as LedgerReviewFindingDto & { evidenceCodesJson: string })
                .evidenceCodesJson,
            ) as string[],
            observationContext: (row as typeof row & { observationContextJson?: string })
              .observationContextJson
              ? (JSON.parse(
                  String(
                    (row as typeof row & { observationContextJson: string })
                      .observationContextJson,
                  ),
                ) as Record<string, unknown>)
              : null,
          })),
        );
    },

    async act(findingId: string, action: "ACKNOWLEDGED" | "DISMISSED", reason = "") {
      const userId = await getActiveUserId();
      const finding = await database.getFirstAsync<
        LedgerReviewFindingDto & {
          journeyId: string;
          expenseId: string | null;
        }
      >(
        `SELECT id, journey_id AS journeyId, expense_id AS expenseId, layer,
          status, lifecycle, revision, entity_revision AS entityRevision,
          ruleset_version AS rulesetVersion
         FROM ledger_review_findings WHERE id = ?
           AND EXISTS (SELECT 1 FROM ledger_review_visibility
             WHERE finding_id = ? AND user_id = ?)`,
        findingId,
        findingId,
        userId,
      );
      if (!finding) throw new Error("Review finding is unavailable.");
      if (finding.layer !== "HEURISTIC")
        throw new Error("Deterministic validation cannot be acknowledged or dismissed.");
      if (finding.lifecycle !== "ACTIVE")
        throw new Error("This Review finding is no longer actionable.");
      const actor = await database.getFirstAsync<{
        userId: string;
        memberId: string;
        role: string;
      }>(
        `SELECT user_id AS userId, member_id AS memberId, role
         FROM ledger_actor_context WHERE user_id = ? AND journey_id = ?`,
        userId,
        finding.journeyId,
      );
      if (!actor?.userId || !actor.memberId || !actor.role)
        throw new Error("Review action requires an authenticated Journey member.");
      const id = createLocalId("review-action");
      const now = new Date().toISOString();
      const trimmed = reason.trim();
      if (trimmed.length > 2000) throw new Error("Review reason is too long.");
      let resultId = id;
      await database.withTransactionAsync(async () => {
        const current = await database.getFirstAsync<{
          decision: string;
          lastActionId: string;
        }>(
          `SELECT decision, last_action_id AS lastActionId FROM ledger_review_decisions
           WHERE user_id = ? AND finding_id = ?`,
          userId,
          finding.id,
        );
        if (current?.decision === action && !trimmed) {
          resultId = current.lastActionId;
          return;
        }
        const decision = await database.getFirstAsync<{ revision: number }>(
          `INSERT INTO ledger_review_decisions
            (user_id, finding_id, decision, revision, last_action_id, acted_at)
           VALUES (?, ?, ?, 1, ?, ?)
           ON CONFLICT (user_id, finding_id) DO UPDATE SET
             decision = excluded.decision, revision = ledger_review_decisions.revision + 1,
             last_action_id = excluded.last_action_id, acted_at = excluded.acted_at
           RETURNING revision`,
          userId,
          finding.id,
          action,
          id,
          now,
        );
        if (!decision) throw new Error("Could not update personal Review decision.");
        const decisionRevision = decision.revision - 1;
        await database.runAsync(
          `INSERT INTO ledger_review_finding_actions (
            id, finding_id, action, actor_user_id, actor_member_id, actor_role,
            reason, finding_revision, entity_revision, ruleset_version,
            operation_id, sync_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
          id,
          finding.id,
          action,
          actor.userId,
          actor.memberId,
          actor.role,
          trimmed,
          finding.revision,
          finding.entityRevision,
          finding.rulesetVersion,
          id,
          now,
        );
        await database.runAsync(
          `INSERT INTO sync_operations (
            id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
            base_version, payload_json, owner_user_id, status, attempt_count, created_at, updated_at
          ) VALUES (?, ?, 'ledger_review', ?, 'LEDGER_REVIEW_ACTION', ?, ?, ?, ?, 'PENDING', 0, ?, ?)`,
          id,
          finding.journeyId,
          finding.id,
          id,
          finding.revision,
          JSON.stringify({
            action,
            baseRevision: finding.revision,
            decisionRevision,
            reason: trimmed || null,
            operationId: id,
          }),
          userId,
          now,
          now,
        );
      });
      changed(finding.journeyId);
      return resultId;
    },

    async raise(
      journeyId: string,
      target: Omit<LedgerReviewRaiseRequest, "id" | "operationId"> & {
        targetTitle: string;
      },
    ) {
      const userId = await getActiveUserId();
      const actor = await database.getFirstAsync<{ memberId: string }>(
        `SELECT member_id AS memberId FROM ledger_actor_context
         WHERE user_id = ? AND journey_id = ?`,
        userId,
        journeyId,
      );
      if (!actor?.memberId)
        throw new Error("Review requires an authenticated Journey member.");
      const id = createUuid();
      const now = new Date().toISOString();
      const note = target.note?.trim() || null;
      const request: LedgerReviewRaiseRequest = {
        id,
        targetType: target.targetType,
        expenseId: target.expenseId ?? null,
        targetMemberId: target.targetMemberId ?? null,
        personalPaymentId: target.personalPaymentId ?? null,
        settlementId: target.settlementId ?? null,
        sourceRevision: target.sourceRevision,
        note,
        operationId: id,
      };
      const finding: LedgerReviewFindingDto = {
        id,
        journeyId,
        expenseId: request.expenseId ?? null,
        settlementId: request.settlementId ?? null,
        layer: "HEURISTIC",
        findingType: "HUMAN_CONCERN",
        severity: "WARNING",
        confidence: null,
        evidenceCodes: ["HUMAN_REPORTED"],
        status: "OPEN",
        rulesetVersion: "ledger-review-human-v1",
        entityRevision: request.sourceRevision,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        ruleId: "HUMAN_CONCERN",
        ruleVersion: 1,
        ruleCategory: "Human",
        ruleInputFingerprint: `${request.targetType}:${request.sourceRevision}`,
        comparisonFingerprint: null,
        observationContext: {
          targetType: request.targetType,
          targetTitleSnapshot: target.targetTitle,
          targetMemberId: request.targetMemberId ?? null,
          personalPaymentId: request.personalPaymentId ?? null,
          sourceRevision: request.sourceRevision,
          note,
        },
        lifecycle: "ACTIVE",
        observationGeneration: 1,
        personalDecision: "NEEDS_REVIEW",
        decisionRevision: 0,
        origin: "HUMAN",
        authorUserId: userId,
        authorMemberId: actor.memberId,
        targetType: request.targetType,
        targetMemberId: request.targetMemberId ?? null,
        personalPaymentId: request.personalPaymentId ?? null,
        targetSourceRevision: request.sourceRevision,
        humanNote: note,
        originOperationId: id,
      };
      await database.withTransactionAsync(async () => {
        await applyReviewFinding(database, finding);
        await database.runAsync(
          `INSERT OR REPLACE INTO ledger_review_visibility
            (user_id, finding_id, journey_id) VALUES (?, ?, ?)`,
          userId,
          id,
          journeyId,
        );
        await database.runAsync(
          `INSERT INTO sync_operations (
            id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
            base_version, payload_json, owner_user_id, status, attempt_count,
            created_at, updated_at
          ) VALUES (?, ?, 'ledger_review', ?, 'RAISE_LEDGER_REVIEW_FINDING', ?, ?, ?, ?,
            'PENDING', 0, ?, ?)`,
          id,
          journeyId,
          id,
          id,
          request.sourceRevision,
          JSON.stringify(request),
          userId,
          now,
          now,
        );
      });
      changed(journeyId);
      return id;
    },

    async markRaiseSynced(finding: LedgerReviewFindingDto) {
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        await applyReviewFinding(database, finding);
        await database.runAsync(
          `INSERT OR REPLACE INTO ledger_review_visibility
            (user_id, finding_id, journey_id) VALUES (?, ?, ?)`,
          userId,
          finding.id,
          finding.journeyId,
        );
      });
      changed(finding.journeyId);
    },

    async markActionSynced(
      operationId: string,
      finding: LedgerReviewFindingDto,
      action: LedgerReviewActionDto,
    ) {
      await database.withTransactionAsync(async () => {
        await applyReviewFinding(database, finding);
        await applyReviewAction(database, action, "SYNCED");
        const newerPending = await database.getFirstAsync<{ id: string }>(
          `SELECT o.id FROM sync_operations o
           JOIN ledger_review_finding_actions a ON a.operation_id = o.id
           WHERE a.finding_id = ? AND a.actor_user_id = ? AND o.id <> ?
             AND o.status IN ('PENDING','PROCESSING','RETRYABLE') LIMIT 1`,
          finding.id,
          action.actorUserId,
          operationId,
        );
        if (!newerPending)
          await database.runAsync(
            `UPDATE ledger_review_decisions SET decision = ?, revision = ?,
            last_action_id = ?, acted_at = ? WHERE user_id = ? AND finding_id = ?`,
            finding.personalDecision ?? action.action,
            finding.decisionRevision ?? 1,
            action.id,
            action.createdAt,
            action.actorUserId,
            finding.id,
          );
        await database.runAsync(
          "UPDATE ledger_review_finding_actions SET sync_status = 'SYNCED' WHERE operation_id = ?",
          operationId,
        );
      });
      changed(finding.journeyId);
    },
    async counts(journeyId: string) {
      const userId = await getActiveUserId();
      const row = await database.getFirstAsync<{ pending: number; reviewed: number }>(
        `SELECT
           sum(CASE WHEN d.decision IS NULL THEN 1 ELSE 0 END) AS pending,
           sum(CASE WHEN d.decision IS NOT NULL THEN 1 ELSE 0 END) AS reviewed
         FROM ledger_review_visibility v
         JOIN ledger_review_findings f ON f.id = v.finding_id
         LEFT JOIN ledger_review_decisions d ON d.finding_id = f.id AND d.user_id = v.user_id
         WHERE v.user_id = ? AND v.journey_id = ? AND f.lifecycle = 'ACTIVE'
           AND f.layer = 'HEURISTIC' AND f.rule_id IS NOT NULL`,
        userId,
        journeyId,
      );
      return { pending: row?.pending ?? 0, reviewed: row?.reviewed ?? 0 };
    },
    async invalidate(journeyId: string) {
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          "DELETE FROM ledger_review_visibility WHERE user_id = ? AND journey_id = ?",
          userId,
          journeyId,
        );
        await database.runAsync(
          `DELETE FROM ledger_review_decisions WHERE user_id = ? AND finding_id IN
            (SELECT id FROM ledger_review_findings WHERE journey_id = ?)`,
          userId,
          journeyId,
        );
      });
      changed(journeyId);
    },
  };
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export async function applyReviewProjection(
  database: Database,
  userId: string,
  journeyId: string,
  findings: LedgerReviewFindingDto[],
  actions: LedgerReviewActionDto[],
) {
  if (!journeyId) return;
  await database.runAsync(
    "DELETE FROM ledger_review_visibility WHERE user_id = ? AND journey_id = ?",
    userId,
    journeyId,
  );
  for (const finding of findings) {
    await applyReviewFinding(database, finding);
    await database.runAsync(
      "INSERT OR REPLACE INTO ledger_review_visibility (user_id, finding_id, journey_id) VALUES (?, ?, ?)",
      userId,
      finding.id,
      journeyId,
    );
    const pending = await database.getFirstAsync<{ id: string }>(
      `SELECT a.id FROM ledger_review_finding_actions a
       JOIN sync_operations o ON o.id = a.operation_id
       WHERE a.finding_id = ? AND a.actor_user_id = ?
         AND o.status IN ('PENDING','PROCESSING','RETRYABLE') LIMIT 1`,
      finding.id,
      userId,
    );
    if (!pending) {
      if (finding.personalDecision && finding.personalDecision !== "NEEDS_REVIEW") {
        await database.runAsync(
          `INSERT INTO ledger_review_decisions
            (user_id, finding_id, decision, revision, last_action_id, acted_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, finding_id) DO UPDATE SET
             decision = excluded.decision, revision = excluded.revision,
             last_action_id = excluded.last_action_id, acted_at = excluded.acted_at`,
          userId,
          finding.id,
          finding.personalDecision,
          finding.decisionRevision ?? 0,
          finding.lastActionId ?? null,
          finding.decisionActedAt ?? null,
        );
      } else {
        await database.runAsync(
          "DELETE FROM ledger_review_decisions WHERE user_id = ? AND finding_id = ?",
          userId,
          finding.id,
        );
      }
    }
  }
  for (const action of actions)
    if (action.actorUserId === userId) await applyReviewAction(database, action);
  await database.runAsync(
    `INSERT OR IGNORE INTO ledger_review_visibility (user_id, finding_id, journey_id)
     SELECT owner_user_id, entity_id, trip_id FROM sync_operations
     WHERE owner_user_id = ? AND trip_id = ?
       AND operation_type = 'RAISE_LEDGER_REVIEW_FINDING'
       AND status IN ('PENDING','PROCESSING','RETRYABLE')`,
    userId,
    journeyId,
  );
  await database.runAsync(
    `DELETE FROM ledger_review_decisions WHERE user_id = ? AND finding_id NOT IN
      (SELECT finding_id FROM ledger_review_visibility WHERE user_id = ?)`,
    userId,
    userId,
  );
}

async function defaultGetActiveUserId() {
  return (await import("@/data/auth/authRepository")).requireActiveUserId();
}

export async function applyReviewFinding(
  database: Database,
  finding: LedgerReviewFindingDto,
) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_review_findings (
      id, journey_id, expense_id, settlement_id, layer, finding_type, severity,
      confidence, evidence_codes_json, status, ruleset_version, entity_revision,
      revision, created_at, updated_at, rule_id, rule_version, rule_category,
      rule_input_fingerprint, comparison_fingerprint, observation_context_json,
      lifecycle, observation_generation, resolved_at, resolution_reason,
      superseded_at, superseded_by_finding_id, origin, author_user_id,
      author_member_id, target_type, target_member_id, personal_payment_id,
      target_source_revision, human_note, origin_operation_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    finding.id,
    finding.journeyId,
    finding.expenseId,
    finding.settlementId,
    finding.layer,
    finding.findingType,
    finding.severity,
    finding.confidence,
    JSON.stringify(finding.evidenceCodes),
    finding.status,
    finding.rulesetVersion,
    finding.entityRevision,
    finding.revision,
    finding.createdAt,
    finding.updatedAt,
    finding.ruleId ?? null,
    finding.ruleVersion ?? null,
    finding.ruleCategory ?? null,
    finding.ruleInputFingerprint ?? null,
    finding.comparisonFingerprint ?? null,
    finding.observationContext ? JSON.stringify(finding.observationContext) : null,
    finding.lifecycle ?? null,
    finding.observationGeneration ?? null,
    finding.resolvedAt ?? null,
    finding.resolutionReason ?? null,
    finding.supersededAt ?? null,
    finding.supersededByFindingId ?? null,
    finding.origin ?? "SYSTEM",
    finding.authorUserId ?? null,
    finding.authorMemberId ?? null,
    finding.targetType ?? null,
    finding.targetMemberId ?? null,
    finding.personalPaymentId ?? null,
    finding.targetSourceRevision ?? null,
    finding.humanNote ?? null,
    finding.originOperationId ?? null,
  );
}

export async function applyReviewAction(
  database: Database,
  action: LedgerReviewActionDto,
  syncStatus = "SYNCED",
) {
  await database.runAsync(
    `INSERT OR IGNORE INTO ledger_review_finding_actions (
      id, finding_id, action, actor_user_id, actor_member_id, actor_role, reason,
      finding_revision, entity_revision, ruleset_version, operation_id, sync_status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    action.id,
    action.findingId,
    action.action,
    action.actorUserId,
    action.actorMemberId,
    action.actorRole,
    action.reason ?? "",
    action.findingRevision,
    action.entityRevision,
    action.rulesetVersion,
    action.operationId,
    syncStatus,
    action.createdAt,
  );
}
