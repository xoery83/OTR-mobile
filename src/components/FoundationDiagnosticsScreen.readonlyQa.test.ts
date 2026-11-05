import { afterEach, expect, it, vi } from "vitest";
import {
  FoundationDiagnosticsScreen,
  NativeReadonlyQaCensusSection,
} from "./FoundationDiagnosticsScreen";
import { readCurrentNativeQaPreOtpCensus } from "@/data/operations/nativeQaPreOtpCensus";
const state = vi.hoisted(() => ({
  updates: [] as unknown[],
  cleanup: [] as (() => void)[],
  generation: 4,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [initial, (next: unknown) => state.updates.push(next)],
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (fn: unknown) => fn,
  useSyncExternalStore: (_subscribe: unknown, read: () => number) => read(),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) state.cleanup.push(cleanup);
  },
}));
vi.mock("react-native", () => ({
  Button: "Button",
  ScrollView: "ScrollView",
  Text: "Text",
  View: "View",
  StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/controls", () => ({
  UiButton: "UiButton",
  UiSection: "UiSection",
  UiText: "UiText",
}));
vi.mock("@/ui/forms", () => ({ UiTextInput: "UiTextInput" }));
vi.mock("@/ui/UiFoundationFixture", () => ({
  UiFoundationFixture: "UiFoundationFixture",
}));
vi.mock("./LocalOperationsDiagnostics", () => ({
  LocalOperationsDiagnostics: "LocalOperationsDiagnostics",
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  readDiagnosticsDebugMode: async () => false,
}));
vi.mock("@/hooks/useFoundationDiagnostics", () => ({
  useFoundationDiagnostics: () => ({
    diagnostics: null,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    transportMode: "dev",
  }),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: vi.fn(),
}));
vi.mock("@/data/operations/nativeQaPreOtpCensus", async (original) => ({
  ...(await original<typeof import("@/data/operations/nativeQaPreOtpCensus")>()),
  readCurrentNativeQaPreOtpCensus: vi.fn(),
}));
vi.mock("@/data/auth/authRepository", () => ({
  readCommittedLocalPrincipal: vi.fn(),
  requireCommittedGuestPrincipal: vi.fn(),
}));
const nodes = (x: unknown): any[] => {
  if (Array.isArray(x)) return x.flatMap(nodes);
  if (!x || typeof x !== "object") return [];
  const e = x as { props?: { children?: unknown } };
  return [e, ...nodes(e.props?.children)];
};
afterEach(() => {
  state.cleanup.splice(0).forEach((fn) => fn());
  state.updates = [];
  state.generation = 4;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.mocked(readCurrentNativeQaPreOtpCensus).mockReset();
});
it("Release default-off screen neither mounts QA section nor calls observer; opt-in does not use QA_SCOPE", () => {
  vi.stubGlobal("__DEV__", false);
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_READONLY_CENSUS_ENABLED", undefined);
  expect(
    nodes(FoundationDiagnosticsScreen()).some(
      (e) => e.type === NativeReadonlyQaCensusSection,
    ),
  ).toBe(false);
  expect(readCurrentNativeQaPreOtpCensus).not.toHaveBeenCalled();
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_READONLY_CENSUS_ENABLED", "true");
  expect(
    nodes(FoundationDiagnosticsScreen()).some(
      (e) => e.type === NativeReadonlyQaCensusSection,
    ),
  ).toBe(true);
  expect(readCurrentNativeQaPreOtpCensus).not.toHaveBeenCalled();
});
it("existing explicit Refresh alone invokes the read-only consumer once and projects fixed metadata", async () => {
  vi.mocked(readCurrentNativeQaPreOtpCensus).mockResolvedValue({
    status: "UNKNOWN",
    reason: "UNEXPECTED_PRIVATE_ERROR",
  });
  const tree = NativeReadonlyQaCensusSection();
  expect(readCurrentNativeQaPreOtpCensus).not.toHaveBeenCalled();
  nodes(tree)
    .find((e) => e.type === "UiButton")
    .props.onPress();
  await vi.waitFor(() =>
    expect(state.updates).toContainEqual(
      expect.objectContaining({
        projection: expect.objectContaining({
          status: "UNKNOWN",
          reason: "OWNER_READ_FAILED",
          counts: null,
        }),
      }),
    ),
  );
  expect(readCurrentNativeQaPreOtpCensus).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(state.updates)).not.toContain("UNEXPECTED_PRIVATE_ERROR");
});
it("duplicate presses share no extra work; blur/unmount discards the late read", async () => {
  let finish!: (value: { status: "UNKNOWN"; reason: string }) => void;
  vi.mocked(readCurrentNativeQaPreOtpCensus).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const tree = NativeReadonlyQaCensusSection();
  const press = nodes(tree).find((e) => e.type === "UiButton").props.onPress;
  press();
  press();
  expect(readCurrentNativeQaPreOtpCensus).toHaveBeenCalledTimes(1);
  state.cleanup.splice(0).forEach((fn) => fn());
  state.updates = [];
  finish({ status: "UNKNOWN", reason: "INCOMPLETE_OWNER_COVERAGE" });
  await Promise.resolve();
  await Promise.resolve();
  expect(state.updates).toEqual([]);
});
it("exceptions are displayed only as fixed UNKNOWN metadata", async () => {
  vi.mocked(readCurrentNativeQaPreOtpCensus).mockRejectedValue(
    Error("token-or-private-error"),
  );
  nodes(NativeReadonlyQaCensusSection())
    .find((e) => e.type === "UiButton")
    .props.onPress();
  await vi.waitFor(() =>
    expect(state.updates).toContainEqual(
      expect.objectContaining({
        projection: expect.objectContaining({
          reason: "OWNER_READ_FAILED",
          counts: null,
        }),
      }),
    ),
  );
  expect(JSON.stringify(state.updates)).not.toContain("token-or-private-error");
});

it("Account generation switch discards a late observation even before focus cleanup runs", async () => {
  let finish!: (value: { status: "UNKNOWN"; reason: string }) => void;
  vi.mocked(readCurrentNativeQaPreOtpCensus).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  nodes(NativeReadonlyQaCensusSection())
    .find((e) => e.type === "UiButton")
    .props.onPress();
  state.generation++;
  state.updates = [];
  finish({ status: "UNKNOWN", reason: "INCOMPLETE_OWNER_COVERAGE" });
  await Promise.resolve();
  await Promise.resolve();
  expect(
    state.updates.filter((value) => typeof value === "object" && value !== null),
  ).toEqual([]);
});
