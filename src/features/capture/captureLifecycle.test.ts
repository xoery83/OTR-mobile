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
}));
vi.mock("react", () => ({
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
vi.mock("expo-router", () => ({
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
function renderContent(tripName = "Japan", isCurrent = () => true) {
  ui.cursor = 0;
  return CaptureContent({ tripName, isCurrent, onCancel: ui.navigate }).props as {
    snapshot: CaptureStagingSnapshot;
    tripName: string;
    onFiles(): void;
    onCancel(): void;
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
  ui.files.mockResolvedValue(selected);
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
  expect(b.key).toBe(String(getAccountGeneration()));
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
