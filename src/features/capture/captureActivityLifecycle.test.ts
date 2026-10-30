import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CaptureActivity } from "./CaptureActivity";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

// Native diagnostic controls are outside this UI lifecycle suite.
vi.mock("./CaptureCustodyDevAction", () => ({ CaptureCustodyDevAction: () => null }));
const ui = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effect: null as null | (() => (() => void) | void),
  cleanup: null as null | (() => void),
  list: vi.fn(),
  activities: vi.fn(),
  generation: 0,
  open: vi.fn(),
  hide: vi.fn(),
  back: vi.fn(),
}));
vi.mock("react", () => ({
  useRef(initial: unknown) {
    const i = ui.cursor++;
    if (!(i in ui.slots)) ui.slots[i] = { current: initial };
    return ui.slots[i];
  },
  useState(initial: unknown) {
    const i = ui.cursor++;
    if (!(i in ui.slots)) ui.slots[i] = initial;
    return [
      ui.slots[i],
      (value: unknown) => {
        ui.slots[i] = value;
      },
    ];
  },
  useEffect(effect: () => (() => void) | void, deps?: unknown[]) {
    if (!deps) effect();
    else ui.effect = effect;
  },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => ui.generation,
}));
vi.mock("@/data/operations/universalActivityReader", () => ({
  readDefaultUniversalActivities: ui.activities,
}));
vi.mock("@/data/operations/defaultCaptureSubmission", () => ({
  listDefaultCaptureJobs: ui.list,
}));
vi.mock("react-native", () => ({
  Text: "span",
  ScrollView: "main",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({ UiButton: "button", UiSection: "section" }));
function render(current = () => true) {
  ui.cursor = 0;
  return CaptureActivity({
    isCurrent: current,
    onOpenJob: ui.open,
    onHide: ui.hide,
    onReturn: ui.back,
  }).props as {
    jobs: CaptureJobReadModel[];
    taskActivities: Record<
      string,
      import("@/data/api/universalImportContracts").UniversalTaskActivity
    >;
    loading: boolean;
    error: boolean;
    hasMore: boolean;
    onMore(): void;
    onRefresh(): void;
    onOpenJob(id: string): void;
    onHide(): void;
  };
}
const page = (n: number, prefix = "job") =>
  Array.from({ length: n }, (_, i) => ({
    batch: {
      jobId: `${prefix}-${i}`,
      batchId: `batch-${i}`,
      createdAt: "2026-10-08T00:00:00.000Z",
    },
  })) as CaptureJobReadModel[];
beforeEach(() => {
  ui.cleanup?.();
  ui.slots = [];
  ui.cursor = 0;
  ui.effect = null;
  ui.cleanup = null;
  vi.resetAllMocks();
  ui.generation = 0;
  ui.activities.mockResolvedValue({});
});
it("loads 0/1/N real Jobs; cursor pagination, rapid taps and manual refresh reuse the read seam", async () => {
  for (const n of [0, 1, 20]) {
    ui.cleanup?.();
    ui.slots = [];
    const first = page(n);
    ui.list.mockResolvedValueOnce(first);
    render();
    ui.cleanup = ui.effect!() ?? null;
    await vi.waitFor(() => expect(render().loading).toBe(false));
    expect(render().jobs).toEqual(first);
    expect(render().hasMore).toBe(n === 20);
    if (n === 20) {
      const next = page(1, "older");
      ui.list.mockResolvedValueOnce(next);
      const beforeCalls = ui.list.mock.calls.length;
      render().onMore();
      render().onMore();
      await vi.waitFor(() => expect(render().jobs).toHaveLength(21));
      expect(ui.list.mock.calls.length).toBe(beforeCalls + 1);
      expect(ui.list).toHaveBeenLastCalledWith({
        limit: 20,
        before: {
          createdAt: first[19].batch.createdAt,
          batchId: first[19].batch.batchId,
        },
      });
      expect(render().hasMore).toBe(false);
      render().onOpenJob(next[0].batch.jobId);
      expect(ui.open).toHaveBeenLastCalledWith(next[0].batch.jobId);
      ui.list.mockResolvedValueOnce(page(1, "fresh"));
      render().onRefresh();
      await vi.waitFor(() => expect(render().jobs[0].batch.jobId).toBe("fresh-0"));
      expect(render().jobs).toHaveLength(1);
    }
  }
});
it("read failure is an error, not empty/success; explicit refresh retries and Hide is independent", async () => {
  ui.list.mockRejectedValueOnce(new Error("local DB unavailable"));
  render();
  ui.cleanup = ui.effect!() ?? null;
  await vi.waitFor(() => expect(render().error).toBe(true));
  expect(render().loading).toBe(false);
  ui.list.mockResolvedValueOnce(page(1));
  render().onRefresh();
  await vi.waitFor(() => expect(render().jobs).toHaveLength(1));
  expect(render().error).toBe(false);
  render().onHide();
  expect(ui.hide).toHaveBeenCalledOnce();
});
it("late list/error is fenced after blur, Account A→B→A/Trip invalidation, and StrictMode replay", async () => {
  for (const boundary of ["blur", "account", "trip", "replay", "late-error"] as const) {
    ui.cleanup?.();
    ui.slots = [];
    let valid = true;
    const current = () => valid;
    let resolve!: (v: CaptureJobReadModel[]) => void;
    let reject!: (e: Error) => void;
    ui.list.mockImplementationOnce(
      () =>
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        }),
    );
    render(current);
    ui.cleanup = ui.effect!() ?? null;
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    if (boundary === "replay" || boundary === "late-error") {
      ui.cleanup!();
      ui.list.mockResolvedValueOnce(page(1, "current"));
      ui.cleanup = ui.effect!() ?? null;
      await vi.waitFor(() =>
        expect(render(current).jobs[0]?.batch.jobId).toBe("current-0"),
      );
    } else if (boundary === "blur") ui.cleanup!();
    else valid = false; // The original invocation stays invalid even when a new host admits A again.
    if (boundary === "late-error") reject(new Error("stale failure"));
    else resolve(page(1, "private-A"));
    await new Promise((done) => setTimeout(done, 0));
    expect(render(current).jobs.some((j) => j.batch.jobId === "private-A-0")).toBe(false);
    expect(render(current).error).toBe(false);
    const calls = ui.open.mock.calls.length;
    render(current).onOpenJob("private-A-0");
    expect(ui.open.mock.calls.length).toBe(
      calls + (boundary === "replay" || boundary === "late-error" ? 1 : 0),
    );
  }
});

vi.mock("./CaptureComposer", () => ({ CaptureComposer: () => null }));

it.each(["onMore", "onRefresh"] as const)(
  "stale %s captured before Refresh cannot restore an obsolete inventory",
  async (action) => {
    ui.list.mockResolvedValueOnce(page(20, "old"));
    render();
    ui.cleanup = ui.effect!() ?? null;
    await vi.waitFor(() => expect(render().loading).toBe(false));
    const staleAction = render()[action];
    ui.list.mockResolvedValueOnce(page(1, "current"));
    render().onRefresh();
    await vi.waitFor(() => expect(render().jobs[0]?.batch.jobId).toBe("current-0"));
    const calls = ui.list.mock.calls.length;
    ui.list.mockResolvedValueOnce(page(1, "obsolete-older"));
    staleAction();
    await new Promise((done) => setTimeout(done, 0));
    expect(ui.list.mock.calls.length).toBe(calls);
    expect(render().jobs).toEqual(page(1, "current"));
    expect(render().loading).toBe(false);
  },
);

afterEach(() => {
  ui.cleanup?.();
  vi.useRealTimers();
});
const activity = (
  state: import("@/data/api/universalImportContracts").UniversalTaskActivity["state"],
) => ({
  state,
  recordedAt: "2026-10-31T00:00:00.000Z",
  updatedAt: "2026-10-31T00:00:01.000Z",
  completedAt: state === "RESULTS_READY" ? "2026-10-31T00:00:01.000Z" : null,
  rowRevision: state === "RESULTS_READY" ? 2 : 1,
  attemptCount: 1,
  waitReason: null,
});
it.each(["PENDING", "WAITING", "PROCESSING"] as const)(
  "reads real %s→RESULTS_READY while mounted, then stops without manual refresh",
  async (state) => {
    vi.useFakeTimers();
    ui.list.mockResolvedValueOnce(page(1));
    ui.activities
      .mockResolvedValueOnce({ "batch-0": activity(state) })
      .mockResolvedValueOnce({ "batch-0": activity("RESULTS_READY") });
    render();
    ui.cleanup = ui.effect!() ?? null;
    await vi.waitFor(() => expect(render().loading).toBe(false));
    expect(render().taskActivities["batch-0"].state).toBe(state);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() =>
      expect(render().taskActivities["batch-0"].state).toBe("RESULTS_READY"),
    );
    expect(ui.activities).toHaveBeenCalledTimes(2);
    expect(ui.list).toHaveBeenCalledTimes(1);
    expect(render().loading).toBe(false);
    await vi.advanceTimersByTimeAsync(20000);
    expect(ui.activities).toHaveBeenCalledTimes(2);
  },
);
it("polling stays single-flight and a coalesced Refresh preserves known same-Batch observations", async () => {
  vi.useFakeTimers();
  ui.list.mockResolvedValue(page(1));
  let finish!: (v: unknown) => void;
  ui.activities
    .mockResolvedValueOnce({ "batch-0": activity("PROCESSING") })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({});
  render();
  ui.cleanup = ui.effect!() ?? null;
  await vi.waitFor(() => expect(render().loading).toBe(false));
  await vi.advanceTimersByTimeAsync(5000);
  expect(ui.activities).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(15000);
  expect(ui.activities).toHaveBeenCalledTimes(2);
  expect(render().taskActivities["batch-0"].state).toBe("PROCESSING");
  render().onRefresh();
  render().onRefresh();
  expect(ui.list).toHaveBeenCalledTimes(1);
  finish({ "batch-0": activity("RESULTS_READY") });
  await vi.waitFor(() => expect(ui.activities).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(render().loading).toBe(false));
  expect(ui.list).toHaveBeenCalledTimes(2);
  expect(render().taskActivities["batch-0"].state).toBe("RESULTS_READY");
  await vi.advanceTimersByTimeAsync(10000);
  expect(ui.activities).toHaveBeenCalledTimes(3);
});
it.each(["blur", "account-generation", "scope-invalid"] as const)(
  "discards a late poll and stops after %s",
  async (boundary) => {
    vi.useFakeTimers();
    ui.list.mockResolvedValueOnce(page(1));
    let valid = true;
    let finish!: (v: unknown) => void;
    ui.activities
      .mockResolvedValueOnce({ "batch-0": activity("PROCESSING") })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const current = () => valid;
    render(current);
    ui.cleanup = ui.effect!() ?? null;
    await vi.waitFor(() => expect(render(current).loading).toBe(false));
    await vi.advanceTimersByTimeAsync(5000);
    if (boundary === "blur") ui.cleanup!();
    else if (boundary === "account-generation")
      ui.generation += 2; // A→B→A still invalidates this lifetime.
    else valid = false;
    finish({ "batch-0": activity("RESULTS_READY") });
    await vi.advanceTimersByTimeAsync(0);
    expect(render(current).taskActivities["batch-0"].state).toBe("PROCESSING");
    await vi.advanceTimersByTimeAsync(15000);
    expect(ui.activities).toHaveBeenCalledTimes(2);
  },
);
it("only pending Batch contexts are polled; terminal and unavailable rows do not start reads", async () => {
  vi.useFakeTimers();
  ui.list.mockResolvedValueOnce(page(3));
  ui.activities
    .mockResolvedValueOnce({
      "batch-0": activity("FAILED"),
      "batch-1": activity("PROCESSING"),
    })
    .mockResolvedValueOnce({ "batch-1": activity("RESULTS_READY") });
  render();
  ui.cleanup = ui.effect!() ?? null;
  await vi.waitFor(() => expect(render().loading).toBe(false));
  await vi.advanceTimersByTimeAsync(5000);
  expect(
    ui.activities.mock.calls[1][0].map((job: CaptureJobReadModel) => job.batch.batchId),
  ).toEqual(["batch-1"]);
  expect(ui.activities.mock.calls[1]).toHaveLength(3); // No completion/Result callback, prepare or dispatch seam.
});
