import { beforeEach, expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { CaptureCustodyDevAction } from "./CaptureCustodyDevAction";
const ui = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => (() => void) | void)[],
  execute: vi.fn(),
  qualified: true,
}));
vi.mock("react", () => ({
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
  useRef(initial: unknown) {
    const i = ui.cursor++;
    if (!(i in ui.slots)) ui.slots[i] = { current: initial };
    return ui.slots[i];
  },
  useEffect(effect: () => (() => void) | void) {
    ui.effects.push(effect);
  },
}));
vi.mock("react-native", () => ({ StyleSheet: { create: (v: unknown) => v } }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/controls", () => ({
  UiButton: "button",
  UiSection: "section",
  UiText: "span",
}));
vi.mock("@/data/operations/captureCustodyDevConfig", () => ({
  captureCustodyDevConfig: {},
}));
vi.mock("@/data/operations/captureCustodyDev", () => ({
  captureCustodyDevQualified: () => ui.qualified,
  createCaptureCustodyDevAction: () => ui.execute,
  captureCustodyDevFailure: () => "CAPTURE_CUSTODY_UNAVAILABLE",
}));
const job = { batch: { jobId: "synthetic-job" } } as CaptureJobReadModel;
function render(current = () => true) {
  ui.cursor = 0;
  return CaptureCustodyDevAction({ job, isCurrent: current });
}
beforeEach(() => {
  ui.slots = [];
  ui.cursor = 0;
  ui.effects = [];
  ui.qualified = true;
  vi.clearAllMocks();
});
it("explicit tap is single-flight; unmount suppresses late receipt without another operation", async () => {
  let resolve!: (v: unknown) => void;
  ui.execute.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const node = render()!;
  const cleanup = ui.effects.map((effect) => effect());
  const buttons = node.props.children as { props: { onPress(): void } }[];
  buttons[0].props.onPress();
  buttons[0].props.onPress();
  expect(ui.execute).toHaveBeenCalledTimes(1);
  expect(ui.execute).toHaveBeenCalledWith("PUT_GET");
  cleanup.forEach((fn) => fn?.());
  resolve({ batchId: "synthetic", jobId: "synthetic", inputs: [] });
  await Promise.resolve();
  await Promise.resolve();
  expect(ui.slots[1]).toBeNull();
});
it("retired host or unqualified configuration renders no DEV actions", () => {
  expect(render(() => false)).toBeNull();
  ui.qualified = false;
  expect(render()).toBeNull();
  expect(ui.execute).not.toHaveBeenCalled();
});
