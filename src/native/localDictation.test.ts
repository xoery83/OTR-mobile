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
  it.each(["event-first", "result-first"])(
    "publishes early failure once when %s",
    async (order) => {
      let emit: (value: unknown) => void = () => {};
      let complete: (value: unknown) => void = () => {};
      bridge.addListener.mockImplementation((_event, listener) => {
        emit = listener;
        return { remove: vi.fn() };
      });
      bridge.start.mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const onDiagnostic = vi.fn(),
        native = readLocalDictation({ onDiagnostic });
      native.addListener("state", vi.fn());
      const pending = native.start("owned", "en-NZ");
      const diagnostic = {
        phase: "audio_engine",
        domain: "NSOSStatusErrorDomain",
        code: -50,
        sampleRateValid: true,
        channelCountValid: true,
      };
      const event = { sessionId: "owned", status: "error", error: "failed", diagnostic };
      if (order === "event-first") emit(event);
      complete({
        error: "failed",
        diagnostic: { ...diagnostic, description: "private", audio: "private" },
      });
      await expect(pending).rejects.toMatchObject({ code: "failed" });
      if (order === "result-first") emit(event);
      emit(event);
      expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith(diagnostic);
    },
  );
  it("does not invent a native phase or forward data from an unknown bridge rejection", async () => {
    const error = Object.assign(new Error("private"), {
      diagnostic: { phase: "audio_engine", domain: "NONE" },
      userInfo: "private",
    });
    bridge.start.mockRejectedValue(error);
    const onDiagnostic = vi.fn(),
      native = readLocalDictation({ onDiagnostic });
    await expect(native.start("owned", "en-NZ")).rejects.toBe(error);
    expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({
      phase: "unknown",
      domain: "OTHER",
    });
  });
  it("never publishes an early rejection after its session was cancelled", async () => {
    let complete: (value: unknown) => void = () => {};
    bridge.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const onDiagnostic = vi.fn(),
      native = readLocalDictation({ onDiagnostic });
    const pending = native.start("cancelled", "en-NZ");
    await native.cancel("cancelled");
    complete({
      error: "permission",
      diagnostic: { phase: "microphone_permission", domain: "NONE" },
    });
    await expect(pending).rejects.toMatchObject({ code: "permission" });
    expect(onDiagnostic).not.toHaveBeenCalled();
  });
  it.each(["event", "result"])(
    "reports local recognizer initialization failure as unavailable via %s",
    async (route) => {
      let emit: (value: unknown) => void = () => {};
      bridge.addListener.mockImplementation((_event, listener) => {
        emit = listener;
        return { remove: vi.fn() };
      });
      const listener = vi.fn(),
        native = readLocalDictation();
      native.addListener("state", listener);
      const diagnostic = { phase: "recognition", domain: "kLSRErrorDomain", code: 300 };
      if (route === "result") {
        bridge.start.mockResolvedValue({ error: "failed", diagnostic });
        await expect(native.start("owned", "en-US")).rejects.toMatchObject({
          code: "unavailable",
        });
      } else {
        await native.start("owned", "en-US");
        emit({ sessionId: "owned", status: "error", error: "failed", diagnostic });
        expect(listener).toHaveBeenLastCalledWith({
          sessionId: "owned",
          status: "error",
          error: "unavailable",
          diagnostic,
        });
      }
      expect(bridge.start).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    ["permission", "recognition", "kLSRErrorDomain", 300],
    ["failed", "audio_engine", "kLSRErrorDomain", 300],
    ["failed", "recognition", "OTHER", 300],
    ["failed", "recognition", "kLSRErrorDomain", 301],
  ])(
    "keeps other failures unchanged (%s/%s/%s/%s)",
    async (error, phase, domain, code) => {
      bridge.start.mockResolvedValue({ error, diagnostic: { phase, domain, code } });
      await expect(readLocalDictation().start("owned", "en-US")).rejects.toMatchObject({
        code: error,
      });
    },
  );
  it("does not reclassify foreign or cancelled session errors", async () => {
    let emit: (value: unknown) => void = () => {};
    bridge.addListener.mockImplementation((_event, listener) => {
      emit = listener;
      return { remove: vi.fn() };
    });
    const listener = vi.fn(),
      native = readLocalDictation();
    native.addListener("state", listener);
    await native.start("cancelled", "en-US");
    await native.cancel("cancelled");
    for (const sessionId of ["foreign", "cancelled"]) {
      const event = {
        sessionId,
        status: "error",
        error: "failed",
        diagnostic: { phase: "recognition", domain: "kLSRErrorDomain", code: 300 },
      };
      emit(event);
      expect(listener).toHaveBeenLastCalledWith(event);
    }
  });
});
