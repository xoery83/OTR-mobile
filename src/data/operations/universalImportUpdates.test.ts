import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { UniversalTaskActivity } from "@/data/api/universalImportContracts";
import {
  projectUniversalImportUpdates,
  readDefaultUniversalImportUpdates,
  reopenDefaultUniversalImportUpdate,
} from "./universalImportUpdates";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
const source = vi.hoisted(() => ({
  account: "",
  list: vi.fn(),
  read: vi.fn(),
  reopen: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({
  requireActiveUserId: async () => source.account,
}));
vi.mock("./defaultCaptureSubmission", () => ({
  listDefaultCaptureJobs: source.list,
  reopenDefaultCaptureJob: source.reopen,
}));
vi.mock("./universalActivityReader", () => ({
  readDefaultUniversalActivities: source.read,
}));
beforeEach(() => {
  vi.resetAllMocks();
});
function fixture() {
  const accountId = randomUUID(),
    tripId = randomUUID(),
    batchId = randomUUID();
  const job = {
    batch: {
      accountId,
      batchId,
      jobId: randomUUID(),
      context: { tripPrior: { id: tripId } },
    },
    allInputsAccepted: true,
  } as CaptureJobReadModel;
  const activity: UniversalTaskActivity = {
    state: "RESULTS_READY",
    recordedAt: "2026-10-28T00:00:00Z",
    updatedAt: "2026-10-28T00:01:00Z",
    completedAt: "2026-10-28T00:01:00Z",
    attemptCount: 1,
    rowRevision: 3,
    waitReason: null,
  };
  const observations = { [batchId]: activity };
  return { accountId, tripId, batchId, job, activity, observations };
}
it("one stable Batch event changes in place on newer state and does not invent Save or Review", () => {
  const f = fixture();
  const first = projectUniversalImportUpdates(
    f.accountId,
    f.tripId,
    [f.job, f.job],
    f.observations,
  );
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({
    id: `universal-import:${f.batchId}`,
    state: "RESULTS_READY",
    jobId: f.job.batch.jobId,
  });
  expect(first[0]).not.toHaveProperty("unread");
  expect(first[0]).not.toHaveProperty("saved");
  const next = projectUniversalImportUpdates(f.accountId, f.tripId, [f.job], {
    [f.batchId]: { ...f.activity, state: "STALE", rowRevision: 4 },
  });
  expect(next[0].id).toBe(first[0].id);
  expect(next[0].state).toBe("STALE");
});
it("excludes other Accounts/Trips, unaccepted and unobserved Batches", () => {
  const f = fixture();
  expect(
    projectUniversalImportUpdates(randomUUID(), null, [f.job], f.observations),
  ).toEqual([]);
  expect(
    projectUniversalImportUpdates(f.accountId, randomUUID(), [f.job], f.observations),
  ).toEqual([]);
  expect(
    projectUniversalImportUpdates(
      f.accountId,
      null,
      [{ ...f.job, allInputsAccepted: false }],
      f.observations,
    ),
  ).toEqual([]);
  expect(projectUniversalImportUpdates(f.accountId, null, [f.job], {})).toEqual([]);
});
it("routine pending, canceled and invalid status do not become notifications", () => {
  const f = fixture();
  for (const state of ["PENDING", "PROCESSING", "WAITING", "CANCELED", "FORGED"]) {
    expect(
      projectUniversalImportUpdates(f.accountId, null, [f.job], {
        [f.batchId]: { ...f.activity, state } as UniversalTaskActivity,
      }),
    ).toEqual([]);
  }
});
it("sorts actual server timestamps and removes an obsolete failed event when owning state becomes processing", () => {
  const f = fixture();
  expect(
    projectUniversalImportUpdates(f.accountId, null, [f.job], {
      [f.batchId]: { ...f.activity, state: "FAILED" },
    })[0].state,
  ).toBe("FAILED");
  expect(
    projectUniversalImportUpdates(f.accountId, null, [f.job], {
      [f.batchId]: { ...f.activity, state: "PROCESSING" },
    }),
  ).toEqual([]);
});

it("default source publishes only current Account observations and reopens the exact repository Batch", async () => {
  const f = fixture();
  source.account = f.accountId;
  source.list.mockResolvedValue([
    f.job,
    { ...f.job, batch: { ...f.job.batch, accountId: randomUUID() } },
  ]);
  source.read.mockImplementation(async (jobs, current, emit) => {
    expect(jobs).toEqual([f.job]);
    expect(current()).toBe(true);
    emit(f.batchId, f.activity);
  });
  const observed = vi.fn();
  await readDefaultUniversalImportUpdates(f.tripId, () => true, observed);
  expect(observed).toHaveBeenCalled();
  const [cards, context] = observed.mock.calls[0];
  source.reopen.mockResolvedValue(f.job);
  await expect(reopenDefaultUniversalImportUpdate(context, cards[0])).resolves.toBe(
    f.job,
  );
  expect(source.reopen).toHaveBeenCalledExactlyOnceWith(f.job.batch.jobId);
});
it("late status after an Account generation change cannot become an Update", async () => {
  const f = fixture();
  source.account = f.accountId;
  source.list.mockResolvedValue([f.job]);
  source.read.mockImplementation(async (_jobs, _current, emit) => {
    advanceAccountGeneration();
    emit(f.batchId, f.activity);
  });
  const observed = vi.fn();
  await expect(
    readDefaultUniversalImportUpdates(f.tripId, () => true, observed),
  ).rejects.toThrow();
  expect(observed).not.toHaveBeenCalled();
});
it("open rejects a replaced repository Batch and never repairs or dispatches it", async () => {
  const f = fixture();
  source.account = f.accountId;
  const context = await captureAccountRequestContext("", async () => f.accountId);
  const card = projectUniversalImportUpdates(
    f.accountId,
    f.tripId,
    [f.job],
    f.observations,
  )[0];
  source.reopen.mockResolvedValue({
    ...f.job,
    batch: { ...f.job.batch, batchId: randomUUID() },
  });
  await expect(reopenDefaultUniversalImportUpdate(context, card)).rejects.toThrow(
    "UPDATES_SOURCE_UNAVAILABLE",
  );
  source.reopen.mockClear();
  await expect(
    reopenDefaultUniversalImportUpdate(context, { ...card, accountId: randomUUID() }),
  ).rejects.toThrow("UPDATES_SOURCE_UNAVAILABLE");
  expect(source.reopen).not.toHaveBeenCalled();
});
it("closed view does not emit or fetch any Task and open never crosses a late Account switch", async () => {
  const f = fixture();
  source.account = f.accountId;
  source.list.mockResolvedValue([f.job]);
  const observed = vi.fn();
  await readDefaultUniversalImportUpdates(f.tripId, () => false, observed);
  expect(source.read).not.toHaveBeenCalled();
  expect(observed).not.toHaveBeenCalled();
  const context = await captureAccountRequestContext("", async () => f.accountId);
  const card = projectUniversalImportUpdates(
    f.accountId,
    f.tripId,
    [f.job],
    f.observations,
  )[0];
  source.reopen.mockImplementationOnce(async () => {
    source.account = randomUUID();
    advanceAccountGeneration();
    return f.job;
  });
  await expect(reopenDefaultUniversalImportUpdate(context, card)).rejects.toThrow();
});
