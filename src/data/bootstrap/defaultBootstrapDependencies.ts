import { readLocalSession } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { runLedgerOperationalSync } from "@/data/sync/ledgerOperationalSync";
import { AppState } from "react-native";

import type { FoundationBootstrapDependencies } from "./bootstrapApplication";

export const defaultBootstrapDependencies: FoundationBootstrapDependencies = {
  openDatabase,
  readLocalSession,
  resumeSync: runLedgerOperationalSync,
};

export function subscribeOperationalSyncLifecycle() {
  return AppState.addEventListener("change", (state) => {
    if (state === "active") void runLedgerOperationalSync();
  });
}
