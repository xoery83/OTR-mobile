import { openDatabase } from "@/data/db/database";
import {
  cleanupReconstructibleLedgerData,
  enforceReceiptCacheLimit,
} from "@/data/operations/ledgerMaintenance";

import { runLedgerExpenseSync } from "./ledgerExpenseDemoCoordinator";
import { runLedgerReceiptSync } from "./ledgerReceiptCoordinator";
import { runLedgerReviewSync } from "./ledgerReviewCoordinator";
import { runLedgerSettlementPaymentSync } from "./ledgerSettlementPaymentCoordinator";
import { runLedgerPersonalPaymentSync } from "./ledgerPersonalPaymentCoordinator";

let running: Promise<void> | null = null;
let paused = false;

export function runLedgerOperationalSync() {
  if (paused) return Promise.resolve();
  if (!running) {
    running = Promise.resolve(runLedgerPersonalPaymentSync())
      .catch(() => undefined)
      .then(() =>
        Promise.allSettled([
          runLedgerExpenseSync(),
          runLedgerReceiptSync(),
          runLedgerSettlementPaymentSync(),
          runLedgerReviewSync(),
        ]),
      )
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

export async function pauseLedgerOperationalSync() {
  paused = true;
  await running;
}

export function allowLedgerOperationalSync() {
  paused = false;
}

export function kickLedgerOperationalSync(
  run: () => Promise<unknown> = runLedgerOperationalSync,
) {
  void run().catch(() => undefined);
}
