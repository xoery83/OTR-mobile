import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { readUniversalActivities } from "./universalActivityReader";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type {
  UniversalExecutionContext,
  UniversalTaskActivity,
} from "../api/universalImportContracts";
const adapter = vi.hoisted(() => ({
  account: vi.fn(),
  context: vi.fn(),
  capability: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: adapter.account }));
vi.mock("../api/universalImportTransport", () => ({
  createUniversalImportTransport: () => ({
    context: adapter.context,
    localFirstCapability: adapter.capability,
  }),
}));
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

it("reads completion details only after a valid READY observation and preserves it when details fail", async () => {
  const f = fixture(),
    onObservation = vi.fn(),
    onReady = vi.fn().mockRejectedValue(Error("OFFLINE"));
  const pending = await f.context({}, f.jobs[1].batch.batchId);
  f.context
    .mockResolvedValueOnce({ ...pending, batchId: f.jobs[0].batch.batchId })
    .mockResolvedValueOnce({
      ...pending,
      activity: { ...f.activity, state: "PROCESSING" },
    });
  const observed = await readUniversalActivities(f.jobs, {
    ...f,
    onObservation,
    onReady,
  });
  expect(onReady).toHaveBeenCalledOnce();
  expect(onObservation).toHaveBeenCalledTimes(2);
  expect(observed[f.jobs[0].batch.batchId].state).toBe("RESULTS_READY");
  expect(onObservation.mock.invocationCallOrder[0]).toBeLessThan(
    onReady.mock.invocationCallOrder[0],
  );
});

it("emits all lightweight observations before an unresolved first detail read", async () => {
  const f = fixture(),
    onObservation = vi.fn();
  let release!: () => void;
  const slow = new Promise<void>((resolve) => {
    release = resolve;
  });
  const onReady = vi
    .fn()
    .mockImplementationOnce(() => slow)
    .mockResolvedValueOnce(undefined);
  const work = readUniversalActivities(f.jobs, {
    ...f,
    onObservation,
    onReady,
  });
  try {
    for (let i = 0; i < 24; i++) await Promise.resolve();
    expect(f.context).toHaveBeenCalledTimes(2);
    expect(onObservation.mock.calls.map(([id]) => id)).toEqual(
      f.jobs.map((j) => j.batch.batchId),
    );
    expect(onReady).toHaveBeenCalledOnce();
    expect(onObservation.mock.invocationCallOrder[1]).toBeLessThan(
      onReady.mock.invocationCallOrder[0],
    );
  } finally {
    release();
    await work;
  }
  expect(onReady.mock.calls.map(([job]) => job.batch.batchId)).toEqual(
    f.jobs.map((j) => j.batch.batchId),
  );
  expect(f.context).toHaveBeenCalledTimes(2);
});

it("stops queued detail reads and discards return value when generation changes in first detail", async () => {
  const f = fixture(),
    onObservation = vi.fn();
  const onReady = vi.fn(async () => {
    advanceAccountGeneration();
  });
  expect(await readUniversalActivities(f.jobs, { ...f, onObservation, onReady })).toEqual(
    {},
  );
  expect(f.context).toHaveBeenCalledTimes(2);
  expect(onObservation).toHaveBeenCalledTimes(2);
  expect(onReady).toHaveBeenCalledOnce();
});

it("rechecks the owning Account before queued details and stops without calling them", async () => {
  const f = fixture(),
    onReady = vi.fn();
  let account = f.jobs[0].batch.accountId;
  const observed = await readUniversalActivities(f.jobs, {
    ...f,
    getAccountId: async () => account,
    onObservation: (batchId) => {
      if (batchId === f.jobs[1].batch.batchId) account = randomUUID();
    },
    onReady,
  });
  expect(observed).toEqual({});
  expect(f.context).toHaveBeenCalledTimes(2);
  expect(onReady).not.toHaveBeenCalled();
});

it("retains both Task statuses and continues same-order details after a first detail failure", async () => {
  const f = fixture(),
    onReady = vi
      .fn()
      .mockRejectedValueOnce(Error("RESULTS_503"))
      .mockResolvedValueOnce(undefined);
  expect(Object.keys(await readUniversalActivities(f.jobs, { ...f, onReady }))).toEqual(
    f.jobs.map((j) => j.batch.batchId),
  );
  expect(onReady.mock.calls.map(([job]) => job.batch.batchId)).toEqual(
    f.jobs.map((j) => j.batch.batchId),
  );
  expect(f.context).toHaveBeenCalledTimes(2);
});

it("cold activity reads use persisted original attribution without changing Account intake", async () => {
  const f = fixture(),
    tripId = f.jobs[0].batch.context.tripPrior!.id;
  for (const job of f.jobs) {
    job.batch.context.tripPrior = null;
    job.assignedTripId = tripId;
  }
  expect(Object.keys(await readUniversalActivities(f.jobs, f))).toHaveLength(2);
  expect(f.jobs.every((job) => job.batch.context.tripPrior === null)).toBe(true);
});

it("V3 reads two independent batches, never uses V2 context or dispatch, and preserves UNKNOWN", async () => {
  const { readV3Activities } = await import("./universalActivityReader");
  const f = fixture();
  const observe = vi.fn();
  const saves = vi.fn();
  const execution = vi
    .fn()
    .mockResolvedValueOnce({ state: "OUTCOME_UNKNOWN", taskId: randomUUID() })
    .mockResolvedValueOnce({
      state: "REVIEW_READY",
      taskId: randomUUID(),
      candidates: [],
    });
  await readV3Activities(f.jobs, { ...f, execution, saves, onObservation: observe });
  expect(observe.mock.calls).toEqual([
    [f.jobs[0].batch.batchId, { state: "uncertain", saved: 0 }],
    [f.jobs[1].batch.batchId, { state: "empty", saved: 0 }],
  ]);
  expect(saves).not.toHaveBeenCalled();
  expect(f.context).not.toHaveBeenCalled();
});
it("V3 completed requires all original receipts; late observations are discarded", async () => {
  const { readV3Activities } = await import("./universalActivityReader");
  const f = fixture();
  const observe = vi.fn();
  const state = {
    state: "REVIEW_READY",
    taskId: randomUUID(),
    candidates: [{ candidateId: "one" }],
  } as const;
  let current = true;
  await readV3Activities(f.jobs, {
    ...f,
    isCurrent: () => current,
    execution: async () => state as any,
    saves: async () => {
      current = false;
      return { one: "VERIFIED" };
    },
    onObservation: observe,
  });
  expect(observe).toHaveBeenCalledTimes(1);
  expect(observe.mock.calls[0][1].state).toBe("checking");
});

it("an explicitly legacy batch is not relabelled as V3 waiting", async () => {
  const { readV3Activities } = await import("./universalActivityReader");
  const f = fixture(),
    observe = vi.fn();
  await readV3Activities(f.jobs, {
    ...f,
    execution: async () => undefined,
    saves: vi.fn(),
    onObservation: observe,
  });
  expect(observe).not.toHaveBeenCalled();
});
it("a receipt read error leaves V3 uncertain rather than stuck checking or failed", async () => {
  const { readV3Activities } = await import("./universalActivityReader");
  const f = fixture(),
    observe = vi.fn();
  await readV3Activities([f.jobs[0]], {
    ...f,
    execution: async () =>
      ({
        state: "REVIEW_READY",
        taskId: "task",
        candidates: [{ candidateId: "candidate" }],
      }) as any,
    saves: async () => {
      throw Error("OFFLINE");
    },
    onObservation: observe,
  });
  expect(observe.mock.calls.map((call) => call[1].state)).toEqual([
    "checking",
    "uncertain",
  ]);
});

it("existing Updates callers without V3 observations keep their original lightweight reader", async () => {
  const { readDefaultUniversalActivities } = await import("./universalActivityReader");
  const f = fixture();
  adapter.account.mockResolvedValue(f.jobs[0].batch.accountId);
  adapter.context.mockImplementation(f.context);
  adapter.capability.mockClear();
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://dev.example");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_LOCAL_FIRST_ENABLED", "true");
  try {
    await readDefaultUniversalActivities(f.jobs, () => true);
    expect(adapter.context).toHaveBeenCalledTimes(2);
    expect(adapter.capability).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});
