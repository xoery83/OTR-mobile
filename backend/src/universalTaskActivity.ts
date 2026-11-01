import { universalTaskActivitySchema } from "../../src/data/api/universalImportContracts";
import type { Task } from "../../src/domain/intelligence/persistence";

// Interpretation completion is distinct from Review resolution or Core Save.
export function projectUniversalTaskActivity(
  task: Task,
  attemptCount: number,
  observedAt = Date.now(),
) {
  const states = {
    PENDING: "PENDING",
    WAITING: "WAITING",
    RUNNING: "PROCESSING",
    RESULT_PENDING: "PROCESSING",
    PUBLISHED: "RESULTS_READY",
    FAILED: "FAILED",
    CANCELED: "CANCELED",
    STALE: "STALE",
    UNKNOWN: "UNKNOWN",
  } as const;
  // An expired unstarted Task cannot legally dispatch; attempts/UNKNOWN still require recovery.
  const expiredBeforeStart =
    attemptCount === 0 &&
    ["PENDING", "WAITING"].includes(task.work_disposition) &&
    task.policy_snapshot.deadline !== null &&
    Date.parse(task.policy_snapshot.deadline) <= observedAt;
  // An overdue started run is unconfirmed, not failed or safe to redispatch.
  const overdueRun = attemptCount > 0 && task.work_disposition === "RUNNING" &&
    task.policy_snapshot.deadline !== null &&
    Date.parse(task.policy_snapshot.deadline) <= observedAt;
  return universalTaskActivitySchema.parse({
    state: expiredBeforeStart ? "FAILED" : overdueRun ? "UNKNOWN" : states[task.work_disposition],
    recordedAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    rowRevision: task.row_revision,
    attemptCount,
    waitReason: task.wait_reason,
  });
}
