import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { readUniversalActivities } from "./universalActivityReader";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type {
  UniversalExecutionContext,
  UniversalTaskActivity,
} from "../api/universalImportContracts";
function fixture() {
  const accountId = randomUUID(),
    tripId = randomUUID();
  const jobs = Array.from({ length: 2 }, () => ({
    batch: { accountId, batchId: randomUUID(), context: { tripPrior: { id: tripId } } },
    allInputsAccepted: true,
  })) as CaptureJobReadModel[];
  const activity: UniversalTaskActivity = {
    state: "RESULTS_READY",
    recordedAt: "2026-10-28T00:00:00Z",
    updatedAt: "2026-10-28T00:01:00Z",
    completedAt: "2026-10-28T00:01:00Z",
    rowRevision: 2,
    attemptCount: 1,
    waitReason: null,
  };
  const context = vi.fn(
    async (_: unknown, batchId: string): Promise<UniversalExecutionContext> => ({
      version: "otr.backend.universal-context/1",
      accountId,
      actorId: accountId,
      tripId,
      batchId,
      taskId: randomUUID(),
      activity,
    }),
  );
  return {
    jobs,
    activity,
    context,
    getAccountId: async () => accountId,
    isCurrent: () => true,
  };
}
it("projects only existing context observations in sequence, without any dispatch port", async () => {
  const f = fixture();
  const result = await readUniversalActivities(f.jobs, f);
  expect(Object.keys(result)).toEqual(f.jobs.map((j) => j.batch.batchId));
  expect(Object.values(result)).toEqual([f.activity, f.activity]);
  expect(f.context).toHaveBeenCalledTimes(2);
});
it("does not label offline or unprepared batches failed", async () => {
  const f = fixture();
  f.context.mockRejectedValueOnce(Error("TASK_NOT_FOUND"));
  expect(Object.keys(await readUniversalActivities(f.jobs, f))).toEqual([
    f.jobs[1].batch.batchId,
  ]);
});
it("rejects a context from another Batch or Actor", async () => {
  const f = fixture();
  const binding = await f.context({}, randomUUID());
  f.context.mockResolvedValueOnce(binding).mockResolvedValueOnce({
    ...binding,
    batchId: f.jobs[1].batch.batchId,
    actorId: randomUUID(),
  });
  expect(await readUniversalActivities(f.jobs, f)).toEqual({});
});
it("discards the whole observation on late account transition and stops further GETs", async () => {
  const f = fixture();
  f.context.mockImplementationOnce(async (_, batchId) => {
    advanceAccountGeneration();
    return {
      version: "otr.backend.universal-context/1",
      accountId: f.jobs[0].batch.accountId,
      actorId: f.jobs[0].batch.accountId,
      tripId: f.jobs[0].batch.context.tripPrior!.id,
      batchId,
      taskId: randomUUID(),
      activity: f.activity,
    };
  });
  expect(await readUniversalActivities(f.jobs, f)).toEqual({});
  expect(f.context).toHaveBeenCalledOnce();
});
it("skips incomplete intake and wrong account inventory", async () => {
  const f = fixture();
  f.jobs[0].allInputsAccepted = false;
  expect(
    await readUniversalActivities(f.jobs, {
      ...f,
      getAccountId: async () => randomUUID(),
    }),
  ).toEqual({});
  expect(f.context).not.toHaveBeenCalled();
});

it("reports each validated observation before slower older batches finish", async () => {
  const f = fixture();
  let release!: (value: UniversalExecutionContext) => void;
  const second = new Promise<UniversalExecutionContext>((resolve) => {
    release = resolve;
  });
  const binding = await f.context({}, f.jobs[1].batch.batchId);
  f.context.mockClear();
  f.context
    .mockImplementationOnce(async () => ({
      ...binding,
      batchId: f.jobs[0].batch.batchId,
    }))
    .mockImplementationOnce(() => second);
  const onObservation = vi.fn();
  const work = readUniversalActivities(f.jobs, { ...f, onObservation });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(onObservation).toHaveBeenCalledExactlyOnceWith(
    f.jobs[0].batch.batchId,
    f.activity,
  );
  release(binding);
  await work;
  expect(onObservation).toHaveBeenCalledTimes(2);
});

it("does not emit late observations after account invalidation", async () => {
  const f = fixture();
  const binding = await f.context({}, f.jobs[0].batch.batchId);
  f.context.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    return binding;
  });
  const onObservation = vi.fn();
  expect(await readUniversalActivities(f.jobs, { ...f, onObservation })).toEqual({});
  expect(onObservation).not.toHaveBeenCalled();
});
