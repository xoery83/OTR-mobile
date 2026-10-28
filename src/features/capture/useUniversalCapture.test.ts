import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { useUniversalCapture } from "./useUniversalCapture";
const h = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  layout: [] as (() => void)[],
  effects: [] as (() => void)[],
  generation: 1,
  recover: vi.fn(),
  start: vi.fn(),
  transport: vi.fn(),
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
vi.mock("@/data/operations/universalCaptureConsumer", () => ({
  createUniversalCaptureConsumer: () => ({
    get activity() {
      return h.consumer.activity;
    },
    queued: true,
    canDispatch: true,
    recover: h.recover,
    start: h.start,
  }),
}));
function Harness(batchId = "batch-a", current = () => true) {
  h.cursor = 0;
  h.layout = [];
  h.effects = [];
  const output = useUniversalCapture(
    {
      allInputsAccepted: true,
      batch: { accountId: "qa", batchId, context: { tripPrior: { id: "trip" } } },
    } as CaptureJobReadModel,
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
  h.consumer.activity = { state: "PROCESSING" };
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
