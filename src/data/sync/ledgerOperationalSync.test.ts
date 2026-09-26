import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openDatabase: vi.fn(),
  reactivateOperations: vi.fn(),
  reactivateAssets: vi.fn(),
  requireActiveUserId: vi.fn(),
  getAllAsync: vi.fn(),
}));

vi.mock("@/data/db/database", () => ({ openDatabase: mocks.openDatabase }));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: mocks.requireActiveUserId,
}));
vi.mock("@/data/auth/accountGeneration", () => ({ getAccountGeneration: () => 7 }));
vi.mock("@/data/repositories/ledgerReceiptRepository", () => ({
  createLedgerReceiptRepository: () => ({
    reactivateLongLivedFailures: mocks.reactivateAssets,
  }),
}));
vi.mock("./syncOperationRepository", () => ({
  createSyncOperationRepository: () => ({
    reactivateLongLivedFailures: mocks.reactivateOperations,
  }),
}));
vi.mock("@/data/operations/ledgerMaintenance", () => ({
  cleanupReconstructibleLedgerData: vi.fn(),
  enforceReceiptCacheLimit: vi.fn(),
}));
vi.mock("./ledgerExpenseDemoCoordinator", () => ({ runLedgerExpenseSync: vi.fn() }));
vi.mock("./ledgerReceiptCoordinator", () => ({ runLedgerReceiptSync: vi.fn() }));
vi.mock("./ledgerReviewCoordinator", () => ({ runLedgerReviewSync: vi.fn() }));
vi.mock("./ledgerSettlementPaymentCoordinator", () => ({
  runLedgerSettlementPaymentSync: vi.fn(),
}));
vi.mock("./ledgerPersonalPaymentCoordinator", () => ({
  runLedgerPersonalPaymentSync: vi.fn(),
}));
vi.mock("./personalSettlementReviewCoordinator", () => ({
  runPersonalSettlementReviewSync: vi.fn(),
}));

/* eslint-disable import/first */
import { runLedgerExpenseSync } from "./ledgerExpenseDemoCoordinator";
import {
  allowLedgerOperationalSync,
  kickLedgerOperationalSync,
  pauseLedgerOperationalSync,
  reactivateLongLivedLedgerFailures,
  runLedgerOperationalSync,
  subscribeLedgerOperationalSyncCompletion,
  subscribeLedgerOperationalSyncKick,
} from "./ledgerOperationalSync";
/* eslint-enable import/first */

describe("Ledger mutation sync kick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowLedgerOperationalSync();
    mocks.openDatabase.mockResolvedValue({ getAllAsync: mocks.getAllAsync });
    mocks.requireActiveUserId.mockResolvedValue("user-a");
    mocks.getAllAsync.mockResolvedValue([]);
  });

  it("reactivates sparse user and asset mutations on a recovery event", async () => {
    await reactivateLongLivedLedgerFailures();
    expect(mocks.reactivateOperations).toHaveBeenCalledOnce();
    expect(mocks.reactivateAssets).toHaveBeenCalledOnce();
  });

  it("starts asynchronously and harmlessly absorbs an offline failure", async () => {
    const run = vi.fn().mockRejectedValue(new Error("offline"));
    expect(kickLedgerOperationalSync(run)).toBeUndefined();
    expect(run).toHaveBeenCalledOnce();
    await Promise.resolve();
  });

  it("announces mutation kicks once with the active account generation", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLedgerOperationalSyncKick(listener);
    kickLedgerOperationalSync(async () => undefined);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(7);
    unsubscribe();
    kickLedgerOperationalSync(async () => undefined);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("blocks direct mutation kicks during an account transition", async () => {
    vi.mocked(runLedgerExpenseSync).mockClear();
    await pauseLedgerOperationalSync();
    await runLedgerOperationalSync();
    expect(runLedgerExpenseSync).not.toHaveBeenCalled();

    allowLedgerOperationalSync();
    await runLedgerOperationalSync();
    expect(runLedgerExpenseSync).toHaveBeenCalledOnce();
  });

  it("publishes the eligible touched scopes after normal sync", async () => {
    mocks.getAllAsync.mockResolvedValue([{ journeyId: "journey-a" }]);
    const listener = vi.fn();
    const unsubscribe = subscribeLedgerOperationalSyncCompletion(listener);

    await runLedgerOperationalSync();

    expect(listener).toHaveBeenCalledWith({
      accountId: "user-a",
      generation: 7,
      journeyIds: ["journey-a"],
    });
    unsubscribe();
  });

  it("does not recurse from a health-origin operational sync", async () => {
    mocks.getAllAsync.mockResolvedValue([{ journeyId: "journey-a" }]);
    const listener = vi.fn();
    const unsubscribe = subscribeLedgerOperationalSyncCompletion(listener);

    await runLedgerOperationalSync({ origin: "DATA_HEALTH" });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
