import { expect, it } from "vitest";
import type { Task } from "../../src/domain/intelligence/persistence";
import { projectUniversalTaskActivity } from "./universalTaskActivity";
const task = {
  created_at: "2026-10-28T00:00:00Z",
  updated_at: "2026-10-28T00:01:00Z",
  completed_at: null,
  row_revision: 3,
  wait_reason: null,
  policy_snapshot: { deadline: null },
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

it("stops waiting after the owning deadline only when execution has never started", () => {
  const deadline = "2026-10-31T18:20:33.121Z";
  const observedAt = Date.parse(deadline);
  const raw = {
    ...task,
    policy_snapshot: { ...task.policy_snapshot, deadline },
    work_disposition: "PENDING" as const,
  };
  expect(projectUniversalTaskActivity(raw, 0, observedAt - 1).state).toBe("PENDING");
  expect(projectUniversalTaskActivity(raw, 0, observedAt).state).toBe("FAILED");
  expect(projectUniversalTaskActivity(raw, 1, observedAt).state).toBe("PENDING");
  expect(
    projectUniversalTaskActivity({ ...raw, work_disposition: "WAITING" }, 0, observedAt).state,
  ).toBe("FAILED");
  for (const [work_disposition, state] of [
    ["RUNNING", "PROCESSING"],
    ["RESULT_PENDING", "PROCESSING"],
    ["PUBLISHED", "RESULTS_READY"],
    ["UNKNOWN", "UNKNOWN"],
  ] as const)
    expect(
      projectUniversalTaskActivity({ ...raw, work_disposition }, 0, observedAt).state,
    ).toBe(state);
  expect(raw.work_disposition).toBe("PENDING");
  expect(raw.policy_snapshot.deadline).toBe(deadline);
});
