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
import { createCaptureStaging } from "./captureStaging";
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
  back: vi.fn(),
  canGoBack: vi.fn(),
  setParams: vi.fn(),
  focused: true,
  jobId: undefined as string | undefined,
  tripId: undefined as string | undefined,
  priorRead: vi.fn(),
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
const navigation = { setParams: ui.setParams, isFocused: () => ui.focused };
vi.mock("expo-router", () => ({
  useNavigation: () => navigation,
  useLocalSearchParams: () => ({ jobId: ui.jobId, tripId: ui.tripId }),
  router: {
    navigate: ui.navigate,
    push: vi.fn(),
    back: ui.back,
    canGoBack: ui.canGoBack,
  },
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
  ui.focused = true;
  ui.jobId = undefined;
  ui.tripId = undefined;
  ui.priorRead.mockResolvedValue(null);
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
  ui.focused = false;
  ui.focusCleanup!();
  expect(ui.setParams).toHaveBeenCalledWith({ jobId: undefined });
  ui.jobId = undefined;
  ui.focused = true;
  ui.focus = null;
  renderRoute();
  await vi.waitFor(() => expect(renderRoute().type).toBe(CaptureContent));
  expect(renderRoute().props.jobId).toBeUndefined();
});

vi.mock("./CaptureCustodyDevAction", () => ({ CaptureCustodyDevAction: () => null }));
vi.mock("./CaptureComposer", () => ({ CaptureComposer: () => null }));

it("mounted retained composer includes editor once, blocks unsupported submission, and Close restores the same authenticated draft", async () => {
  const owner = { accountId: "synthetic-admitted", tripPrior: null };
  const staging = createCaptureStaging(
    async () => [],
    () => true,
    owner,
  );
  const draw = () => {
    ui.cursor = 0;
    return CaptureContent({
      isCurrent: () => true,
      onCancel: ui.navigate,
      draftStaging: staging,
    }).props as any;
  };
  let composer = draw();
  ui.cleanup = ui.effect?.() ?? null;
  composer = draw();
  composer.onText("Original travel note");
  composer = draw();
  expect(composer.count).toBe(1);
  composer.onSubmit();
  await Promise.resolve();
  expect(ui.createSession).not.toHaveBeenCalled();
  composer.onAddText();
  composer = draw();
  expect(composer.count).toBe(1);
  expect(composer.snapshot.editorText).toBe("");
  expect(composer.snapshot.items[0].source).toBe("magic_input");
  const staleClear = composer.onClear;
  composer.onClose();
  ui.cleanup?.();
  ui.cleanup = null;
  expect(staging.getDraftSnapshot().items).toHaveLength(0);
  expect(staging.resume({ accountId: "other", tripPrior: null }, () => true)).toBe(false);
  expect(staging.resume(owner, () => true)).toBe(true);
  ui.slots = [];
  composer = draw();
  ui.cleanup = ui.effect?.() ?? null;
  expect(draw().count).toBe(1);
  staleClear();
  expect(draw().count).toBe(1);
  composer.onClear();
  expect(draw().count).toBe(0);
  expect(ui.navigate).toHaveBeenCalledOnce();
});

it("normal route rechecks auth and restores the same unassigned draft after blur without adopting another account", async () => {
  ui.session.mockResolvedValue({ identity: { userId: "A" } });
  renderRoute();
  await vi.waitFor(() => expect(renderRoute().type).toBe(CaptureContent));
  const first = renderRoute().props.draftStaging;
  ui.canGoBack.mockReturnValue(true);
  renderRoute().props.onCancel();
  expect(ui.back).toHaveBeenCalledOnce();
  expect(ui.navigate).not.toHaveBeenCalled();
  first.setEditorText("Account A draft");
  first.hide();
  ui.focusCleanup!();
  ui.focus = null;
  renderRoute();
  await vi.waitFor(() => expect(renderRoute().type).toBe(CaptureContent));
  expect(renderRoute().props.draftStaging).toBe(first);
  expect(first.getDraftSnapshot().editorText).toBe("Account A draft");
  const transition = await beginAccountTransition();
  ui.session.mockResolvedValue({ identity: { userId: "B" } });
  renderRoute();
  endAccountTransition(transition);
  await vi.waitFor(() => expect(renderRoute().type).toBe(CaptureContent));
  const second = renderRoute().props.draftStaging;
  expect(second).not.toBe(first);
  expect(second.getDraftSnapshot().editorText).toBe("");
  expect(second.getDraftSnapshot().items).toHaveLength(0);
});

it("opening a saved Job uses the existing route invocation without clearing the retained pre-submit draft", () => {
  const staging = createCaptureStaging(
    async () => [],
    () => true,
    { accountId: "A", tripPrior: null },
  );
  const open = vi.fn();
  const draw = () => {
    ui.cursor = 0;
    return CaptureContent({
      isCurrent: () => true,
      onCancel: ui.navigate,
      draftStaging: staging,
      onReopenJob: open,
    }).props as any;
  };
  draw();
  ui.cleanup = ui.effect?.() ?? null;
  staging.setEditorText("Keep original draft");
  draw().onActivity();
  draw().onOpenJob("saved-job");
  expect(open).toHaveBeenCalledWith("saved-job");
  expect(staging.getDraftSnapshot().editorText).toBe("Keep original draft");
  expect(ui.reopen).not.toHaveBeenCalled();
});

it("reviewer: a submitted Files roster is not restored as a new unsubmitted draft after Close", async () => {
  const owner = { accountId: "A", tripPrior: null };
  const staging = createCaptureStaging(
    async () => [
      {
        source: "files" as const,
        temporaryUri: "file://selected.pdf",
        name: "selected.pdf",
        typeHint: "application/pdf",
      },
    ],
    () => true,
    owner,
  );
  const draw = () => {
    ui.cursor = 0;
    return CaptureContent({
      isCurrent: () => true,
      onCancel: ui.navigate,
      draftStaging: staging,
    }).props as any;
  };
  const model = {
    batch: { jobId: "existing-owning-job" },
    inputs: [],
    counts: { selected: 1, accepted: 1, failed: 0, pending: 0 },
    availableActions: { canAddMore: true, reacquireInputIds: [] },
  };
  ui.submit.mockImplementation(
    async (_items: unknown, progress: (m: unknown) => void) => {
      progress(model);
    },
  );
  draw();
  ui.cleanup = ui.effect!() ?? null;
  draw().onFiles();
  await vi.waitFor(() => expect(draw().count).toBe(1));
  draw().onSubmit();
  await vi.waitFor(() => expect(draw().model).toEqual(model));
  expect(ui.createSession).toHaveBeenCalledOnce();
  draw().onCancel();
  ui.cleanup?.();
  ui.cleanup = null;
  expect(staging.resume(owner, () => true)).toBe(true);
  ui.slots = [];
  draw();
  ui.cleanup = ui.effect!() ?? null;
  expect(draw().count).toBe(0);
});

it("retained C3 failed acknowledgement retries the same owning session, while cleanup cannot reoffer its roster as a fresh batch", async () => {
  const owner = { accountId: "A", tripPrior: null };
  const staging = createCaptureStaging(
    async () => [
      {
        source: "files" as const,
        temporaryUri: "file://one",
        name: "one.pdf",
        typeHint: "application/pdf",
      },
    ],
    () => true,
    owner,
  );
  const draw = () => {
    ui.cursor = 0;
    return CaptureContent({
      isCurrent: () => true,
      onCancel: ui.navigate,
      draftStaging: staging,
    }).props as any;
  };
  ui.submit
    .mockRejectedValueOnce(new Error("SYNTHETIC_UNKNOWN_ACK"))
    .mockResolvedValueOnce(undefined);
  draw();
  ui.cleanup = ui.effect!() ?? null;
  draw().onFiles();
  await vi.waitFor(() => expect(draw().count).toBe(1));
  draw().onSubmit();
  await vi.waitFor(() => expect(draw().submitError).toBe(true));
  expect(staging.getSnapshot().items).toHaveLength(0);
  expect(draw().snapshot.items).toHaveLength(1);
  draw().onSubmit();
  await vi.waitFor(() => expect(ui.submit).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(draw().busy).toBe(false));
  expect(ui.createSession).toHaveBeenCalledOnce();
  expect(ui.submit.mock.calls[1][0]).toEqual(ui.submit.mock.calls[0][0]);
  ui.cleanup!();
  ui.cleanup = null;
  expect(staging.resume(owner, () => true)).toBe(true);
  ui.slots = [];
  draw();
  ui.cleanup = ui.effect!() ?? null;
  expect(draw().count).toBe(0);
  expect(ui.createSession).toHaveBeenCalledOnce();
});

it("authenticated Submit transforms the same sheet into one Job, and explicit New Import creates a separate owning session", async () => {
  const owner = { accountId: "A", tripPrior: null };
  const staging = createCaptureStaging(
    async () => [
      {
        source: "files" as const,
        temporaryUri: "file://selected",
        name: "input.pdf",
        typeHint: "application/pdf",
      },
    ],
    () => true,
    owner,
  );
  const draw = () => {
    ui.cursor = 0;
    return CaptureContent({
      isCurrent: () => true,
      onCancel: ui.navigate,
      draftStaging: staging,
      accountId: owner.accountId,
    });
  };
  const model = (id: string) => ({
    batch: { jobId: id },
    inputs: [],
    counts: { selected: 1, accepted: 1, failed: 0, pending: 0 },
    availableActions: { canAddMore: true, reacquireInputIds: [] },
  });
  ui.submit
    .mockImplementationOnce(async (_selected: any, progress: any) =>
      progress(model("one-job")),
    )
    .mockImplementationOnce(async (_selected: any, progress: any) =>
      progress(model("two-job")),
    );
  const first = draw();
  ui.cleanup = ui.effect!() ?? null;
  (draw().props as any).onFiles();
  await vi.waitFor(() => expect((draw().props as any).count).toBe(1));
  (draw().props as any).onSubmit();
  await vi.waitFor(() =>
    expect((draw().props as any).content?.props.model?.batch.jobId).toBe("one-job"),
  );
  expect(draw().type).toBe(first.type);
  expect((draw().props as any).content.type.name).toBe("CaptureProgress");
  await vi.waitFor(() => expect((draw().props as any).content.props.busy).toBe(false));
  (draw().props as any).content.props.onNewImport();
  expect((draw().props as any).content).toBeUndefined();
  (draw().props as any).onFiles();
  await vi.waitFor(() => expect((draw().props as any).count).toBe(1));
  (draw().props as any).onSubmit();
  await vi.waitFor(() =>
    expect((draw().props as any).content?.props.model?.batch.jobId).toBe("two-job"),
  );
  expect(ui.createSession).toHaveBeenCalledTimes(2);
  expect(draw().type).toBe(first.type);
  expect(ui.navigate).not.toHaveBeenCalled();
});
it("same-sheet Active Imports inspection preserves the unsubmitted composer draft", async () => {
  const staging = createCaptureStaging(
    async () => [],
    () => true,
    { accountId: "A", tripPrior: null },
  );
  const draw = () => {
    ui.cursor = 0;
    return CaptureContent({
      isCurrent: () => true,
      onCancel: ui.navigate,
      draftStaging: staging,
      accountId: "A",
    });
  };
  const initial = draw();
  ui.cleanup = ui.effect!() ?? null;
  staging.setEditorText("Keep this original draft");
  (draw().props as any).onActivity();
  expect(draw().type).toBe(initial.type);
  ui.reopen.mockResolvedValue({ batch: { jobId: "history-job" } });
  (draw().props as any).content.props.onOpenJob("history-job");
  await vi.waitFor(() =>
    expect((draw().props as any).content?.props.model?.batch.jobId).toBe("history-job"),
  );
  expect(staging.getDraftSnapshot().editorText).toBe("Keep this original draft");
  (draw().props as any).content.props.onNewImport();
  expect((draw().props as any).snapshot.editorText).toBe("Keep this original draft");
  expect(ui.createSession).not.toHaveBeenCalled();
});
it("fresh Trip prior is revalidated before C3 handoff and frozen retry keeps its hint", async () => {
  const prior = "40000000-0000-4000-8000-000000000001",
    validate = vi.fn().mockResolvedValue(true);
  const staging = createCaptureStaging(
    async () => [
      {
        source: "files" as const,
        temporaryUri: "file://prior.pdf",
        name: "prior.pdf",
        typeHint: "application/pdf",
      },
    ],
    () => true,
    { accountId: "A", tripPrior: prior },
  );
  const draw = () => {
    ui.cursor = 0;
    return CaptureContent({
      isCurrent: () => true,
      onCancel: ui.navigate,
      draftStaging: staging,
      tripPrior: prior,
      validateTripPrior: validate,
    }).props as any;
  };
  draw();
  ui.cleanup = ui.effect!() ?? null;
  draw().onFiles();
  await vi.waitFor(() => expect(draw().count).toBe(1));
  ui.submit.mockRejectedValue(new Error("unknown acknowledgement"));
  draw().onSubmit();
  await vi.waitFor(() => expect(ui.submit).toHaveBeenCalledOnce());
  expect(validate).toHaveBeenCalledOnce();
  expect(ui.submit.mock.calls[0][2]).toBe(prior);
  await vi.waitFor(() => expect(draw().submitError).toBe(true));
  validate.mockResolvedValue(false);
  draw().onSubmit();
  await vi.waitFor(() => expect(ui.submit).toHaveBeenCalledTimes(2));
  expect(validate).toHaveBeenCalledOnce();
  expect(ui.submit.mock.calls[1][2]).toBe(prior);
});
it("denied fresh Trip prior keeps the unsubmitted draft and never creates a C3 session", async () => {
  const prior = "40000000-0000-4000-8000-000000000001";
  const staging = createCaptureStaging(
    async () => [
      {
        source: "files" as const,
        temporaryUri: "file://prior.pdf",
        name: "prior.pdf",
        typeHint: "application/pdf",
      },
    ],
    () => true,
    { accountId: "A", tripPrior: prior },
  );
  const draw = () => {
    ui.cursor = 0;
    return CaptureContent({
      isCurrent: () => true,
      onCancel: ui.navigate,
      draftStaging: staging,
      tripPrior: prior,
      validateTripPrior: async () => false,
    }).props as any;
  };
  draw();
  ui.cleanup = ui.effect!() ?? null;
  draw().onFiles();
  await vi.waitFor(() => expect(draw().count).toBe(1));
  draw().onSubmit();
  await vi.waitFor(() => expect(draw().errorMessage).toBeDefined());
  expect(ui.createSession).not.toHaveBeenCalled();
  expect(ui.submit).not.toHaveBeenCalled();
  expect(staging.getDraftSnapshot().items).toHaveLength(1);
});

vi.mock("@/features/capture/captureTripPrior", () => ({
  readCaptureTripPrior: (...args: unknown[]) => ui.priorRead(...args),
}));
it("the existing Capture host retains separate same-account explicit-Trip drafts and invalidates the previous focus lease", async () => {
  const a = "40000000-0000-4000-8000-000000000001",
    b = "40000000-0000-4000-8000-000000000002";
  ui.session.mockResolvedValue({ identity: { userId: "A" } });
  ui.priorRead.mockImplementation(async (id: string) => ({
    id,
    name: id === a ? "Trip A" : "Trip B",
  }));
  ui.tripId = a;
  renderRoute();
  ui.focusCleanup = ui.focus!() ?? null;
  await vi.waitFor(() => expect(renderRoute().type).toBe(CaptureContent));
  const first = renderRoute();
  expect(first.props.tripPrior).toBe(a);
  first.props.draftStaging.setEditorText("Draft A");
  ui.focusCleanup?.();
  ui.focusCleanup = null;
  expect(first.props.isCurrent()).toBe(false);
  ui.tripId = b;
  renderRoute();
  ui.focusCleanup = ui.focus!() ?? null;
  await vi.waitFor(() => expect(renderRoute().props.tripPrior).toBe(b));
  const second = renderRoute();
  expect(second.props.draftStaging.getDraftSnapshot().editorText).toBe("");
  second.props.draftStaging.setEditorText("Draft B");
  ui.focusCleanup?.();
  ui.focusCleanup = null;
  ui.tripId = a;
  renderRoute();
  ui.focusCleanup = ui.focus!() ?? null;
  await vi.waitFor(() => expect(renderRoute().props.tripPrior).toBe(a));
  expect(renderRoute().props.draftStaging.getDraftSnapshot().editorText).toBe("Draft A");
  expect(second.props.isCurrent()).toBe(false);
  expect(ui.submit).not.toHaveBeenCalled();
});

it("reviewer: changing explicit Trip prior while Capture remains focused must not have old cleanup erase the new route", async () => {
  const a = "40000000-0000-4000-8000-000000000001",
    b = "40000000-0000-4000-8000-000000000002";
  ui.session.mockResolvedValue({ identity: { userId: "A" } });
  ui.priorRead.mockImplementation(async (id: string) => ({ id, name: id }));
  ui.tripId = a;
  renderRoute();
  await vi.waitFor(() => expect(renderRoute().props.tripPrior).toBe(a));
  const old = renderRoute();
  old.props.draftStaging.setEditorText("Keep A");
  ui.setParams.mockImplementation((params) => {
    if (Object.hasOwn(params, "tripId")) ui.tripId = params.tripId;
    if (Object.hasOwn(params, "jobId")) ui.jobId = params.jobId;
  });
  ui.tripId = b;
  renderRoute();
  await vi.waitFor(() => expect(renderRoute().props.tripPrior).toBe(b));
  expect(ui.tripId).toBe(b);
  expect(old.props.isCurrent()).toBe(false);
  expect(renderRoute().props.draftStaging.getDraftSnapshot().editorText).toBe("");
  expect(ui.submit).not.toHaveBeenCalled();
});

it("explicit pre-submit target selection retains material/text and freezes the chosen prior for retries", async () => {
  const staging = createCaptureStaging(
    async () => [
      {
        source: "files",
        temporaryUri: "temp://one",
        name: "one.pdf",
        typeHint: "application/pdf",
      },
    ],
    () => true,
    { accountId: "A", tripPrior: null },
  );
  await staging.pick("files");
  staging.setEditorText("retain this text");
  const validate = vi.fn(async () => true);
  const render = () => {
    ui.cursor = 0;
    return CaptureContent({
      accountId: "A",
      draftStaging: staging,
      isCurrent: () => true,
      onCancel: ui.navigate,
      validateTripPrior: validate,
    }).props;
  };
  render();
  ui.cleanup = ui.effect!() ?? null;
  expect(await render().onTripTarget({ id: "B", name: "Trip B" }, () => true)).toBe(true);
  expect(render().tripName).toBe("Trip B");
  expect(staging.getDraftSnapshot().editorText).toBe("retain this text");
  expect(staging.getDraftSnapshot().items).toHaveLength(1);
  staging.setEditorText("");
  await render().onSubmit();
  expect(validate).toHaveBeenLastCalledWith("B");
  await vi.waitFor(() =>
    expect(ui.submit).toHaveBeenCalledWith(expect.any(Array), expect.any(Function), "B"),
  );
  expect(await render().onTripTarget(null, () => true)).toBe(false);
});
it("late selection from a closed target panel cannot change the draft", async () => {
  const staging = createCaptureStaging(
    async () => [],
    () => true,
    { accountId: "A", tripPrior: null },
  );
  let done!: (value: boolean) => void;
  let panelCurrent = true;
  const render = () => {
    ui.cursor = 0;
    return CaptureContent({
      accountId: "A",
      draftStaging: staging,
      isCurrent: () => true,
      onCancel: ui.navigate,
      validateTripPrior: () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    }).props;
  };
  render();
  ui.cleanup = ui.effect!() ?? null;
  const selecting = render().onTripTarget(
    { id: "B", name: "Trip B" },
    () => panelCurrent,
  );
  panelCurrent = false;
  done(true);
  expect(await selecting).toBe(false);
  expect(staging.getDraftSnapshot().tripTarget).toBeUndefined();
});
