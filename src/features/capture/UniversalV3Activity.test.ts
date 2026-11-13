import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { UniversalV3Activity } from "./UniversalCaptureResults";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { UniversalV3ExecutionStatus } from "@/data/api/universalV3Contracts";
import { emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { setUiLocale, t } from "@/ui/locale";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const h = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as (() => void)[],
  check: vi.fn(),
  open: vi.fn(),
  confirm: vi.fn(),
  current: true,
  children: [] as any[],
  buttons: new Map<string, any>(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  lazy: () => (p: any) => {
    h.children.push(p);
    return null;
  },
  useState: (initial: unknown) => {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = initial;
    return [
      h.slots[i],
      (v: any) => {
        h.slots[i] = typeof v === "function" ? v(h.slots[i]) : v;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = { current: initial };
    return h.slots[i];
  },
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
    const i = h.cursor++,
      old = h.slots[i];
    if (!old || deps.some((v, j) => !Object.is(v, old.deps[j])))
      h.effects.push(() => {
        old?.cleanup?.();
        h.slots[i] = { deps, cleanup: effect() };
      });
  },
}));
vi.mock("@/data/operations/universalV3Activity", async (original) => ({
  ...(await original<typeof import("@/data/operations/universalV3Activity")>()),
  readV3UnknownCandidates: async () => new Set(),
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("./useUniversalCapture", () => ({ useUniversalCapture: vi.fn() }));
vi.mock("./useUniversalP1Admission", () => ({ useUniversalP1Admission: vi.fn() }));
vi.mock("@/data/repositories/importSubmissionRepository", () => ({
  readImportSubmission: async () => null,
  updateImportSubmission: vi.fn(),
}));
vi.mock("@/data/operations/universalV3Review", async (original) => ({
  ...(await original<typeof import("@/data/operations/universalV3Review")>()),
  openUniversalV3Review: h.open,
}));
vi.mock("react-native", () => ({
  View: "div",
  StyleSheet: { create: (v: unknown) => v },
  AppState: { currentState: "active", addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", {}, p.children),
  UiSection: (p: any) => createElement("section", {}, p.title, p.children),
  UiButton: (p: any) => {
    h.buttons.set(p.label, p);
    return createElement("button", {}, p.label);
  },
}));
const model = {
  batch: {
    batchId: "batch-a",
    jobId: "original-job",
    context: { tripPrior: { id: "original-trip" } },
  },
} as CaptureJobReadModel;
const execution = {
  state: "REVIEW_READY",
  taskId: "original-task",
  candidates: [{ candidateId: "a" }],
} as Extract<UniversalV3ExecutionStatus, { state: "REVIEW_READY" }>;
function render(extra: Partial<Parameters<typeof UniversalV3Activity>[0]> = {}) {
  h.cursor = 0;
  h.effects = [];
  h.children = [];
  const html = renderToStaticMarkup(
    createElement(UniversalV3Activity, {
      model,
      execution,
      unavailable: false,
      formatUnavailable: false,
      isCurrent: () => h.current,
      ...extra,
    }),
  );
  h.effects.forEach((run) => run());
  return html;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.slots = [];
  h.current = true;
  h.check.mockResolvedValue("VERIFIED");
  h.open.mockResolvedValue({
    resultOperations: async () => ({
      snapshot: { actor: { active: true }, graph: emptyCoreGraph() },
      operations: [],
    }),
    check: h.check,
    confirm: h.confirm,
    batch: (candidates: unknown[]) =>
      candidates.map((candidate) => ({ candidate, disposition: "NEW" })),
  });
  setUiLocale("en");
});
afterEach(() => {
  h.slots.forEach((s) => s?.cleanup?.());
  vi.useRealTimers();
});
it("reopen reads original receipts automatically and never invokes Confirm or dispatch", async () => {
  render();
  await vi.advanceTimersByTimeAsync(0);
  expect(render()).toContain(t("capture.activityStatus.complete"));
  expect(h.open).toHaveBeenCalledExactlyOnceWith(model, "MANUAL");
  expect(h.check).toHaveBeenCalledExactlyOnceWith(execution.candidates[0]);
  await vi.advanceTimersByTimeAsync(15000);
  expect(h.check).toHaveBeenCalledOnce();
  expect(h.confirm).not.toHaveBeenCalled();
});
it("association-pending stays incomplete and only polls receipts; dismissal stops reads", async () => {
  h.check.mockResolvedValue("ITEM_VERIFIED_RELATION_PENDING");
  render();
  await vi.advanceTimersByTimeAsync(0);
  expect(render()).toContain(t("capture.activityStatus.association"));
  expect(render()).not.toContain(t("capture.activityStatus.complete"));
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.check).toHaveBeenCalledTimes(2);
  h.slots.forEach((s) => s?.cleanup?.());
  await vi.advanceTimersByTimeAsync(20000);
  expect(h.check).toHaveBeenCalledTimes(2);
  expect(h.confirm).not.toHaveBeenCalled();
});
it("offline receipt reads show uncertainty, never a failure or automatic save", async () => {
  h.open.mockRejectedValue(Error("OFFLINE"));
  render();
  await vi.advanceTimersByTimeAsync(0);
  expect(render()).toContain(t("capture.activityStatus.uncertain"));
  expect(h.confirm).not.toHaveBeenCalled();
});
it("an invalidated account/sheet discards late results", async () => {
  let resolve!: (owner: unknown) => void;
  h.open.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render();
  h.current = false;
  resolve({ check: h.check, batch: () => [] });
  await vi.advanceTimersByTimeAsync(0);
  expect(h.check).not.toHaveBeenCalled();
});

it.each(["en", "zh-Hans"] as const)(
  "renders localized checking and verified copy in %s",
  async (locale) => {
    setUiLocale(locale);
    expect(render()).toContain(t("capture.activityStatus.checking"));
    await vi.advanceTimersByTimeAsync(0);
    expect(render()).toContain(t("capture.activityStatus.complete"));
    expect(render()).toContain(t("capture.results.noNew"));
  },
);

it("return navigation uses the Batch Trip/job identity and ignores invalidated clicks", async () => {
  const go = vi.fn();
  render({ onReturnToTrip: go });
  h.buttons.get(t("capture.results.day")).onPress();
  expect(go).toHaveBeenCalledWith("day", "original-trip", "original-job");
  go.mockClear();
  h.current = false;
  h.buttons.get(t("capture.results.home")).onPress();
  expect(go).not.toHaveBeenCalled();
});
