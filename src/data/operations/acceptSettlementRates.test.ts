import {
  acceptSettlementRates,
  readSettlementRateResults,
  type SettlementRateAcceptance,
} from "./acceptSettlementRates";
import { ApiClientError } from "@/data/api/client";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  generation: 1,
  getExpense: vi.fn(),
  applyValuation: vi.fn(),
  getOperationResult: vi.fn(),
  listRateQuotes: vi.fn(),
  listJourneys: vi.fn(),
  list: vi.fn(),
  sync: vi.fn(),
  reconcile: vi.fn(),
  refresh: vi.fn(),
  estimate: vi.fn(),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => mocks.generation,
}));
vi.mock("@/data/repositories/defaultLedgerExpenseRepository", () => ({
  getDefaultLedgerExpenseRepository: async () => mocks,
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: async () => mocks,
}));
vi.mock("@/data/repositories/defaultLedgerFxSnapshotRepository", () => ({
  getDefaultLedgerFxSnapshotRepository: async () => mocks,
}));
vi.mock("@/data/sync/ledgerOperationalSync", () => ({
  runLedgerOperationalSync: mocks.sync,
}));
vi.mock("@/data/sync/ledgerReportingCoordinator", () => ({
  revalidateJourneyLedger: mocks.reconcile,
}));
vi.mock("@/data/sync/ledgerFxSnapshotCoordinator", () => ({
  refreshLedgerFxSnapshotCache: mocks.refresh,
}));
vi.mock("./referenceRateEstimate", () => ({
  displayEstimate: mocks.estimate,
  snapshotDisplayEstimate: mocks.estimate,
}));
const item: SettlementRateAcceptance = {
  expenseId: "e",
  journeyId: "j",
  revision: 2,
  serverRevision: 1,
  economicDate: "2026-09-28",
  title: "JPY",
  original: { minor: 1000, currency: "JPY", scale: 0 },
  settlement: { minor: 1119, currency: "NZD", scale: 2 },
  decimalRate: "0.01119",
  referenceDate: "2026-09-25",
};
const current = {
  id: "e",
  journeyId: "j",
  revision: 2,
  serverRevision: 1,
  original: item.original,
  economicDate: item.economicDate,
  status: "RATE_REQUIRED",
  valuation: null,
  syncStatus: "SYNCED",
  settlementParticipation: "INCLUDED",
};
const operation = { operationId: "op", state: "PENDING_SYNC" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.generation = 1;
  mocks.sync.mockResolvedValue(undefined);
  mocks.getExpense.mockResolvedValue(current);
  mocks.listJourneys.mockResolvedValue([
    { journeyId: "j", settlementCurrency: "NZD", settlementScale: 2 },
  ]);
  mocks.listRateQuotes.mockResolvedValue([]);
  mocks.list.mockResolvedValue(null);
  mocks.estimate.mockReturnValue({
    money: item.settlement,
    decimalRate: item.decimalRate,
  });
  mocks.applyValuation.mockResolvedValue({ operationResult: operation });
  mocks.getOperationResult.mockResolvedValue(operation);
});
it("reconciles and binds the exact shown business inputs before saving; a sync cycle is not confirmation", async () => {
  const { results } = await acceptSettlementRates([item]);
  expect(mocks.reconcile).toHaveBeenCalledWith("j");
  expect(mocks.refresh).toHaveBeenCalledWith(true);
  expect(mocks.applyValuation).toHaveBeenCalledWith(
    "e",
    expect.objectContaining({
      policy: "MANUAL_AGREED",
      manualRate: item.decimalRate,
      expectedRevision: 2,
      expectedSettlement: item.settlement,
      rateAcceptance: {
        revision: 2,
        serverRevision: 1,
        economicDate: item.economicDate,
        original: item.original,
        settlement: item.settlement,
        decimalRate: item.decimalRate,
        referenceDate: item.referenceDate,
      },
    }),
  );
  expect(results[0]?.state).toBe("PENDING_SYNC");
});
it("accepts compatible authoritative reference value after checking all inputs, not blind revision retry", async () => {
  mocks.getExpense.mockResolvedValue({
    ...current,
    revision: 3,
    status: "ACCEPTED",
    valuation: {
      policy: "REFERENCE_RATE",
      referenceEvidence: { automatic: true },
      original: item.original,
      settlement: item.settlement,
      decimalRate: "0.0111900",
    },
  });
  const { results } = await acceptSettlementRates([item]);
  expect(results[0]?.state).toBe("PENDING_SYNC");
  expect(mocks.applyValuation.mock.calls[0]?.[1].expectedRevision).toBe(3);
});
for (const [name, patch] of Object.entries({
  amount: { original: { ...item.original, minor: 1001 } },
  currency: { original: { ...item.original, currency: "ISK" } },
  date: { economicDate: "2026-09-27" },
  deletion: { status: "DELETED" },
}))
  it(`invalidates stale ${name} without any command`, async () => {
    mocks.getExpense.mockResolvedValue({ ...current, ...patch });
    expect((await acceptSettlementRates([item])).results[0]?.state).toBe(
      "CONFLICT_REQUIRES_ACTION",
    );
    expect(mocks.applyValuation).not.toHaveBeenCalled();
  });
it("invalidates Journey currency and rate drift including equal rounded money", async () => {
  mocks.listJourneys.mockResolvedValue([
    { journeyId: "j", settlementCurrency: "USD", settlementScale: 2 },
  ]);
  expect((await acceptSettlementRates([item])).results[0]?.state).toBe(
    "CONFLICT_REQUIRES_ACTION",
  );
  mocks.listJourneys.mockResolvedValue([
    { journeyId: "j", settlementCurrency: "NZD", settlementScale: 2 },
  ]);
  mocks.estimate.mockReturnValue({ money: item.settlement, decimalRate: "0.0111901" });
  expect((await acceptSettlementRates([item])).results[0]?.state).toBe(
    "CONFLICT_REQUIRES_ACTION",
  );
  expect(mocks.applyValuation).not.toHaveBeenCalled();
});
it("persists an offline choice and observes its actual result on reconnect", async () => {
  mocks.reconcile.mockRejectedValue(new ApiClientError("offline", "network"));
  const batch = await acceptSettlementRates([item]);
  expect(batch.results[0]?.state).toBe("PENDING_SYNC");
  mocks.getOperationResult.mockResolvedValue({
    ...operation,
    state: "SERVER_CONFIRMED",
    disposition: "APPLIED",
  });
  expect((await readSettlementRateResults(batch.results))[0]?.state).toBe(
    "SERVER_CONFIRMED",
  );
  expect(mocks.applyValuation).toHaveBeenCalledOnce();
});
it("returns partial per-operation confirmation/conflict/retryable/terminal without stopping the batch", async () => {
  mocks.applyValuation
    .mockResolvedValueOnce({
      operationResult: { operationId: "1", state: "PENDING_SYNC" },
    })
    .mockRejectedValueOnce(new Error("changed"))
    .mockResolvedValueOnce({
      operationResult: { operationId: "3", state: "PENDING_SYNC" },
    })
    .mockResolvedValueOnce({
      operationResult: { operationId: "4", state: "PENDING_SYNC" },
    });
  mocks.getOperationResult.mockImplementation(async (id) => ({
    operationId: id,
    state:
      id === "1"
        ? "SERVER_CONFIRMED"
        : id === "3"
          ? "RETRYABLE_FAILURE"
          : "TERMINAL_FAILURE",
  }));
  const batch = await acceptSettlementRates(
    Array.from({ length: 4 }, (_, i) => ({ ...item, expenseId: String(i) })),
  );
  expect(batch.results.map((r) => r.state)).toEqual([
    "SERVER_CONFIRMED",
    "CONFLICT_REQUIRES_ACTION",
    "RETRYABLE_FAILURE",
    "TERMINAL_FAILURE",
  ]);
});
it("does not mutate on permission or failed fresh check, and stops across account changes", async () => {
  mocks.reconcile.mockRejectedValue(new ApiClientError("forbidden", "http", 403));
  expect((await acceptSettlementRates([item])).results[0]?.state).toBe(
    "TERMINAL_FAILURE",
  );
  expect(mocks.applyValuation).not.toHaveBeenCalled();
  mocks.reconcile.mockImplementation(async () => {
    mocks.generation++;
  });
  await expect(acceptSettlementRates([item])).rejects.toThrow("Account changed");
});
it("does not replace an already valid agreed value or accept a different policy/value", async () => {
  mocks.getExpense.mockResolvedValue({
    ...current,
    valuation: {
      policy: "MANUAL_AGREED",
      decimalRate: item.decimalRate,
      settlement: item.settlement,
    },
  });
  expect((await acceptSettlementRates([item])).results[0]).toMatchObject({
    state: "SERVER_CONFIRMED",
    operationId: null,
    alreadyAgreed: true,
  });
  expect(mocks.applyValuation).not.toHaveBeenCalled();
  mocks.getExpense.mockResolvedValue({
    ...current,
    valuation: {
      policy: "MANUAL_AGREED",
      decimalRate: "0.01",
      settlement: item.settlement,
    },
  });
  expect((await acceptSettlementRates([item])).results[0]?.state).toBe(
    "CONFLICT_REQUIRES_ACTION",
  );
});

it("requires reconfirmation for another explicit valuation choice, even at the same rate", async () => {
  mocks.getExpense.mockResolvedValue({
    ...current,
    revision: 3,
    status: "ACCEPTED",
    valuation: {
      policy: "REFERENCE_RATE",
      referenceEvidence: { automatic: false },
      original: item.original,
      settlement: item.settlement,
      decimalRate: item.decimalRate,
    },
  });
  expect((await acceptSettlementRates([item])).results[0]?.state).toBe(
    "CONFLICT_REQUIRES_ACTION",
  );
  expect(mocks.applyValuation).not.toHaveBeenCalled();
});
