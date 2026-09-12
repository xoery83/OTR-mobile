import { readLocalSession } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { runLedgerSettlementPaymentSync } from "@/data/sync/ledgerSettlementPaymentCoordinator";

import type { FoundationBootstrapDependencies } from "./bootstrapApplication";

export const defaultBootstrapDependencies: FoundationBootstrapDependencies = {
  openDatabase,
  readLocalSession,
  resumeSync: runLedgerSettlementPaymentSync,
};
