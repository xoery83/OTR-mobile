import { openDatabase } from "@/data/db/database";
import {
  cleanupReconstructibleLedgerData,
  enforceReceiptCacheLimit,
} from "@/data/operations/ledgerMaintenance";

import { runLedgerExpenseSync } from "./ledgerExpenseDemoCoordinator";
import { runLedgerReceiptSync } from "./ledgerReceiptCoordinator";
import { runLedgerReviewSync } from "./ledgerReviewCoordinator";
import { runLedgerSettlementPaymentSync } from "./ledgerSettlementPaymentCoordinator";

let running: Promise<void> | null = null;

export function runLedgerOperationalSync() {
  if (!running) {
    running = Promise.allSettled([
      runLedgerExpenseSync(),
      runLedgerReceiptSync(),
      runLedgerSettlementPaymentSync(),
      runLedgerReviewSync(),
    ])
      .then(async () => {
        try {
          const database = await openDatabase();
          await cleanupReconstructibleLedgerData(
            database,
            new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString(),
          );
          await enforceReceiptCacheLimit(database, 250 * 1024 * 1024);
        } catch {
          // Maintenance is best-effort and must never block cached startup or sync.
        }
      })
      .then(() => undefined)
      .finally(() => {
        running = null;
      });
  }
  return running;
}
