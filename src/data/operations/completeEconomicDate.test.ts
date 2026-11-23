import { beforeEach, expect, it, vi } from "vitest";

import { confirmExpenseEconomicDate } from "./completeEconomicDate";

const deps = vi.hoisted(() => ({
  generation: 4,
  complete: vi.fn(),
  read: vi.fn(),
  sync: vi.fn(),
  preflight: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => deps.generation,
}));
vi.mock("@/data/repositories/defaultLedgerExpenseRepository", () => ({
  getDefaultLedgerExpenseRepository: async () => ({
    completeEconomicDate: deps.complete,
    getExpense: deps.read,
  }),
}));
vi.mock("@/data/sync/ledgerOperationalSync", () => ({
  runLedgerOperationalSync: deps.sync,
}));
vi.mock("@/data/sync/ledgerSettlementCoordinator", () => ({
  preflightSettlementFx: deps.preflight,
}));
vi.mock("@/data/sync/ledgerReportingCoordinator", () => ({
  refreshJourneyLedger: deps.refresh,
}));

const snapshot = { accountGeneration: 4, journeyId: "trip", revision: 3 };

beforeEach(() => {
  vi.resetAllMocks();
  deps.generation = 4;
  deps.complete.mockResolvedValue({ id: "expense", journeyId: "trip" });
});

it("reports the local commit while transport is pending and classifies transport failure separately", async () => {
  let failSync!: (error: Error) => void;
  deps.sync.mockReturnValue(new Promise<void>((_resolve, reject) => { failSync = reject; }));

  const result = await confirmExpenseEconomicDate("expense", "2026-11-24", snapshot);
  expect(deps.complete).toHaveBeenCalledExactlyOnceWith(
    "expense", "2026-11-24", "USER_CONFIRMED_V1", snapshot,
  );
  expect(deps.sync).toHaveBeenCalledOnce();
  expect(deps.read).not.toHaveBeenCalled();

  failSync(new Error("offline"));
  await expect(result.followUp).resolves.toEqual({ state: "SAVED_WAITING" });
  expect(deps.complete).toHaveBeenCalledOnce();
  expect(deps.preflight).not.toHaveBeenCalled();
});

it("ignores an old Account's in-flight sync completion", async () => {
  let finishSync!: () => void;
  deps.sync.mockReturnValue(new Promise<void>(resolve => { finishSync = resolve; }));

  const result = await confirmExpenseEconomicDate("expense", "2026-11-24", snapshot);
  deps.generation += 1;
  finishSync();

  await expect(result.followUp).resolves.toEqual({ state: "SAVED_WAITING" });
  expect(deps.read).not.toHaveBeenCalled();
  expect(deps.preflight).not.toHaveBeenCalled();
  expect(deps.refresh).not.toHaveBeenCalled();
});
