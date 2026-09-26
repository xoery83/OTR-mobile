import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openDatabase: vi.fn(),
  reactivateOperations: vi.fn(),
  reactivateAssets: vi.fn(),
  requireActiveUserId: vi.fn(),
  getAllAsync: vi.fn(),
  getQueueActivity: vi.fn(),
  queueListeners: new Set<() => void>(),
  generation: 7,
}));

vi.mock("./ledgerQueueActivity", () => ({
  getLedgerQueueActivity: mocks.getQueueActivity,
  subscribeLedgerQueueWorkAvailable: (listener: () => void) => {
    mocks.queueListeners.add(listener);
    return () => mocks.queueListeners.delete(listener);
  },
}));

vi.mock("@/data/db/database", () => ({ openDatabase: mocks.openDatabase }));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: mocks.requireActiveUserId,
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => mocks.generation,
}));
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
    mocks.getQueueActivity.mockResolvedValue({
      unresolvedCount: 0,
      actionableNow: 0,
      nextActionableAt: null,
    });
    mocks.generation = 7;
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

  it("wakes a due retry independently of foreground reads", async () => {
    vi.useFakeTimers();
    const due = Date.now() + 4_000;
    mocks.getQueueActivity.mockResolvedValue({
      unresolvedCount: 1,
      actionableNow: 0,
      nextActionableAt: due,
    });
    vi.mocked(runLedgerExpenseSync).mockClear();
    await runLedgerOperationalSync();
    await vi.advanceTimersByTimeAsync(3_999);
    expect(runLedgerExpenseSync).toHaveBeenCalledOnce();
    mocks.getQueueActivity.mockResolvedValue({
      unresolvedCount: 0,
      actionableNow: 0,
      nextActionableAt: null,
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(runLedgerExpenseSync).toHaveBeenCalledTimes(2);
    await pauseLedgerOperationalSync();
    vi.useRealTimers();
  });

  it("does not run an old account's due timer after an account switch", async () => {
    vi.useFakeTimers();
    mocks.getQueueActivity.mockResolvedValue({
      unresolvedCount: 1,
      actionableNow: 0,
      nextActionableAt: Date.now() + 4_000,
    });
    vi.mocked(runLedgerExpenseSync).mockClear();
    await runLedgerOperationalSync();
    mocks.generation = 8;
    await vi.advanceTimersByTimeAsync(4_000);
    expect(runLedgerExpenseSync).toHaveBeenCalledOnce();
    await pauseLedgerOperationalSync();
    vi.useRealTimers();
  });

  it("cancels a future retry timer while auth is paused", async () => {
    vi.useFakeTimers();
    mocks.getQueueActivity.mockResolvedValue({
      unresolvedCount: 1,
      actionableNow: 0,
      nextActionableAt: Date.now() + 4_000,
    });
    vi.mocked(runLedgerExpenseSync).mockClear();
    await runLedgerOperationalSync();
    await pauseLedgerOperationalSync();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(runLedgerExpenseSync).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("coalesces dependency wakeups while operational work is in flight", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    vi.mocked(runLedgerExpenseSync).mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve({ status: "syncing", processedCount: 1 });
      }) as never,
    );
    const first = runLedgerOperationalSync();
    await vi.advanceTimersByTimeAsync(0);
    for (const listener of mocks.queueListeners) {
      listener();
      listener();
    }
    expect(runLedgerExpenseSync).toHaveBeenCalledOnce();
    mocks.getQueueActivity.mockResolvedValue({
      unresolvedCount: 1,
      actionableNow: 1,
      nextActionableAt: null,
    });
    release();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(runLedgerExpenseSync).toHaveBeenCalledTimes(2);
    await pauseLedgerOperationalSync();
    vi.useRealTimers();
  });
});
