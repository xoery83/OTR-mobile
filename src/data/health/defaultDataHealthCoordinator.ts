import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { resolveReceiptFile } from "@/data/files/receiptFileStore";
import { runLedgerOperationalSync } from "@/data/sync/ledgerOperationalSync";
import { refreshJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";

import { createDataHealthCoordinator } from "./dataHealthCoordinator";

let coordinator: ReturnType<typeof createDataHealthCoordinator> | null = null;

export async function getDefaultDataHealthCoordinator() {
  if (coordinator) return coordinator;
  coordinator = createDataHealthCoordinator({
    database: await openDatabase(),
    getActiveAccountId: requireActiveUserId,
    getAccountGeneration,
    runOperationalSync: () => runLedgerOperationalSync({ origin: "DATA_HEALTH" }),
    refreshJourneyLedger,
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
