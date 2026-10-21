import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseLocalDictationDiagnostic, readLocalDictation } from "./localDictation";
const bridge = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  addListener: vi.fn(),
}));
vi.mock("expo", () => ({ requireNativeModule: () => bridge }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
describe("local dictation bounded diagnostic adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    bridge.start.mockResolvedValue(undefined);
    bridge.stop.mockResolvedValue(undefined);
    bridge.cancel.mockResolvedValue(undefined);
  });
  it("allows only phase/domain/code and validity booleans, no raw data or Simulator attribution", () => {
    expect(
      parseLocalDictationDiagnostic({
        phase: "audio_format",
        domain: "NONE",
        sampleRateValid: false,
        channelCountValid: false,
        transcript: "private",
        sessionId: "private",
        audio: "private",
      }),
    ).toEqual({
      phase: "audio_format",
      domain: "NONE",
      sampleRateValid: false,
      channelCountValid: false,
    });
    expect(
      parseLocalDictationDiagnostic({
        phase: "recognition",
        domain: "kAFAssistantErrorDomain",
        code: 1101,
        description: "private",
      }),
    ).toEqual({ phase: "recognition", domain: "kAFAssistantErrorDomain", code: 1101 });
    expect(
      parseLocalDictationDiagnostic({ phase: "simulator", domain: "private" }),
    ).toBeNull();
    expect(
      parseLocalDictationDiagnostic({
        phase: "recognition",
        domain: "OTHER",
        code: Number.MAX_SAFE_INTEGER,
      }),
    ).toEqual({ phase: "recognition", domain: "OTHER" });
  });
  it("only observes its started session and clears terminal/cancelled sessions", async () => {
    let emit: (value: unknown) => void = () => {};
    bridge.addListener.mockImplementation((_event, listener) => {
      emit = listener;
      return { remove: vi.fn() };
    });
    const onDiagnostic = vi.fn(),
      state = vi.fn(),
      native = readLocalDictation({ onDiagnostic });
    native.addListener("state", state);
    await native.start("owned", "en-NZ");
    const diagnostic = { phase: "recognition", domain: "OTHER", code: 1 };
    emit({ sessionId: "foreign", status: "error", diagnostic });
    expect(onDiagnostic).not.toHaveBeenCalled();
    emit({ sessionId: "owned", status: "error", diagnostic });
    expect(onDiagnostic).toHaveBeenCalledWith(diagnostic);
    emit({ sessionId: "owned", status: "error", diagnostic });
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
    await native.start("cancelled", "en-NZ");
    await native.cancel("cancelled");
    emit({ sessionId: "cancelled", status: "error", diagnostic });
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
    expect(state).toHaveBeenCalledTimes(4);
  });
  it("a diagnostic callback cannot interrupt functional state delivery", async () => {
    let emit: (value: unknown) => void = () => {};
    bridge.addListener.mockImplementation((_event, listener) => {
      emit = listener;
      return { remove: vi.fn() };
    });
    const state = vi.fn(),
      native = readLocalDictation({
        onDiagnostic: () => {
          throw Error("ignored");
        },
      });
    native.addListener("state", state);
    await native.start("owned", "en-NZ");
    emit({
      sessionId: "owned",
      status: "error",
      diagnostic: { phase: "audio_engine", domain: "NONE" },
    });
    expect(state).toHaveBeenCalledTimes(1);
  });
});
