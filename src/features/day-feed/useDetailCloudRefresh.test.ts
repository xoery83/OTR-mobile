import { useDetailCloudRefresh } from "./useDetailCloudRefresh";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  ref: { current: false },
  generation: 2,
  focus: null as any,
  listener: null as any,
  read: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("react", () => ({ useRef: () => state.ref, useCallback: (fn: any) => fn }));
vi.mock("expo-router", () => ({
  useFocusEffect: (fn: any) => {
    state.focus = fn;
  },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
}));
vi.mock("@/data/auth/authRepository", () => ({ readCommittedLocalSession: state.read }));
vi.mock("@/data/sync/ledgerOperationalSync", () => ({
  subscribeLedgerOperationalSyncCompletion: (fn: any) => {
    state.listener = fn;
    return state.stop;
  },
}));
const event = { accountId: "A", generation: 2, journeyIds: ["trip"] };
beforeEach(() => {
  vi.clearAllMocks();
  state.ref.current = false;
  state.generation = 2;
  state.read.mockResolvedValue({ identity: { userId: "A" } });
});
it("refreshes the focused owning reader after accepted completion, never performs a write", async () => {
  const invalidate = vi.fn();
  useDetailCloudRefresh("trip", 2, false, invalidate);
  const close = state.focus();
  state.listener(event);
  await Promise.resolve();
  expect(invalidate).toHaveBeenCalledOnce();
  expect(invalidate.mock.calls[0][0](7)).toBe(8);
  close();
  expect(state.stop).toHaveBeenCalledOnce();
});
it.each(["other-account", "other-trip", "old-generation", "closed", "read-failed"])(
  "withholds %s completion",
  async (kind) => {
    const invalidate = vi.fn();
    useDetailCloudRefresh("trip", 2, false, invalidate);
    const close = state.focus();
    if (kind === "closed") close();
    if (kind === "read-failed") state.read.mockRejectedValue(Error("unavailable"));
    state.listener({
      ...event,
      ...(kind === "other-account" ? { accountId: "B" } : {}),
      ...(kind === "other-trip" ? { journeyIds: ["other"] } : {}),
      ...(kind === "old-generation" ? { generation: 1 } : {}),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(invalidate).not.toHaveBeenCalled();
  },
);
it("preserves an open editor and rereads when it closes, including Cancel", async () => {
  const invalidate = vi.fn();
  useDetailCloudRefresh("trip", 2, true, invalidate);
  const close = state.focus();
  state.listener(event);
  await Promise.resolve();
  expect(state.read).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  close();
  useDetailCloudRefresh("trip", 2, false, invalidate);
  state.focus();
  expect(invalidate).toHaveBeenCalledOnce();
});
it("fences a late session read after Account generation changes", async () => {
  let resolve!: (value: unknown) => void;
  state.read.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const invalidate = vi.fn();
  useDetailCloudRefresh("trip", 2, false, invalidate);
  state.focus();
  state.listener(event);
  state.generation = 3;
  resolve({ identity: { userId: "A" } });
  await Promise.resolve();
  expect(invalidate).not.toHaveBeenCalled();
});
