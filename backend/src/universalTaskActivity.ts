import { universalTaskActivitySchema } from "../../src/data/api/universalImportContracts";
import type { Task } from "../../src/domain/intelligence/persistence";

// Interpretation completion is distinct from Review resolution or Core Save.
export function projectUniversalTaskActivity(task: Task, attemptCount: number) {
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
  return universalTaskActivitySchema.parse({
    state: states[task.work_disposition],
    recordedAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    rowRevision: task.row_revision,
    attemptCount,
    waitReason: task.wait_reason,
  });
}
