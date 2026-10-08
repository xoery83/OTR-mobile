import { beforeEach, expect, it, vi } from "vitest";
import { CaptureActivity } from "./CaptureActivity";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

const ui = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effect: null as null | (() => (() => void) | void),
  cleanup: null as null | (() => void),
  list: vi.fn(),
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
  useEffect(effect: () => (() => void) | void) {
    ui.effect = effect;
  },
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
