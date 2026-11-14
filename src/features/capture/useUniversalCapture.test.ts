import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { useUniversalCapture } from "./useUniversalCapture";
import { readLocalSession } from "@/data/auth/authRepository";
const h = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  layout: [] as (() => void)[],
  effects: [] as (() => void)[],
  generation: 1,
  recover: vi.fn(),
  start: vi.fn(),
  transport: vi.fn(),
  stageV3: vi.fn(),
  consent: vi.fn(),
  sourcePrepare: vi.fn(),
  pngPrepare: vi.fn(),
  pngTransport: vi.fn(),
  hash: vi.fn(),
  options: null as any,
  consumer: { activity: null as unknown, queued: true, canDispatch: true },
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = initial;
    return [
      h.slots[i],
      (value: unknown) => {
        h.slots[i] = value;
      },
    ];
  },
  useRef(initial: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = { current: initial };
    return h.slots[i];
  },
  useLayoutEffect(effect: () => void) {
    h.cursor++;
    h.layout.push(effect);
  },
  useEffect(effect: () => (() => void) | void, deps: unknown[]) {
    const i = h.cursor++;
    const old = h.slots[i] as { deps: unknown[]; cleanup?: () => void } | undefined;
    if (!old || deps.some((dep, j) => !Object.is(dep, old.deps[j]))) {
      h.effects.push(() => {
        old?.cleanup?.();
        h.slots[i] = { deps, cleanup: effect() };
      });
    }
  },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => h.generation,
}));
vi.mock("@/data/auth/authRepository", () => ({ readLocalSession: vi.fn() }));
vi.mock("@/data/api/universalImportTransport", () => ({
  createUniversalImportTransport: h.transport,
}));
vi.mock("@/data/operations/universalV3Capture", () => ({
  stageLocalFirstCapture: h.stageV3,
}));
vi.mock("@/data/operations/universalCaptureConsumer", async (original) => ({
  ...(await original<typeof import("@/data/operations/universalCaptureConsumer")>()),
  createUniversalCaptureConsumer: (options: any) => {
    h.options = options;
    return {
      get activity() {
        return h.consumer.activity;
      },
      get queued() {
        return h.consumer.queued;
      },
      canDispatch: true,
      recover: h.recover,
      start: h.start,
    };
  },
}));
vi.mock("@/data/operations/defaultUniversalPhotoConsent", () => ({
  assertDefaultUniversalPhotoConsent: h.consent,
}));
vi.mock("@/data/operations/defaultUniversalOriginalSource", () => ({
  prepareDefaultUniversalCaptureSources: h.sourcePrepare,
}));
vi.mock("@/data/operations/universalPngOriginalPreparation", () => ({
  prepareAdmittedPngOriginal: h.pngPrepare,
}));
vi.mock("@/data/api/sourcePngPreparationTransport", () => ({
  createSourcePngPreparationTransport: h.pngTransport,
}));
vi.mock("@/data/repositories/defaultLocalCaptureInboxRepository", () => ({
  captureStorageDependencies: { sha256: h.hash },
}));
function Harness(batchId = "batch-a", current = () => true, assignedTripId?: string) {
  h.cursor = 0;
  h.layout = [];
  h.effects = [];
  const output = useUniversalCapture(
    {
      allInputsAccepted: true,
      assignedTripId,
      inputs: [],
      batch: {
        accountId: "qa",
        batchId,
        context: { tripPrior: assignedTripId ? null : { id: "trip" } },
      },
    } as unknown as CaptureJobReadModel,
    current,
  );
  h.layout.forEach((effect) => effect());
  h.effects.forEach((effect) => effect());
  return output;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.slots = [];
  h.generation = 1;
  h.consent.mockReset();
  h.consumer.activity = { state: "PROCESSING" };
  h.consumer.queued = true;
  h.recover.mockResolvedValue(null);
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://dev.invalid");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("reopens with GET recovery and polls real pending state, never Start", async () => {
  Harness();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.recover).toHaveBeenCalledOnce();
  Harness();
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.recover).toHaveBeenCalledTimes(2);
  expect(h.start).not.toHaveBeenCalled();
  h.consumer.activity = { state: "FAILED" };
  Harness();
  await vi.advanceTimersByTimeAsync(5000);
  Harness();
  await vi.advanceTimersByTimeAsync(10000);
  expect(h.recover).toHaveBeenCalledTimes(3);
  expect(h.start).not.toHaveBeenCalled();
});
it("polls passively while the queued receipt has no activity, and stops on result", async () => {
  h.consumer.activity = null;
  Harness();
  await vi.advanceTimersByTimeAsync(0);
  expect(Harness().queued).toBe(true);
  const result = { status: "CANDIDATES_READY" };
  h.recover.mockImplementationOnce(async () => {
    h.consumer.queued = false;
    return result;
  });
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.recover).toHaveBeenCalledTimes(2);
  expect(Harness().result).toBe(result);
  await vi.advanceTimersByTimeAsync(10000);
  expect(h.recover).toHaveBeenCalledTimes(2);
  expect(h.start).not.toHaveBeenCalled();
});

it("passes back the owning Task prepare receipt, including unconfirmed transport outcome", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED", "true");
  const receipt = { status: "QUEUED", context: { taskId: "owning-task" } };
  const prepare = vi
    .fn()
    .mockResolvedValueOnce(receipt)
    .mockRejectedValueOnce(Error("lost response"));
  h.transport.mockReturnValueOnce({ prepare });
  h.sourcePrepare
    .mockImplementationOnce((_context, _model, options) => options.prepareTask({}))
    .mockImplementationOnce((_context, _model, options) => options.prepareTask({}));
  Harness();
  await vi.advanceTimersByTimeAsync(0);
  const context = { accountId: "qa", tripId: "trip" };
  expect(await h.options.prepareSources(context, {})).toBe(receipt);
  expect(await h.options.prepareSources(context, {})).toBeNull();
  expect(prepare).toHaveBeenCalledTimes(2);
});

it("stops retained polling on changed Batch or Account generation", async () => {
  Harness();
  await vi.advanceTimersByTimeAsync(0);
  Harness();
  Harness("batch-b");
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.recover).toHaveBeenCalledOnce();
  h.generation++;
  await Harness("batch-b").start();
  expect(h.start).not.toHaveBeenCalled();
});
it("does not overlap an outstanding recovery or let a hidden view poll", async () => {
  let finish!: (value: null) => void;
  h.recover.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  Harness();
  await vi.advanceTimersByTimeAsync(0);
  await Harness().recover();
  expect(h.recover).toHaveBeenCalledOnce();
  finish(null);
  await vi.advanceTimersByTimeAsync(0);
  Harness("batch-a", () => false);
  await vi.advanceTimersByTimeAsync(10000);
  expect(h.recover).toHaveBeenCalledOnce();
});

it("resumes GET polling after hide, request completion and showing the same mounted Batch", async () => {
  let visible = true;
  Harness("batch-a", () => visible);
  await vi.advanceTimersByTimeAsync(0);
  Harness("batch-a", () => visible);
  visible = false;
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.recover).toHaveBeenCalledOnce();
  visible = true;
  Harness("batch-a", () => visible);
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.recover).toHaveBeenCalledTimes(2);
  expect(h.start).not.toHaveBeenCalled();
});

it("keeps owning GET recovery alive when Results arrive before terminal Task activity", async () => {
  const result = { status: "CANDIDATES_READY" };
  h.recover.mockResolvedValueOnce(result).mockImplementationOnce(async () => {
    h.consumer.activity = { state: "RESULTS_READY" };
    return result;
  });
  Harness();
  await vi.advanceTimersByTimeAsync(0);
  expect(Harness().result).toBe(result);
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.recover).toHaveBeenCalledTimes(2);
  expect(Harness().activity).toEqual({ state: "RESULTS_READY" });
  await vi.advanceTimersByTimeAsync(15000);
  expect(h.recover).toHaveBeenCalledTimes(2);
  expect(h.start).not.toHaveBeenCalled();
});

it.each([
  ["UNIVERSAL_SOURCE_PREPARATION_BLOCKED", "UNIVERSAL_SOURCE_PREPARATION_BLOCKED", false],
  ["SOURCE_PRIVATE_ORIGINAL_NAME", "UNCLASSIFIED", false],
  ["UNIVERSAL_SOURCE_PREPARATION_BLOCKED", "UNIVERSAL_SOURCE_PREPARATION_BLOCKED", true],
])(
  "retains a safe failure class for explicit Start without logging material",
  async (message, code, loggerThrows) => {
    h.consumer.activity = null;
    const log = vi.spyOn(console, "info").mockImplementation(() => {
      if (loggerThrows) throw Error("SYNTHETIC_LOGGER_FAILURE");
    });
    try {
      Harness();
      await vi.advanceTimersByTimeAsync(0);
      h.start.mockRejectedValueOnce(Error(message));
      await Harness().start();
      expect(Harness().unavailable).toBe(true);
      expect(log).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify({ event: "universal_capture_failed", code }),
      );
      expect(h.start).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  },
);

it("coalesces one explicit Start behind a pending GET, without overlapping or automatic starts", async () => {
  h.consumer.activity = null;
  let finish!: (v: null) => void;
  h.recover.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  Harness();
  await vi.advanceTimersByTimeAsync(0);
  expect(Harness().canStartDuringRead).toBe(true);
  await Harness().start();
  await Harness().start();
  expect(Harness().canStartDuringRead).toBe(false);
  expect(h.start).not.toHaveBeenCalled();
  finish(null);
  await vi.advanceTimersByTimeAsync(0);
  expect(h.start).toHaveBeenCalledOnce();
});

it.each(["hidden", "account", "batch"] as const)(
  "drops deferred Start across %s boundary",
  async (boundary) => {
    h.consumer.activity = null;
    let visible = true;
    let finish!: (v: null) => void;
    h.recover.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    Harness("batch-a", () => visible);
    await vi.advanceTimersByTimeAsync(0);
    await Harness("batch-a", () => visible).start();
    if (boundary === "hidden") visible = false;
    if (boundary === "account") h.generation++;
    Harness(boundary === "batch" ? "batch-b" : "batch-a", () => visible);
    finish(null);
    await vi.advanceTimersByTimeAsync(0);
    visible = true;
    Harness("batch-a", () => visible);
    expect(h.start).not.toHaveBeenCalled();
  },
);

it.each(["hidden", "batch"] as const)(
  "does not resurrect explicit Start after %s returns before GET settles",
  async (boundary) => {
    h.consumer.activity = null;
    let visible = true;
    let finish!: (v: null) => void;
    h.recover.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    Harness("batch-a", () => visible);
    await vi.advanceTimersByTimeAsync(0);
    await Harness("batch-a", () => visible).start();
    if (boundary === "hidden") visible = false;
    Harness(boundary === "batch" ? "batch-b" : "batch-a", () => visible);
    visible = true;
    Harness("batch-a", () => visible);
    finish(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.start).not.toHaveBeenCalled();
  },
);

it("checks current Photo consent before resuming the same Task and rejects a late hidden view", async () => {
  const resume = vi.fn();
  h.transport.mockReturnValue({ resume });
  let visible = true;
  Harness("batch-a", () => visible);
  await vi.advanceTimersByTimeAsync(0);
  const context = { accountId: "qa", tripId: "trip", generation: 1 },
    binding = { taskId: "same-task" };
  h.consent.mockRejectedValueOnce(Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED"));
  await expect(h.options.resumeTask(context, binding)).rejects.toThrow(
    "PHOTO_REVIEW_REQUIRED",
  );
  expect(resume).not.toHaveBeenCalled();
  await h.options.resumeTask(context, binding);
  expect(resume).toHaveBeenCalledExactlyOnceWith(context, binding);
  resume.mockClear();
  h.consent.mockImplementationOnce(async () => {
    visible = false;
  });
  await expect(h.options.resumeTask(context, binding)).rejects.toThrow(
    "UNIVERSAL_CAPTURE_STALE",
  );
  expect(resume).not.toHaveBeenCalled();
});

it("discards in-flight recovery when the same Batch retained Journey changes", async () => {
  h.consumer.activity = null;
  let finish!: (v: null) => void;
  h.recover.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  Harness("batch-a", () => true, "trip-a");
  await vi.advanceTimersByTimeAsync(0);
  await Harness("batch-a", () => true, "trip-a").start();
  Harness("batch-a", () => true, "trip-b");
  expect(h.options.isCurrent()).toBe(false);
  finish(null);
  await vi.advanceTimersByTimeAsync(0);
  expect(h.start).not.toHaveBeenCalled();
  expect(Harness("batch-a", () => true, "trip-b").result).toBeNull();
});

it("retained read-only attribution never offers or queues Analyze", async () => {
  let finish!: (value: null) => void;
  h.recover.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const reading = Harness("batch-a", () => true, "retained-trip");
  await vi.advanceTimersByTimeAsync(0);
  const active = Harness("batch-a", () => true, "retained-trip");
  expect(reading.canStart).toBe(false);
  expect(active.canStartDuringRead).toBe(false);
  await active.start();
  expect(h.start).not.toHaveBeenCalled();
  finish(null);
  await vi.advanceTimersByTimeAsync(0);
  expect(h.start).not.toHaveBeenCalled();
});

it("shows an actionable photo confirmation state without treating it as an unknown AI failure or retrying", async () => {
  Harness();
  await vi.advanceTimersByTimeAsync(0);
  h.start.mockRejectedValueOnce(Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED"));
  await Harness().start();
  expect(Harness().photoReviewRequired).toBe(true);
  expect(Harness().unavailable).toBe(false);
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.start).toHaveBeenCalledOnce();
  expect(Harness().photoReviewRequired).toBe(true);
  h.start.mockResolvedValueOnce(null);
  await Harness().start();
  expect(Harness().photoReviewRequired).toBe(false);
});

it("clears an earlier photo prompt when a real result is recovered", async () => {
  Harness();
  await vi.advanceTimersByTimeAsync(0);
  h.start.mockRejectedValueOnce(Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED"));
  await Harness().start();
  expect(Harness().photoReviewRequired).toBe(true);
  h.recover.mockResolvedValueOnce({ status: "INTERPRETED" });
  await Harness().recover();
  expect(Harness().photoReviewRequired).toBe(false);
  expect(h.start).toHaveBeenCalledOnce();
});

it.each([false, true])(
  "restores the existing PNG continuation only under its existing build option (%s)",
  async (enabled) => {
    vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_PNG_ENABLED", enabled ? "true" : "false");
    let visible = true;
    Harness("batch-a", () => visible);
    await vi.advanceTimersByTimeAsync(0);
    const context = { accountId: "qa", tripId: "trip" },
      job = { batch: "same-job" };
    await h.options.prepareSources(context, job);
    expect(h.sourcePrepare).toHaveBeenCalledOnce();
    const options = h.sourcePrepare.mock.calls[0][2];
    if (!enabled) {
      expect(options).not.toHaveProperty("pendingPngProfile");
      expect(options).not.toHaveProperty("preparePngOriginal");
      return;
    }
    const port = { existing: "Source port" },
      input = { existing: "original binding" };
    h.pngTransport.mockReturnValue(port);
    await options.preparePngOriginal(context, input);
    expect(h.pngPrepare).toHaveBeenCalledExactlyOnceWith(
      context,
      input,
      expect.objectContaining({ port, hash: h.hash }),
    );
    visible = false;
    await expect(options.preparePngOriginal(context, input)).rejects.toThrow(
      "UNIVERSAL_CAPTURE_STALE",
    );
    expect(h.pngPrepare).toHaveBeenCalledOnce();
  },
);

it("honors an explicit V3 Analyze once when tapped during the passive status read", async () => {
  for (const flag of ["LOCAL_FIRST", "CONTINUOUS", "PDF", "PNG"])
    vi.stubEnv(`EXPO_PUBLIC_OTR_UNIVERSAL_${flag}_ENABLED`, "true");
  vi.mocked(readLocalSession)
    .mockResolvedValueOnce({ identity: { userId: "qa" } } as never)
    .mockResolvedValueOnce({ identity: { userId: "qa" } } as never);
  let finishRead!: () => void;
  const post = vi.fn();
  const read = vi.fn();
  h.transport.mockImplementationOnce((_account, options: { signal: AbortSignal }) => {
    read.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finishRead = () => resolve(null);
          options.signal.addEventListener(
            "abort",
            () => reject(Error("REQUEST_CANCELED")),
            { once: true },
          );
        }),
    );
    read.mockResolvedValueOnce({ state: "PROCESSING", taskId: "task" });
    return {
      localFirstCapability: async () => ({ localFirst: true, existing: null }),
      readLocalFirstExecution: read,
      startLocalFirst: () => {
        options.signal.throwIfAborted();
        post();
      },
    };
  });
  h.stageV3.mockImplementationOnce(async (_context, _model, deps) => {
    await deps.transport.startLocalFirst();
  });
  Harness();
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(1);
  expect(Harness().canStartDuringRead).toBe(true);
  await Harness().start();
  await Harness().start();
  finishRead();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.stageV3).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
  expect(Harness().unavailable).toBe(false);
  expect(Harness().localFirst?.state).toBe("PROCESSING");
});
