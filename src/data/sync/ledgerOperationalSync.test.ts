import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/db/database", () => ({ openDatabase: vi.fn() }));
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

// eslint-disable-next-line import/first
import { kickLedgerOperationalSync } from "./ledgerOperationalSync";

describe("Ledger mutation sync kick", () => {
  it("starts asynchronously and harmlessly absorbs an offline failure", async () => {
    const run = vi.fn().mockRejectedValue(new Error("offline"));
    expect(kickLedgerOperationalSync(run)).toBeUndefined();
    expect(run).toHaveBeenCalledOnce();
    await Promise.resolve();
  });
});
