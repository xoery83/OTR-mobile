import { afterEach, expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import { useFoundationDiagnostics } from "./useFoundationDiagnostics";
import type { FoundationDiagnostics } from "@/data/foundation/foundationDiagnostics";
// Unit hook harness: inspect asynchronous publication/cleanup using React API mocks;
// repository tests independently exercise real Account gate and SQLite reads.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  ref: { current: () => {} },
  focus: null as (() => () => void) | null,
  foreground: null as ((state: string) => void) | null,
  remove: vi.fn(),
  read: vi.fn<() => Promise<FoundationDiagnostics>>(),
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
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (callback: () => () => void) => {
    harness.focus = callback;
  },
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
vi.mock("@/data/foundation/foundationDiagnostics", () => ({
  readFoundationDiagnostics: () => harness.read(),
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

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
vi.mock("@/data/auth/devSupabaseAuth", () => ({ authenticateToSupabaseDev: vi.fn() }));
vi.mock("@/data/auth/defaultAccountSwitchCoordinator", () => ({
  createDefaultAccountSwitchCoordinator: () => ({}),
}));
vi.mock("@/data/sync/transportSelection", () => ({ getSyncTransportMode: () => "dev" }));
const snapshot = (
  pendingSyncCount = 0,
  generation = getAccountGeneration(),
): FoundationDiagnostics => ({
  generation,
  pendingSyncCount,
  dbInitialized: true,
  schemaVersion: 50,
  authState: "OFFLINE_TRUSTED",
  networkState: "offline",
  pendingItineraryCreateCount: 0,
  databaseBytes: 0,
  receiptCacheBytes: 0,
  reviewFindingCount: 0,
});
const FoundationHarness = () => useFoundationDiagnostics();
const readHarness = () => {
  harness.index = 0;
  return FoundationHarness();
};
function pending() {
  let resolve!: (value: FoundationDiagnostics) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<FoundationDiagnostics>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
it("F5 same-generation overlapping refresh accepts only the newest; late failure cannot overwrite", async () => {
  const first = pending(),
    second = pending();
  harness.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  readHarness();
  const cleanup = harness.focus!();
  readHarness().refresh();
  second.resolve(snapshot(0));
  await second.promise;
  await Promise.resolve();
  expect(readHarness().diagnostics?.pendingSyncCount).toBe(0);
  first.resolve(snapshot(9));
  await first.promise;
  await Promise.resolve();
  expect(readHarness().diagnostics?.pendingSyncCount).toBe(0);
  const old = pending(),
    fresh = pending();
  harness.read.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  readHarness().refresh();
  readHarness().refresh();
  fresh.resolve(snapshot(2));
  await fresh.promise;
  await Promise.resolve();
  old.reject(new Error("late"));
  await old.promise.catch(() => {});
  await Promise.resolve();
  expect(readHarness().diagnostics?.pendingSyncCount).toBe(2);
  expect(readHarness().error).toBeNull();
  cleanup();
});
it("F5 blur/unmount clears observations and fences reads, errors, captured refresh and foreground", async () => {
  const work = pending();
  harness.read.mockReturnValue(work.promise);
  const hook = readHarness();
  const cleanup = harness.focus!();
  cleanup();
  hook.refresh();
  harness.foreground?.("active");
  work.resolve(snapshot(17));
  await work.promise;
  await Promise.resolve();
  expect(harness.slots[0]).toBeNull();
  expect(readHarness().diagnostics).toBeNull();
  expect(harness.read).toHaveBeenCalledOnce();
  expect(harness.remove).toHaveBeenCalledOnce();
  const failed = pending();
  harness.read.mockReturnValueOnce(failed.promise);
  readHarness();
  const secondCleanup = harness.focus!();
  secondCleanup();
  failed.reject(new Error("late"));
  await failed.promise.catch(() => {});
  await Promise.resolve();
  expect(readHarness().error).toBeNull();
});
it("F5 A→B→A masks existing observations and rejects the late result before fresh focus", async () => {
  const work = pending(),
    old = snapshot();
  harness.read.mockReturnValueOnce(work.promise);
  readHarness();
  const cleanup = harness.focus!();
  harness.slots[0] = old;
  advanceAccountGeneration();
  advanceAccountGeneration();
  expect(readHarness().diagnostics).toBeNull();
  work.resolve(old);
  await work.promise;
  await Promise.resolve();
  expect(readHarness().diagnostics).toBeNull();
  cleanup();
  harness.read.mockResolvedValueOnce(snapshot(3));
  readHarness();
  const freshCleanup = harness.focus!();
  await vi.waitFor(() => expect(readHarness().diagnostics?.pendingSyncCount).toBe(3));
  freshCleanup();
});
