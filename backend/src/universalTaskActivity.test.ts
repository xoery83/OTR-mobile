import { expect, it } from "vitest";
import type { Task } from "../../src/domain/intelligence/persistence";
import { projectUniversalTaskActivity } from "./universalTaskActivity";
const task = {
  created_at: "2026-10-28T00:00:00Z",
  updated_at: "2026-10-28T00:01:00Z",
  completed_at: null,
  row_revision: 3,
  wait_reason: null,
} as Task;
it.each([
  ["PENDING", "PENDING"],
  ["WAITING", "WAITING"],
  ["RUNNING", "PROCESSING"],
  ["RESULT_PENDING", "PROCESSING"],
  ["PUBLISHED", "RESULTS_READY"],
  ["FAILED", "FAILED"],
  ["CANCELED", "CANCELED"],
  ["STALE", "STALE"],
  ["UNKNOWN", "UNKNOWN"],
] as const)(
  "projects actual %s without inventing Review or Save",
  (work_disposition, state) => {
    const raw = { ...task, work_disposition };
    expect(projectUniversalTaskActivity(raw, 1)).toEqual({
      state,
      recordedAt: task.created_at,
      updatedAt: task.updated_at,
      completedAt: null,
      rowRevision: 3,
      attemptCount: 1,
      waitReason: null,
    });
    expect(raw).toEqual({ ...task, work_disposition });
  },
);
it("preserves owning wait, completion time and revision; rejects corrupt observations", () => {
  expect(
    projectUniversalTaskActivity(
      { ...task, work_disposition: "WAITING", wait_reason: "WAITING_FOR_AUTH" },
      0,
    ).waitReason,
  ).toBe("WAITING_FOR_AUTH");
  expect(
    projectUniversalTaskActivity(
      { ...task, work_disposition: "PUBLISHED", completed_at: task.updated_at },
      1,
    ).completedAt,
  ).toBe(task.updated_at);
  for (const patch of [
    { row_revision: 0 },
    { updated_at: "invalid" },
    { work_disposition: "invented" },
  ])
    expect(() =>
      projectUniversalTaskActivity(
        { ...task, work_disposition: "PENDING", ...patch } as Task,
        0,
      ),
    ).toThrow();
  expect(() =>
    projectUniversalTaskActivity({ ...task, work_disposition: "PENDING" }, 2),
  ).toThrow();
});
