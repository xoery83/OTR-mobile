import { beforeEach, expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { UniversalCaptureResults } from "./UniversalCaptureResults";

const h = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  read: vi.fn(),
  start: vi.fn(),
  state: {} as Record<string, unknown>,
}));
// Reuse the existing Capture lifecycle hook harness; no renderer or transport replacement.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef(initial: unknown) {
    return h.refs[h.cursor++] ?? (h.refs[h.cursor - 1] = { current: initial });
  },
  useEffect(effect: () => void | (() => void)) {
    h.effects.push(effect);
  },
}));
vi.mock("react-native", () => ({
  AppState: {},
  View: "div",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("./useUniversalCapture", () => ({ useUniversalCapture: () => h.state }));
vi.mock("./ImportActivityList", () => ({ ImportActivityList: () => null }));
vi.mock("./UniversalP1SourceReviewForm", () => ({
  UniversalP1SourceReviewForm: () => null,
}));
vi.mock("./useUniversalP1Admission", () => ({ useUniversalP1Admission: () => ({}) }));
vi.mock("@/data/repositories/importSubmissionRepository", () => ({
  readImportSubmission: h.read,
}));
vi.mock("@/data/operations/universalV3Review", () => ({
  openUniversalV3Review: vi.fn(),
  applyUniversalV3Batch: vi.fn(),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("@/ui/controls", () => ({
  UiText: "span",
  UiSection: "section",
  UiButton: "button",
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "i" }));
const model = {
  allInputsAccepted: true,
  batch: { batchId: "original", context: { tripPrior: { id: "trip" } } },
} as CaptureJobReadModel;
const current = () => true;
function draw() {
  h.cursor = 0;
  h.effects = [];
  UniversalCaptureResults({ model, isCurrent: current });
  return h.effects.map((effect) => effect());
}
beforeEach(() => {
  vi.clearAllMocks();
  h.refs = [];
  h.read.mockResolvedValue({ batchId: "original", confirmed: false });
  h.state = {
    localFirstSelected: true,
    localFirst: { state: "NEEDS_ACTION" },
    busy: false,
    canStart: true,
    unavailable: false,
    start: h.start,
  };
});
it.each(["NEEDS_ACTION", "WAITING_INPUT"])(
  "continues retained Submit from %s once, without confirming Save",
  async (state) => {
    h.state.localFirst = { state };
    draw();
    await Promise.resolve();
    draw();
    await Promise.resolve();
    expect(h.read).toHaveBeenCalledOnce();
    expect(h.start).toHaveBeenCalledOnce();
  },
);
it.each(["PROCESSING", "OUTCOME_UNKNOWN", "REVIEW_READY"])(
  "never restarts %s",
  async (state) => {
    h.state.localFirst = { state };
    draw();
    await Promise.resolve();
    expect(h.read).not.toHaveBeenCalled();
    expect(h.start).not.toHaveBeenCalled();
  },
);
it("does not turn historical Activity without a retained Submit into Analyze", async () => {
  h.read.mockResolvedValue(null);
  draw();
  await Promise.resolve();
  expect(h.start).not.toHaveBeenCalled();
});
it("discards a retained-intent read when its Form scope closes", async () => {
  let resolve!: (value: unknown) => void;
  h.read.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const cleanup = draw();
  cleanup.forEach((stop) => stop?.());
  resolve({ batchId: "original", confirmed: false });
  await Promise.resolve();
  expect(h.start).not.toHaveBeenCalled();
});
