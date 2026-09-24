import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openDatabase: vi.fn(),
  reactivateOperations: vi.fn(),
  reactivateAssets: vi.fn(),
}));

vi.mock("@/data/db/database", () => ({ openDatabase: mocks.openDatabase }));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
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
} from "./ledgerOperationalSync";
/* eslint-enable import/first */

describe("Ledger mutation sync kick", () => {
  it("reactivates sparse user and asset mutations on a recovery event", async () => {
    mocks.openDatabase.mockResolvedValue({});
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

  it("blocks direct mutation kicks during an account transition", async () => {
    vi.mocked(runLedgerExpenseSync).mockClear();
    await pauseLedgerOperationalSync();
    await runLedgerOperationalSync();
    expect(runLedgerExpenseSync).not.toHaveBeenCalled();

    allowLedgerOperationalSync();
    await runLedgerOperationalSync();
    expect(runLedgerExpenseSync).toHaveBeenCalledOnce();
  });
});
