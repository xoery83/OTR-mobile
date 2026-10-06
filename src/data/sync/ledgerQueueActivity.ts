import type { WakeQueueDatabase } from "./syncOperationRepository";
import { intelligenceWakeKind } from "@/domain/intelligence/persistence";

export type QueueRow = {
  status: string;
  failureCategory: string | null;
  nextAttemptAt: string | null;
  leaseExpiresAt: string | null;
  dependencyStatus: string | null;
};

export type LedgerQueueActivity = {
  unresolvedCount: number;
  actionableNow: number;
  nextActionableAt: number | null;
};

const workListeners = new Set<() => void>();

export function subscribeLedgerQueueWorkAvailable(listener: () => void) {
  workListeners.add(listener);
  return () => workListeners.delete(listener);
}

export function announceLedgerQueueWorkAvailable() {
  for (const listener of workListeners) listener();
}

export function classifyLedgerQueueActivity(
  rows: readonly QueueRow[],
  now = Date.now(),
): LedgerQueueActivity {
  let actionableNow = 0;
  let nextActionableAt: number | null = null;
  const consider = (at: string | null) => {
    const due = at === null ? now : Date.parse(at);
    if (!Number.isFinite(due) || due <= now) actionableNow += 1;
    else nextActionableAt = Math.min(nextActionableAt ?? due, due);
  };
  for (const row of rows) {
    if (row.failureCategory === "AUTH") continue;
    if (row.dependencyStatus && row.dependencyStatus !== "COMPLETED") continue;
    if (row.failureCategory === "DEPENDENCY" && row.dependencyStatus !== "COMPLETED")
      continue;
    if (row.status === "PENDING" || row.status === "RETRYABLE")
      consider(row.nextAttemptAt);
    else if (row.status === "PROCESSING" && row.leaseExpiresAt)
      consider(row.leaseExpiresAt);
    else if (row.status === "DEPENDENCY_BLOCKED" && row.dependencyStatus === "COMPLETED")
      actionableNow += 1;
  }
  return { unresolvedCount: rows.length, actionableNow, nextActionableAt };
}

export async function getLedgerQueueActivity(journeyId: string | null = null) {
  const [{ openDatabase }, { requireActiveUserId }] = await Promise.all([
    import("@/data/db/database"),
    import("@/data/auth/authRepository"),
  ]);
  const database = await openDatabase();
  const userId = await requireActiveUserId();
  const scope = journeyId ? "AND operation.trip_id = ?" : "";
  const assetScope = journeyId ? "AND operation.journey_id = ?" : "";
  const entityScope = journeyId
    ? "operation.entity_type LIKE 'ledger_%'"
    : "(operation.entity_type LIKE 'ledger_%' OR operation.entity_type = 'settlement_review')";
  const rows = await database.getAllAsync<QueueRow>(
    `SELECT operation.status, operation.failure_category AS failureCategory,
       operation.next_attempt_at AS nextAttemptAt,
       operation.lease_expires_at AS leaseExpiresAt,
       CASE WHEN dependency.operation_type='INTELLIGENCE_CONTINUATION_WAKE'
         THEN 'WAITING' ELSE dependency.status END AS dependencyStatus
     FROM sync_operations operation
     LEFT JOIN sync_operations dependency
       ON dependency.id = operation.dependency_operation_id
      AND dependency.owner_user_id = operation.owner_user_id
     WHERE operation.owner_user_id = ? AND ${entityScope}
       AND operation.status IN ('PENDING', 'PROCESSING', 'RETRYABLE',
         'DEPENDENCY_BLOCKED', 'FAILED', 'CONFLICT') ${scope}
     UNION ALL
     SELECT operation.status, operation.failure_category AS failureCategory,
       operation.next_attempt_at AS nextAttemptAt,
       operation.lease_expires_at AS leaseExpiresAt,
       CASE WHEN operation.operation_type = 'LINK_RECEIPT'
         AND (asset.server_id IS NULL OR asset.upload_status <> 'UPLOADED')
         THEN 'WAITING' ELSE dependency.status END AS dependencyStatus
     FROM ledger_asset_operations operation
     LEFT JOIN ledger_receipt_assets asset ON asset.id = operation.asset_id
       AND asset.journey_id = operation.journey_id
     LEFT JOIN ledger_asset_operations dependency
       ON dependency.id = operation.dependency_operation_id
       AND dependency.owner_user_id = operation.owner_user_id
       AND dependency.asset_id = operation.asset_id
       AND dependency.journey_id = operation.journey_id
       AND dependency.operation_type = 'UPLOAD_RECEIPT'
     WHERE operation.owner_user_id = ?
       AND operation.status IN ('PENDING', 'PROCESSING', 'RETRYABLE', 'FAILED')
       ${assetScope}`,
    userId,
    ...(journeyId ? [journeyId] : []),
    userId,
    ...(journeyId ? [journeyId] : []),
  );
  return classifyLedgerQueueActivity(rows);
}

// Scheduler-only activity. Never included in Ledger UI counts.
export async function getIntelligenceQueueActivity(
  db: WakeQueueDatabase,
  accountId: string,
) {
  const rows = await db.getAllAsync<QueueRow>(
    `SELECT status,failure_category AS failureCategory,
    next_attempt_at AS nextAttemptAt,lease_expires_at AS leaseExpiresAt,
    NULL AS dependencyStatus FROM sync_operations WHERE owner_user_id=?
    AND operation_type=?
    AND status IN ('PENDING','RETRYABLE','PROCESSING')`,
    accountId,
    intelligenceWakeKind,
  );
  return { scope: "INTELLIGENCE" as const, ...classifyLedgerQueueActivity(rows) };
}
