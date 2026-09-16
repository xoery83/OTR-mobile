import type * as SQLite from "expo-sqlite";

import type {
  LedgerReviewActionDto,
  LedgerReviewFindingDto,
} from "@/data/api/ledgerReviewContracts";
import { createLocalId } from "@/domain/localId";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export function createLedgerReviewRepository(
  database: Database,
  getActiveUserId: () => Promise<string> = defaultGetActiveUserId,
) {
  return {
    async apply(findings: LedgerReviewFindingDto[], actions: LedgerReviewActionDto[]) {
      await database.withTransactionAsync(async () => {
        for (const finding of findings) await applyReviewFinding(database, finding);
        for (const action of actions) await applyReviewAction(database, action);
      });
    },
    async list(journeyId: string) {
      const userId = await getActiveUserId();
      return database
        .getAllAsync<LedgerReviewFindingDto>(
          `SELECT id, journey_id AS journeyId, expense_id AS expenseId,
          settlement_id AS settlementId, layer, finding_type AS findingType,
          severity, confidence, evidence_codes_json AS evidenceCodesJson, status,
          ruleset_version AS rulesetVersion, entity_revision AS entityRevision,
          revision, created_at AS createdAt, updated_at AS updatedAt
         FROM ledger_review_findings WHERE journey_id = ?
           AND EXISTS (SELECT 1 FROM ledger_actor_context actor
             WHERE actor.user_id = ? AND actor.journey_id = ledger_review_findings.journey_id)
         ORDER BY CASE severity WHEN 'BLOCKING' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,
          updated_at DESC`,
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
          })),
        );
    },

    async act(findingId: string, action: "ACKNOWLEDGED" | "DISMISSED", reason: string) {
      const userId = await getActiveUserId();
      const finding = await database.getFirstAsync<
        LedgerReviewFindingDto & {
          journeyId: string;
          expenseId: string | null;
        }
      >(
        `SELECT id, journey_id AS journeyId, expense_id AS expenseId, layer,
          status, revision, entity_revision AS entityRevision,
          ruleset_version AS rulesetVersion
         FROM ledger_review_findings WHERE id = ?`,
        findingId,
      );
      if (!finding) throw new Error("Review finding is unavailable.");
      if (finding.layer !== "HEURISTIC")
        throw new Error("Deterministic validation cannot be acknowledged or dismissed.");
      if (!["OPEN", "ACKNOWLEDGED", "DISMISSED"].includes(finding.status))
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
      const expense = finding.expenseId
        ? await database.getFirstAsync<{ creatorMemberId: string | null }>(
            "SELECT creator_member_id AS creatorMemberId FROM ledger_expenses WHERE id = ? OR server_id = ?",
            finding.expenseId,
            finding.expenseId,
          )
        : null;
      if (actor.role !== "owner" && expense?.creatorMemberId !== actor.memberId)
        throw new Error("Only the Expense creator or Organizer can act on this finding.");

      const id = createLocalId("review-action");
      const now = new Date().toISOString();
      const trimmed = reason.trim();
      if (!trimmed) throw new Error("A Review action needs a reason.");
      await database.withTransactionAsync(async () => {
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
          "UPDATE ledger_review_findings SET status = ?, updated_at = ? WHERE id = ?",
          action,
          now,
          finding.id,
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
            reason: trimmed,
            operationId: id,
          }),
          userId,
          now,
          now,
        );
      });
      return id;
    },

    async markActionSynced(
      operationId: string,
      finding: LedgerReviewFindingDto,
      action: LedgerReviewActionDto,
    ) {
      await database.withTransactionAsync(async () => {
        await applyReviewFinding(database, finding);
        await applyReviewAction(database, action, "SYNCED");
        await database.runAsync(
          "UPDATE ledger_review_finding_actions SET sync_status = 'SYNCED' WHERE operation_id = ?",
          operationId,
        );
      });
    },
  };
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
      revision, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    action.reason,
    action.findingRevision,
    action.entityRevision,
    action.rulesetVersion,
    action.operationId,
    syncStatus,
    action.createdAt,
  );
}
