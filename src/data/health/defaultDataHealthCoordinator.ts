import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { resolveReceiptFile } from "@/data/files/receiptFileStore";
import { runLedgerOperationalSync } from "@/data/sync/ledgerOperationalSync";
import {
  refreshJourneyLedger,
  revalidateJourneyLedger,
} from "@/data/sync/ledgerReportingCoordinator";
import { createLedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";

import { createDataHealthCoordinator } from "./dataHealthCoordinator";

let coordinator: ReturnType<typeof createDataHealthCoordinator> | null = null;

export async function getDefaultDataHealthCoordinator() {
  if (coordinator) return coordinator;
  const database = await openDatabase();
  const expenses = createLedgerExpenseRepository(database);
  coordinator = createDataHealthCoordinator({
    database,
    getActiveAccountId: requireActiveUserId,
    getAccountGeneration,
    runOperationalSync: () => runLedgerOperationalSync({ origin: "DATA_HEALTH" }),
    refreshJourneyLedger,
    revalidateJourneyLedger: async (journeyId) => {
      await revalidateJourneyLedger(journeyId);
    },
    getExpense: (id) => expenses.getExpense(id),
    fileExists: async (uri) => {
      try {
        return resolveReceiptFile(uri).exists;
      } catch {
        return null;
      }
    },
  });
  return coordinator;
}
