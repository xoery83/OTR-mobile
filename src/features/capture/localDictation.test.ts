import { expect, it, vi } from "vitest";
import { createLocalDictation, type DictationNative } from "./localDictation";
function fixture() {
  const callbacks: Record<string, ((event: unknown) => void)[]> = {};
  const native: DictationNative = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    addListener: (name, callback) => {
      (callbacks[name] ??= []).push(callback);
      return { remove: vi.fn() };
    },
  };
  const onText = vi.fn(),
    onState = vi.fn(),
    load = vi.fn(async () => native);
  const owner = createLocalDictation({ load, onText, onState });
  const id = () => vi.mocked(native.start).mock.calls.at(-1)![0];
  const emit = (name: string, event: Record<string, unknown>) =>
    callbacks[name]?.forEach((callback) => callback({ sessionId: id(), ...event }));
  return { owner, native, onText, onState, load, emit, id };
}
it("partial results replace only this session's appended text and stop finalizes without duplicate words", async () => {
  const f = fixture();
  await f.owner.start("Existing plans", "en-US");
  f.emit("transcript", { text: "Fly" });
  f.emit("transcript", { text: "Fly to Nelson", isFinal: true });
  expect(f.onText.mock.calls.map((call) => call[0])).toEqual([
    "Existing plans Fly",
    "Existing plans Fly to Nelson",
  ]);
  await f.owner.stop();
  expect(f.native.stop).toHaveBeenCalledWith(f.id());
  f.emit("state", { status: "stopped" });
  expect(f.onState).toHaveBeenLastCalledWith({ status: "idle" });
});
it("Cancel restores exact pre-session Unicode text and invalidates all late callbacks", async () => {
  const f = fixture();
  await f.owner.start("东京\n", "zh-CN");
  f.emit("transcript", { text: "京都" });
  f.owner.cancel();
  expect(f.onText).toHaveBeenLastCalledWith("东京\n");
  f.emit("transcript", { text: "Late callback" });
  f.emit("state", { status: "listening" });
  expect(f.onText).toHaveBeenCalledTimes(2);
  expect(f.native.cancel).toHaveBeenCalledWith(f.id());
  expect(f.onState).toHaveBeenLastCalledWith({ status: "idle" });
});
it("close preserves the latest draft text, disposes native audio, and allows a fresh session", async () => {
  const f = fixture();
  await f.owner.start("", "en-US");
  const oldId = f.id();
  f.emit("transcript", { text: "Retained" });
  f.owner.end();
  expect(f.onText).toHaveBeenCalledExactlyOnceWith("Retained");
  await f.owner.start("Retained", "en-US");
  expect(f.id()).not.toBe(oldId);
  f.emit("transcript", { sessionId: oldId, text: "Do not leak" });
  expect(f.onText).toHaveBeenCalledTimes(1);
  f.owner.dispose();
  f.emit("transcript", { text: "Unmounted" });
  expect(f.onText).toHaveBeenCalledTimes(1);
});
it("cancel during lazy loading never starts native recording", async () => {
  const f = fixture();
  let ready!: (value: DictationNative) => void;
  f.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
  );
  const pending = f.owner.start("Keep", "en-US");
  f.owner.cancel();
  ready(f.native);
  await pending;
  expect(f.native.start).not.toHaveBeenCalled();
  expect(f.onText).toHaveBeenLastCalledWith("Keep");
});
it("a pending permission start is canceled exactly and cannot revive a closed session", async () => {
  const f = fixture();
  let ready!: () => void;
  vi.mocked(f.native.start).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
  );
  const pending = f.owner.start("Keep", "en-US");
  await Promise.resolve();
  f.owner.dispose();
  ready();
  await pending;
  f.emit("state", { status: "listening" });
  f.emit("transcript", { text: "Denied late work" });
  expect(f.native.cancel).toHaveBeenCalledWith(f.id());
  expect(f.onText).not.toHaveBeenCalled();
});
it("only one start owns the microphone and an error retains draft with a bounded safe status", async () => {
  const f = fixture();
  await f.owner.start("Keep", "en-US");
  await f.owner.start("Other", "zh-CN");
  expect(f.native.start).toHaveBeenCalledTimes(1);
  f.emit("transcript", { text: "words" });
  f.emit("state", { status: "error", error: "permission" });
  expect(f.onText).toHaveBeenLastCalledWith("Keep words");
  expect(f.onState).toHaveBeenLastCalledWith({ status: "error", error: "permission" });
  f.emit("transcript", { text: "Late" });
  expect(f.onText).toHaveBeenCalledTimes(1);
});
it("missing module and malformed transcript fail without submitting or losing existing text", async () => {
  const f = fixture();
  f.load.mockRejectedValueOnce(new Error("native module absent"));
  await f.owner.start("Existing", "en-US");
  expect(f.onState).toHaveBeenLastCalledWith({ status: "error", error: "unavailable" });
  expect(f.onText).not.toHaveBeenCalled();
  await f.owner.start("Existing", "en-US");
  f.emit("transcript", { text: {} });
  expect(f.onState).toHaveBeenLastCalledWith({ status: "error", error: "failed" });
  expect(f.onText).not.toHaveBeenCalled();
});
