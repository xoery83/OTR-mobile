import { afterEach, expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import { useLocalOperations } from "./useLocalOperations";
import type { LocalOperationsSnapshot } from "@/data/operations/localOperations";
// Unit hook harness: inspect asynchronous publication/cleanup using React API mocks;
// repository tests independently exercise real Account gate and SQLite reads.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  ref: { current: () => {} },
  focus: null as (() => () => void) | null,
  foreground: null as ((state: string) => void) | null,
  remove: vi.fn(),
  read: vi.fn<() => Promise<LocalOperationsSnapshot>>(),
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.index++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [
      harness.slots[index],
      (value: unknown) => {
        harness.slots[index] = value;
      },
    ];
  },
  useRef: () => harness.ref,
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => number) => getSnapshot(),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => () => void) => {
    harness.focus = callback;
  },
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, callback: (state: string) => void) => {
      harness.foreground = callback;
      return { remove: harness.remove };
    },
  },
}));
vi.mock("@/data/operations/localOperations", () => ({
  readDefaultLocalOperations: () => harness.read(),
}));
afterEach(() => {
  harness.slots = [];
  harness.index = 0;
  harness.ref.current = () => {};
  harness.focus = null;
  harness.foreground = null;
  harness.read.mockReset();
  harness.remove.mockReset();
});
const snapshot = (generation = getAccountGeneration()): LocalOperationsSnapshot => ({
  generation,
  observedAt: "2026-10-08T00:00:00.000Z",
  coverage: {
    intake: "UNAVAILABLE",
    semanticReview: "UNAVAILABLE",
    server: "UNAVAILABLE",
    continuation: "AVAILABLE",
    sync: "AVAILABLE",
    dataHealth: "AVAILABLE",
  },
  rows: [],
  dataHealth: null,
});
const Harness = (enabled = true) => useLocalOperations(enabled);
const readHarness = (enabled = true) => {
  harness.index = 0;
  return Harness(enabled);
};
function pending() {
  let resolve!: (value: LocalOperationsSnapshot) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<LocalOperationsSnapshot>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
it("disabled surface cannot read, refresh, subscribe foreground or retain a snapshot", () => {
  readHarness(false);
  const cleanup = harness.focus!();
  readHarness(false).refresh();
  expect(harness.read).not.toHaveBeenCalled();
  expect(harness.foreground).toBeNull();
  expect(readHarness(false).snapshot).toBeNull();
  cleanup();
});
it("A→B→A hides already displayed data immediately and rejects a late old-generation callback", async () => {
  const work = pending();
  const old = snapshot();
  harness.read.mockReturnValueOnce(work.promise);
  readHarness();
  const cleanup = harness.focus!();
  harness.slots[0] = old;
  advanceAccountGeneration();
  advanceAccountGeneration();
  expect(readHarness().snapshot).toBeNull();
  work.resolve(old);
  await work.promise;
  await Promise.resolve();
  expect(readHarness().snapshot).toBeNull();
  cleanup();
  expect(harness.slots[0]).toBeNull();
  const fresh = snapshot();
  harness.read.mockResolvedValueOnce(fresh);
  readHarness();
  const nextCleanup = harness.focus!();
  await vi.waitFor(() => expect(readHarness().snapshot).toEqual(fresh));
  nextCleanup();
});
it("blur/unmount discards memory and a delayed read cannot republish or reread on foreground", async () => {
  const work = pending();
  harness.read.mockReturnValue(work.promise);
  readHarness();
  const cleanup = harness.focus!();
  cleanup();
  harness.foreground!("active");
  readHarness().refresh();
  work.resolve(snapshot());
  await work.promise;
  await Promise.resolve();
  expect(harness.slots[0]).toBeNull();
  expect(harness.read).toHaveBeenCalledOnce();
  expect(harness.remove).toHaveBeenCalledOnce();
});
it("overlapping manual refresh publishes only the latest observation and reads foreground without timers", async () => {
  const first = pending(),
    second = pending();
  harness.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  readHarness();
  const cleanup = harness.focus!();
  readHarness().refresh();
  const newest = snapshot();
  second.resolve(newest);
  await second.promise;
  await Promise.resolve();
  expect(readHarness().snapshot).toEqual(newest);
  first.resolve({ ...snapshot(), observedAt: "2026-01-01T00:00:00.000Z" });
  await first.promise;
  await Promise.resolve();
  expect(readHarness().snapshot).toEqual(newest);
  harness.read.mockResolvedValueOnce(newest);
  harness.foreground!("active");
  await vi.waitFor(() => expect(harness.read).toHaveBeenCalledTimes(3));
  cleanup();
});
