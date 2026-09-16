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

/* eslint-disable import/first */
import { runLedgerExpenseSync } from "./ledgerExpenseDemoCoordinator";
import {
  allowLedgerOperationalSync,
  kickLedgerOperationalSync,
  pauseLedgerOperationalSync,
  runLedgerOperationalSync,
} from "./ledgerOperationalSync";
/* eslint-enable import/first */

describe("Ledger mutation sync kick", () => {
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
