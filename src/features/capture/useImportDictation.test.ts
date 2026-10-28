import { afterEach, expect, it, vi } from "vitest";
import { useImportDictation } from "./useImportDictation";

const h = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  setters: [] as ReturnType<typeof vi.fn>[],
  diagnostic: undefined as undefined | ((value: unknown) => void),
}));
vi.mock("react", () => ({
  useState: (value: unknown) => {
    const setter = vi.fn();
    h.setters.push(setter);
    return [value, setter];
  },
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => h.effects.push(effect),
}));
vi.mock("@/native/localDictation", () => ({
  readLocalDictation: (options: { onDiagnostic(value: unknown): void }) => {
    h.diagnostic = options.onDiagnostic;
    return {
      start: async () => {},
      cancel: async () => {},
      stop: async () => {},
      addListener: () => ({ remove: () => {} }),
    };
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  h.effects = [];
  h.setters = [];
  h.diagnostic = undefined;
});

it.each([undefined, "0", "1"])(
  "Release diagnostics require the explicit QA build flag (%s) and stop on unmount",
  async (flag) => {
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_OTR_DICTATION_DIAGNOSTICS", flag);
    const voice = useImportDictation(vi.fn());
    const cleanups = h.effects.map((effect) => effect());
    voice.start("Retained draft", "en-US");
    await vi.waitFor(() => expect(h.diagnostic).toBeTypeOf("function"));
    const diagnostic = { phase: "application", domain: "NONE" };
    h.diagnostic!(diagnostic);
    expect(h.setters[1]).toHaveBeenCalledTimes(flag === "1" ? 2 : 1);
    if (flag === "1") expect(h.setters[1]).toHaveBeenLastCalledWith(diagnostic);
    cleanups.forEach((cleanup) => cleanup?.());
    h.setters[1].mockClear();
    h.diagnostic!(diagnostic);
    expect(h.setters[1]).not.toHaveBeenCalled();
  },
);
