import { beforeEach, expect, it, vi } from "vitest";
import { CaptureContent } from "./CaptureContent";
import CaptureRoute from "../../../app/(tabs)/capture";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import type { CaptureStagingSnapshot } from "./captureStaging";

// Existing hook/event harness pattern: execute the production lifecycle without a new renderer.
const ui = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effect: null as null | (() => (() => void) | void),
  cleanup: null as null | (() => void),
  focus: null as null | (() => (() => void) | void),
  focusCleanup: null as null | (() => void),
  files: vi.fn(),
  photos: vi.fn(),
  session: vi.fn(),
  navigate: vi.fn(),
  setParams: vi.fn(),
  jobId: undefined as string | undefined,
  reopen: vi.fn(),
  submit: vi.fn(),
  createSession: vi.fn(),
  createRecovery: vi.fn(),
}));
vi.mock("@/data/operations/defaultCaptureSubmission", () => ({
  reopenDefaultCaptureJob: ui.reopen,
  createDefaultCaptureSubmissionSession: ui.createSession,
  createDefaultCaptureRecoveryAction: ui.createRecovery,
}));
vi.mock("react", () => ({
  useRef(initial: unknown) {
    const index = ui.cursor++;
    if (!(index in ui.slots)) ui.slots[index] = { current: initial };
    return ui.slots[index];
  },
  useState(initial: unknown) {
    const index = ui.cursor++;
    if (!(index in ui.slots))
      ui.slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      ui.slots[index],
      (value: unknown) => {
        ui.slots[index] = value;
      },
    ];
  },
  useEffect(effect: () => (() => void) | void) {
    ui.effect = effect;
  },
  useSyncExternalStore(_subscribe: unknown, snapshot: () => unknown) {
    return snapshot();
  },
  useCallback(callback: unknown, deps: unknown[]) {
    const index = ui.cursor++;
    const prior = ui.slots[index] as { callback: unknown; deps: unknown[] } | undefined;
    if (!prior || deps.some((dep, i) => dep !== prior.deps[i]))
      ui.slots[index] = { callback, deps };
    return (ui.slots[index] as { callback: unknown }).callback;
  },
}));
const navigation = { setParams: ui.setParams };
vi.mock("expo-router", () => ({
  useNavigation: () => navigation,
  useLocalSearchParams: () => ({ jobId: ui.jobId }),
  router: { navigate: ui.navigate, push: vi.fn() },
  useFocusEffect(callback: () => (() => void) | void) {
    if (ui.focus !== callback) {
      ui.focusCleanup?.();
      ui.focus = callback;
      ui.focusCleanup = callback() ?? null;
    }
  },
}));
vi.mock("react-native", () => ({
  ScrollView: "main",
  View: "div",
  Text: "span",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({ UiButton: "button", UiSection: "section" }));
vi.mock("@/data/auth/authRepository", () => ({ readLocalSession: ui.session }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: ui.files }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: ui.photos }));
const selected = { canceled: false, assets: [{ name: "one.pdf", uri: "temp://one" }] };
function renderContent(tripName = "Japan", isCurrent = () => true, jobId?: string) {
  ui.cursor = 0;
  return CaptureContent({ tripName, isCurrent, onCancel: ui.navigate, jobId }).props as {
    snapshot: CaptureStagingSnapshot;
    tripName: string;
    onFiles(): void;
    onCancel(): void;
    onSubmit(): void;
    onAddMore(): void;
    onRecover(id: string): void;
    onActivity(): void;
    onOpenJob(id: string): void;
    reading: boolean;
    readError: boolean;
    busy: boolean;
    locked: boolean;
    model: import("@/domain/capture/captureSubmission").CaptureJobReadModel | null;
  };
}
function renderRoute() {
  ui.cursor = 0;
  return CaptureRoute().props.children;
}
beforeEach(() => {
  ui.cleanup?.();
  ui.focusCleanup?.();
  ui.slots = [];
  ui.cursor = 0;
  ui.effect = null;
  ui.cleanup = null;
  ui.focus = null;
  ui.focusCleanup = null;
  vi.resetAllMocks();
  ui.jobId = undefined;
  ui.files.mockResolvedValue(selected);
  ui.createSession.mockResolvedValue({ submit: ui.submit, recover: async () => null });
});
it("StrictMode setup/cleanup/setup reuses a working store, rejects prior picker result and later unmount", async () => {
  let resolve!: (value: unknown) => void;
  ui.files
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue(selected);
  const first = renderContent();
  ui.cleanup = ui.effect!() ?? null;
  first.onFiles();
  ui.cleanup!();
  ui.cleanup = ui.effect!() ?? null;
  resolve(selected);
  await Promise.resolve();
  await Promise.resolve();
  expect(renderContent().snapshot.items).toEqual([]);
  renderContent().onFiles();
  await vi.waitFor(() => expect(renderContent().snapshot.items).toHaveLength(1));
  ui.cleanup!();
  expect(renderContent().snapshot.items).toEqual([]);
});
it("pins initial Trip prior during host rerenders; cancellation discards and calls host", async () => {
  renderContent().onFiles();
  await vi.waitFor(() => expect(renderContent().snapshot.items).toHaveLength(1));
  const changed = renderContent("Korea");
  expect(changed.tripName).toBe("Japan");
  expect(changed.snapshot.items).toHaveLength(1);
  changed.onCancel();
  expect(renderContent().snapshot.items).toEqual([]);
  expect(ui.navigate).toHaveBeenCalledOnce();
});
it("Account transition hides A immediately, waits for gate release, then admits offline B without refocus", async () => {
  ui.session.mockResolvedValue({ identity: { userId: "A" }, accessToken: null });
  renderRoute();
  await vi.waitFor(() => expect(renderRoute().type).toBe(CaptureContent));
  const a = renderRoute();
  const lease = await beginAccountTransition();
  ui.session.mockClear();
  renderRoute();
  await Promise.resolve();
  expect(ui.session).not.toHaveBeenCalled();
  expect(renderRoute().type).not.toBe(CaptureContent);
  expect(a.props.isCurrent()).toBe(false);
  ui.session.mockResolvedValue({ identity: { userId: "B" }, accessToken: null });
  endAccountTransition(lease);
  await vi.waitFor(() => expect(renderRoute().type).toBe(CaptureContent));
  const b = renderRoute();
  expect(b.key).toBe(`${getAccountGeneration()}:`);
  expect(b.props.isCurrent()).toBe(true);
  advanceAccountGeneration();
  expect(b.props.isCurrent()).toBe(false);
});
it("blur during a local session read prevents late admission and refocus checks freshly", async () => {
  let resolve!: (value: unknown) => void;
  ui.session.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  renderRoute();
  await vi.waitFor(() => expect(ui.session).toHaveBeenCalledOnce());
  ui.focusCleanup!();
  resolve({ identity: { userId: "A" } });
  await Promise.resolve();
  await Promise.resolve();
  expect(renderRoute().type).not.toBe(CaptureContent);
  ui.focus = null;
  ui.session.mockResolvedValue({ identity: { userId: "A" } });
  renderRoute();
  await vi.waitFor(() => expect(renderRoute().type).toBe(CaptureContent));
});

it("reopened Job Add more unlocks a fresh volatile roster without creating another Job until Add", async () => {
  const model = {
    batch: { jobId: "same-job" },
    inputs: [],
    counts: { selected: 1, accepted: 0, failed: 0, pending: 1 },
    availableActions: { canAddMore: true, reacquireInputIds: [] },
  };
  ui.reopen.mockResolvedValue(model);
  renderContent("Japan", () => true, "same-job");
  ui.cleanup = ui.effect!() ?? null;
  await vi.waitFor(() =>
    expect(renderContent("Japan", () => true, "same-job").model).toEqual(model),
  );
  expect(renderContent("Japan", () => true, "same-job").locked).toBe(true);
  expect(renderContent("Japan", () => true, "same-job").tripName).toBeUndefined();
  renderContent("Japan", () => true, "same-job").onAddMore();
  expect(renderContent("Japan", () => true, "same-job").locked).toBe(false);
  expect(renderContent("Japan", () => true, "same-job").tripName).toBe("Japan");
  renderContent("Japan", () => true, "same-job").onFiles();
  await vi.waitFor(() =>
    expect(renderContent("Japan", () => true, "same-job").snapshot.items).toHaveLength(1),
  );
  expect(ui.createSession).not.toHaveBeenCalled();
});
it("double taps share submit; Hide during work permits completion and never auto-closes again", async () => {
  renderContent();
  ui.cleanup = ui.effect!() ?? null;
  renderContent().onFiles();
  await vi.waitFor(() => expect(renderContent().snapshot.items).toHaveLength(1));
  let finish!: () => void;
  ui.submit.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const tray = renderContent();
  tray.onSubmit();
  tray.onSubmit();
  await vi.waitFor(() => expect(ui.submit).toHaveBeenCalledOnce());
  expect(ui.createSession).toHaveBeenCalledOnce();
  expect(renderContent().busy).toBe(true);
  renderContent().onCancel();
  ui.cleanup!();
  finish();
  await vi.waitFor(() => expect(ui.navigate).toHaveBeenCalledOnce());
  expect(ui.submit).toHaveBeenCalledOnce();
});

it("acknowledged pinned mismatch releases old action so exact original can be selected again", async () => {
  const model = {
    batch: { jobId: "same-job" },
    inputs: [{ id: "input", revision: 3, contentSha256: "pin", state: "FAILED" }],
    counts: { selected: 1, accepted: 0, failed: 1, pending: 0 },
    availableActions: { canAddMore: true, reacquireInputIds: ["input"] },
  };
  ui.reopen.mockResolvedValue(model);
  ui.createRecovery.mockImplementation(async () => ({
    run: async () => ({ ...model, inputs: [{ ...model.inputs[0], revision: 4 }] }),
    recover: async () => null,
  }));
  renderContent("Japan", () => true, "same-job");
  ui.cleanup = ui.effect!() ?? null;
  await vi.waitFor(() =>
    expect(renderContent("Japan", () => true, "same-job").model).toEqual(model),
  );
  renderContent("Japan", () => true, "same-job").onRecover("input");
  await vi.waitFor(() =>
    expect(renderContent("Japan", () => true, "same-job").busy).toBe(false),
  );
  renderContent("Japan", () => true, "same-job").onRecover("input");
  await vi.waitFor(() => expect(ui.createRecovery).toHaveBeenCalledTimes(2));
  expect(ui.createRecovery).toHaveBeenLastCalledWith("same-job", "input", 4);
});

it("Activity entry opens the exact retained Job; failed read stays truthful and allows Activity retry", async () => {
  renderContent();
  ui.cleanup = ui.effect!() ?? null;
  renderContent().onActivity();
  ui.cursor = 0;
  const activity = CaptureContent({ isCurrent: () => true, onCancel: ui.navigate }).props;
  const model = { batch: { jobId: "retained-uuid" } };
  ui.reopen.mockResolvedValueOnce(model);
  activity.onOpenJob("retained-uuid");
  await vi.waitFor(() => expect(renderContent().model).toEqual(model));
  expect(ui.reopen).toHaveBeenCalledWith("retained-uuid");
  expect(ui.createSession).not.toHaveBeenCalled();
  ui.reopen.mockRejectedValueOnce(new Error("revoked"));
  renderContent().onOpenJob("missing-uuid");
  await vi.waitFor(() => expect(renderContent().readError).toBe(true));
  expect(renderContent().model).toBeNull();
  expect(renderContent().reading).toBe(false);
  renderContent().onActivity();
  ui.cursor = 0;
  expect(CaptureContent({ isCurrent: () => true, onCancel: ui.navigate }).type.name).toBe(
    "CaptureActivity",
  );
});
it("late reopen cannot replace newer Job, expose after Account/Trip invalidation, Hide or effect replay", async () => {
  for (const boundary of ["newer", "account", "trip", "hide", "replay"] as const) {
    ui.cleanup?.();
    ui.slots = [];
    ui.cursor = 0;
    let valid = true;
    const scope = () => valid;
    let resolve!: (value: unknown) => void;
    ui.reopen.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    renderContent("Japan", scope, "old-job");
    ui.cleanup = ui.effect!() ?? null;
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    if (boundary === "newer") {
      ui.reopen.mockResolvedValueOnce({ batch: { jobId: "new-job" } });
      renderContent("Japan", scope).onOpenJob("new-job");
      await vi.waitFor(() =>
        expect(renderContent("Japan", scope).model?.batch.jobId).toBe("new-job"),
      );
    } else if (boundary === "account" || boundary === "trip") valid = false;
    else if (boundary === "hide") renderContent("Japan", scope).onCancel();
    else {
      ui.cleanup!();
      ui.reopen.mockResolvedValueOnce({ batch: { jobId: "current-job" } });
      ui.cleanup = ui.effect!() ?? null;
      await vi.waitFor(() =>
        expect(renderContent("Japan", scope).model?.batch.jobId).toBe("current-job"),
      );
    }
    resolve({ batch: { jobId: "old-job" } });
    await new Promise((done) => setTimeout(done, 0));
    expect(renderContent("Japan", scope).model?.batch.jobId).not.toBe("old-job");
  }
});
it("route blur clears historical deep-link params; next ordinary focus opens a fresh tray", async () => {
  ui.jobId = "retained-uuid";
  ui.session.mockResolvedValue({ identity: { userId: "A" } });
  renderRoute();
  await vi.waitFor(() => expect(renderRoute().type).toBe(CaptureContent));
  expect(renderRoute().props.jobId).toBe("retained-uuid");
  ui.focusCleanup!();
  expect(ui.setParams).toHaveBeenCalledWith({ jobId: undefined });
  ui.jobId = undefined;
  ui.focus = null;
  renderRoute();
  await vi.waitFor(() => expect(renderRoute().type).toBe(CaptureContent));
  expect(renderRoute().props.jobId).toBeUndefined();
});
