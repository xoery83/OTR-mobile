import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { resolveReceiptFile } from "@/data/files/receiptFileStore";
import { runLedgerOperationalSync } from "@/data/sync/ledgerOperationalSync";
import { refreshJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";

import { createDataHealthCoordinator } from "./dataHealthCoordinator";

export async function getDefaultDataHealthCoordinator() {
  return createDataHealthCoordinator({
    database: await openDatabase(),
    getActiveAccountId: requireActiveUserId,
    getAccountGeneration,
    runOperationalSync: runLedgerOperationalSync,
    refreshJourneyLedger,
    fileExists: async (uri) => {
      try {
        return resolveReceiptFile(uri).exists;
      } catch {
        return null;
      }
    },
  });
}
