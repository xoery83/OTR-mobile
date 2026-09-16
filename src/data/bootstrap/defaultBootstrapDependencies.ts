import { readLocalSession } from "@/data/auth/authRepository";
import { adoptLegacyAccountState } from "@/data/auth/accountLocalState";
import { revalidateStoredSupabaseDevSession } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import {
  allowLedgerOperationalSync,
  pauseLedgerOperationalSync,
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

export function restartOperationalSync() {
  allowLedgerOperationalSync();
  syncPaused = false;
  return resumeOperationalSync();
}

async function refreshThenSync() {
  const session = await readLocalSession();
  const expired =
    !session?.accessToken ||
    !session.expiresAt ||
    Date.parse(session.expiresAt) <= Date.now();
  if (getSyncTransportMode() === "dev" && session?.refreshToken && expired)
    await revalidateStoredSupabaseDevSession();
  await runLedgerOperationalSync();
}
