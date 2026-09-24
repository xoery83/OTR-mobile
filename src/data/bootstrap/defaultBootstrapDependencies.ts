import { readLocalSession } from "@/data/auth/authRepository";
import { adoptLegacyAccountState } from "@/data/auth/accountLocalState";
import { sessionAccessToken } from "@/data/auth/sessionAccessToken";
import { openDatabase } from "@/data/db/database";
import {
  allowLedgerOperationalSync,
  pauseLedgerOperationalSync,
  reactivateLongLivedLedgerFailures,
  runLedgerOperationalSync,
} from "@/data/sync/ledgerOperationalSync";
import { getSyncTransportMode } from "@/data/sync/transportSelection";
import { AppState } from "react-native";

import type { FoundationBootstrapDependencies } from "./bootstrapApplication";

export const defaultBootstrapDependencies: FoundationBootstrapDependencies = {
  openDatabase,
  readLocalSession,
  adoptLegacyState: async (userId) =>
    adoptLegacyAccountState(await openDatabase(), userId),
  resumeSync: resumeOperationalSync,
};

let resuming: Promise<void> | null = null;
let syncPaused = false;

export function subscribeOperationalSyncLifecycle() {
  return AppState.addEventListener("change", (state) => {
    if (state === "active") void resumeOperationalSync().catch(() => undefined);
  });
}

export function resumeOperationalSync() {
  if (syncPaused) return Promise.resolve();
  if (resuming) return resuming;
  resuming = refreshThenSync().finally(() => {
    resuming = null;
  });
  return resuming;
}

export async function pauseOperationalSync() {
  syncPaused = true;
  await Promise.all([resuming, pauseLedgerOperationalSync()]);
}

export async function restartOperationalSync() {
  allowLedgerOperationalSync();
  syncPaused = false;
  await reactivateLongLivedLedgerFailures();
  return resumeOperationalSync();
}

async function refreshThenSync() {
  const session = await readLocalSession();
  if (getSyncTransportMode() === "dev" && session?.refreshToken)
    await sessionAccessToken();
  await runLedgerOperationalSync();
}
