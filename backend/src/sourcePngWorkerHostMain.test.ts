import { EventEmitter } from "node:events";
import type { Server } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runSourcePngWorkerHostMain } from "./sourcePngWorkerHostMain";
import type { startSourcePngWorkerHost } from "./sourcePngWorkerHost";

afterEach(() => vi.useRealTimers());
function fixture() {
  const signals = new EventEmitter();
  const runtime = Object.assign(signals, {
    platform: "linux",
    arch: "x64",
    getuid: () => 0,
    exit: vi.fn(),
  });
  let closed: ((error?: Error) => void) | undefined;
  const close = vi.fn((callback?: (error?: Error) => void) => {
    closed = callback;
  });
  const start = vi.fn(async () => ({ close }) as unknown as Server);
  return {
    runtime: runtime as unknown as Parameters<typeof runSourcePngWorkerHostMain>[0],
    signals,
    exit: runtime.exit,
    close,
    finish: (error?: Error) => closed?.(error),
    start: start as unknown as typeof startSourcePngWorkerHost,
    startSpy: start,
  };
}
it("uses only the fixed private directory/root owner/socket group", async () => {
  const f = fixture();
  await runSourcePngWorkerHostMain(f.runtime, f.start);
  expect(f.startSpy).toHaveBeenCalledExactlyOnceWith({
    directory: "/run/otr/universal-png-worker",
    ownerUid: 0,
    socketGid: 999,
  });
});
it.each([
  { platform: "darwin" },
  { arch: "arm64" },
  { getuid: () => 501 },
  { getuid: undefined },
])("rejects unsupported Host identity before opening a socket: %j", async (change) => {
  const f = fixture();
  Object.assign(f.runtime!, change);
  await expect(runSourcePngWorkerHostMain(f.runtime, f.start)).rejects.toThrow(
    "PNG_WORKER_HOST_IDENTITY_REQUIRED",
  );
  expect(f.startSpy).not.toHaveBeenCalled();
});
it("SIGTERM stops acceptance once and exits cleanly after connections finish", async () => {
  vi.useFakeTimers();
  const f = fixture();
  await runSourcePngWorkerHostMain(f.runtime, f.start);
  f.signals.emit("SIGTERM");
  f.signals.emit("SIGINT");
  expect(f.close).toHaveBeenCalledTimes(1);
  expect(f.exit).not.toHaveBeenCalled();
  f.finish();
  await vi.advanceTimersByTimeAsync(5000);
  expect(f.exit).toHaveBeenCalledExactlyOnceWith(0);
});
it("a stuck active connection exits within five seconds and retains its marker", async () => {
  vi.useFakeTimers();
  const root = await mkdtemp(join(tmpdir(), "otr-png-entry-"));
  const marker = join(root, "active-worker");
  await writeFile(marker, "synthetic retained lease");
  try {
    const f = fixture();
    await runSourcePngWorkerHostMain(f.runtime, f.start);
    f.signals.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(4999);
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(await readFile(marker, "utf8")).toBe("synthetic retained lease");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("close errors exit unsuccessfully without waiting indefinitely", async () => {
  vi.useFakeTimers();
  const f = fixture();
  await runSourcePngWorkerHostMain(f.runtime, f.start);
  f.signals.emit("SIGTERM");
  f.finish(Error("synthetic close failure"));
  await vi.advanceTimersByTimeAsync(5000);
  expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
});
