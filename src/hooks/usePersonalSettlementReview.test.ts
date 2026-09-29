import { beforeEach, expect, it, vi } from "vitest";
import { usePersonalSettlementReview } from "./usePersonalSettlementReview";

// Reuse the screen hook/event harness pattern; no renderer dependency.
const ui = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  focus: null as null | (() => (() => void) | void),
  cleanup: null as null | (() => void),
  get: vi.fn(),
  checkpoint: vi.fn(),
  refresh: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = ui.cursor++;
    if (!(index in ui.slots)) ui.slots[index] = initial;
    return [
      ui.slots[index],
      (value: unknown) => {
        ui.slots[index] = value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = ui.cursor++;
    ui.slots[index] ??= { current: initial };
    return ui.slots[index];
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
  useFocusEffect(callback: () => (() => void) | void) {
    if (ui.focus !== callback) {
      ui.cleanup?.();
      ui.focus = callback;
      ui.cleanup = callback() ?? null;
    }
  },
}));
vi.mock("@/data/repositories/defaultPersonalSettlementReviewRepository", () => ({
  getDefaultPersonalSettlementReviewRepository: async () => ({
    get: ui.get,
    checkpoint: ui.checkpoint,
  }),
}));
vi.mock("@/data/sync/personalSettlementReviewCoordinator", () => ({
  refreshPersonalSettlementReview: ui.refresh,
  runPersonalSettlementReviewSync: ui.sync,
}));
const statement = (id: string) => ({
  statement: { journeyId: "j", settlementId: id },
  statementFingerprint: `fingerprint-${id}`,
});
function useRender(head?: string) {
  // Event harness starts a render; production hooks never mutate these slots.
  // eslint-disable-next-line react-hooks/immutability
  ui.cursor = 0;
  return usePersonalSettlementReview("j", head);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  ui.cleanup?.();
  ui.slots = [];
  ui.cursor = 0;
  ui.focus = null;
  ui.cleanup = null;
  vi.resetAllMocks();
  ui.sync.mockResolvedValue(undefined);
});

it("reloads after a new confirmed head, blocks the old statement and ignores a late old read", async () => {
  const oldRead = deferred(),
    newRead = deferred();
  ui.get.mockResolvedValue(statement("old"));
  ui.refresh
    .mockReturnValueOnce(oldRead.promise)
    .mockReturnValueOnce(newRead.promise)
    .mockResolvedValue(undefined);
  useRender("old");
  await vi.waitFor(() => expect(ui.refresh).toHaveBeenCalledTimes(1));
  expect(useRender("old").ready).toBe(false);
  useRender("new");
  await vi.waitFor(() => expect(ui.refresh).toHaveBeenCalledTimes(2));
  await useRender("new").looksGood();
  expect(ui.checkpoint).not.toHaveBeenCalled();
  ui.get.mockResolvedValue(statement("new"));
  newRead.resolve();
  await vi.waitFor(() => expect(useRender("new").ready).toBe(true));
  ui.get.mockResolvedValue(statement("old"));
  oldRead.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(useRender("new").state?.statement.settlementId).toBe("new");
  ui.get.mockResolvedValue(statement("new"));
  await useRender("new").looksGood();
  expect(ui.checkpoint).toHaveBeenCalledWith("j", "LOOKS_GOOD", "fingerprint-new");
});

it("keeps offline review available for the matching head but cannot review a different head", async () => {
  ui.get.mockResolvedValue(statement("old"));
  ui.refresh.mockRejectedValue(new Error("offline"));
  useRender("old");
  await vi.waitFor(() => expect(useRender("old").ready).toBe(true));
  expect(useRender("old").source).toBe("CURRENT_CACHED");
  await useRender("old").looksGood();
  expect(ui.checkpoint).toHaveBeenCalledWith("j", "LOOKS_GOOD", "fingerprint-old");
  ui.checkpoint.mockClear();
  useRender("new");
  await vi.waitFor(() => expect(ui.refresh).toHaveBeenCalledTimes(3));
  expect(useRender("new").ready).toBe(false);
  await useRender("new").looksGood();
  expect(ui.checkpoint).not.toHaveBeenCalled();
});
