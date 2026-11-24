import { afterEach, expect, it, vi } from "vitest";
import { CaptureContent } from "./CaptureContent";
import { createCaptureStaging } from "./captureStaging";
import { announceCaptureProcessingActivity } from "@/data/operations/captureProcessingActivity";
import type { ImportManualRequest } from "./hostedImportManual";

const qa = vi.hoisted(() => {
  type Effect = { values?: unknown[]; clean?: () => void };
  return {
    refs: [] as { current: unknown }[],
    states: [] as { value: unknown }[],
    effects: [] as Effect[],
    scheduled: [] as (() => void)[],
    indexes: { ref: 0, state: 0, effect: 0 },
    reopen: vi.fn(),
  };
});
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useRef(init: unknown) {
    return qa.refs[qa.indexes.ref++] ??= { current: init };
  },
  useState(init: unknown) {
    const position = qa.indexes.state++;
    const state = qa.states[position] ??= { value: typeof init === "function" ? init() : init };
    return [state.value, (next: unknown) => {
      state.value = typeof next === "function" ? next(state.value) : next;
    }];
  },
  useEffect(callback: () => (() => void) | undefined, values?: unknown[]) {
    const position = qa.indexes.effect++;
    const previous = qa.effects[position];
    if (previous && values && previous.values?.length === values.length &&
      values.every((value, index) => Object.is(value, previous.values?.[index]))) return;
    qa.scheduled.push(() => {
      previous?.clean?.();
      qa.effects[position] = { values, clean: callback() };
    });
  },
  useSyncExternalStore: (_: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
vi.mock("react-native", () => ({ ScrollView: "ScrollView", Text: "Text", View: "View", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@/ui/controls", () => ({ UiButton: "Button", UiSection: "Section" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
vi.mock("@/features/day-feed/LocalItemImportOriginals", () => ({ LocalItemImportOriginals: "Originals" }));
vi.mock("@/features/documents/ImportDocumentsPanel", () => ({ ImportDocumentsPanel: "Documents" }));
vi.mock("@/native/capturePicker", () => ({ pickCaptureMaterial: vi.fn() }));
vi.mock("./CaptureActivity", () => ({ CaptureActivity: "Activity", captureJobTitle: vi.fn() }));
vi.mock("./CaptureComposer", () => ({ CaptureComposer: "Composer" }));
vi.mock("./CaptureProgress", () => ({ CaptureProgress: "Progress" }));
vi.mock("@/data/operations/defaultCaptureSubmission", () => ({ reopenDefaultCaptureJob: qa.reopen }));

function render(props: Parameters<typeof CaptureContent>[0]) {
  qa.indexes = { ref: 0, state: 0, effect: 0 };
  const element = CaptureContent(props);
  qa.scheduled.splice(0).forEach(effect => effect());
  return element;
}

afterEach(() => {
  qa.effects.splice(0).forEach(effect => effect.clean?.());
  qa.refs.length = 0;
  qa.states.length = 0;
  qa.reopen.mockReset();
});

it("keeps the root composer interactive if its hosted cancellation fails to remove the sheet", () => {
  const staging = createCaptureStaging(vi.fn(), () => true, { accountId: "account-a", tripPrior: null });
  const hide = vi.spyOn(staging, "hide");
  const onCancel = vi.fn();
  const props = { draftStaging: staging, isCurrent: () => true, onCancel, hostedComposer: true };
  const composer = render(props);
  composer.props.onClose();
  expect(onCancel).toHaveBeenCalledOnce();
  expect(hide).not.toHaveBeenCalled();
  composer.props.onText("Retained locally");
  expect(staging.getDraftSnapshot().editorText).toBe("Retained locally");
});

it("requalifies the same retained job on Review return and ignores events while its old lease is closed", async () => {
  const staging = createCaptureStaging(vi.fn(), () => true, { accountId: "account-a", tripPrior: null });
  const model = { batch: { accountId: "account-a", jobId: "job-a", context: {} }, inputs: [] };
  qa.reopen.mockResolvedValue(model);
  const first = vi.fn(() => true);
  const props = {
    draftStaging: staging, isCurrent: first, activityScope: first, onCancel: vi.fn(),
    hostedComposer: true, accountId: "account-a", jobId: "job-a",
  };
  render(props);
  await vi.waitFor(() => expect(qa.reopen).toHaveBeenCalledExactlyOnceWith("job-a"));
  render(props);

  first.mockReturnValue(false);
  announceCaptureProcessingActivity("account-a", "job-a");
  expect(qa.reopen).toHaveBeenCalledTimes(1);
  const returned = () => true;
  render({ ...props, isCurrent: returned, activityScope: returned });
  await vi.waitFor(() => expect(qa.reopen).toHaveBeenCalledTimes(2));

  announceCaptureProcessingActivity("account-b", "job-a");
  announceCaptureProcessingActivity("account-a", "job-b");
  announceCaptureProcessingActivity("account-a", "job-a");
  await vi.waitFor(() => expect(qa.reopen).toHaveBeenCalledTimes(3));
  expect(qa.reopen.mock.calls).toEqual([["job-a"], ["job-a"], ["job-a"]]);
});

it("keeps a covered manual fallback lease only for the original Batch and Trip assignment", async () => {
  const staging = createCaptureStaging(vi.fn(), () => true, { accountId: "account-a", tripPrior: null });
  const model = {
    batch: { accountId: "account-a", jobId: "job-a", batchId: "batch-a", context: {} },
    inputs: [], assignedTripId: "trip-a",
  };
  qa.reopen.mockResolvedValue(model);
  const admission = vi.fn(() => true);
  const open = vi.fn<(request: ImportManualRequest) => void>();
  const props = {
    draftStaging: staging, isCurrent: admission, activityScope: () => true, onCancel: vi.fn(),
    onOpenManualFallback: open, hostedComposer: true, accountId: "account-a", jobId: "job-a",
  };
  render(props);
  await vi.waitFor(() => expect(qa.reopen).toHaveBeenCalledOnce());
  const progress = render(props).props.content.props.children[0].props.children.props;
  progress.onOpenManualFallback();
  expect(open).toHaveBeenCalledOnce();
  const lease = open.mock.calls[0][0];
  expect(lease.tripId).toBe("trip-a");

  admission.mockReturnValue(false);
  expect(lease.isBatchCurrent()).toBe(true);
  progress.onOpenManualFallback();
  expect(open).toHaveBeenCalledOnce();

  qa.reopen.mockResolvedValue({ ...model, assignedTripId: "trip-b" });
  announceCaptureProcessingActivity("account-a", "job-a");
  await vi.waitFor(() => expect(qa.reopen).toHaveBeenCalledTimes(2));
  render(props);
  expect(lease.isBatchCurrent()).toBe(false);
});
