import { readLocalSession } from "@/data/auth/authRepository";
import { adoptLegacyAccountState } from "@/data/auth/accountLocalState";
import { sessionAccessToken } from "@/data/auth/sessionAccessToken";
import { openDatabase } from "@/data/db/database";
import {
  allowLedgerOperationalSync,
  pauseLedgerOperationalSync,
  reactivateLongLivedLedgerFailures,
  runLedgerOperationalSync,
  subscribeLedgerOperationalSyncCompletion,
  type LedgerOperationalSyncCompletion,
} from "@/data/sync/ledgerOperationalSync";
import { getSyncTransportMode } from "@/data/sync/transportSelection";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { getDefaultDataHealthScheduler } from "@/data/health/defaultDataHealthScheduler";
import * as Network from "expo-network";
import { AppState } from "react-native";

import type { FoundationBootstrapDependencies } from "./bootstrapApplication";

export const defaultBootstrapDependencies: FoundationBootstrapDependencies = {
  openDatabase,
  readLocalSession,
  adoptLegacyState: async (userId) =>
    adoptLegacyAccountState(await openDatabase(), userId),
  resumeSync: resumeOperationalSync,
  scheduleHealth: () => scheduleAutomaticDataHealth("COLD_START"),
};

let resuming: Promise<void> | null = null;
let syncPaused = false;
let activeHealthTimer: ReturnType<typeof setInterval> | null = null;
const ACTIVE_HEALTH_INTERVAL_MS = 15 * 60_000;

export function subscribeOperationalSyncLifecycle() {
  let online: boolean | null = null;
  const updateActiveTimer = (active: boolean) => {
    if (activeHealthTimer) clearInterval(activeHealthTimer);
    activeHealthTimer = active
      ? setInterval(
          () => void scheduleAutomaticDataHealth("PERIODIC").catch(() => undefined),
          ACTIVE_HEALTH_INTERVAL_MS,
        )
      : null;
  };
  updateActiveTimer(AppState.currentState === "active");
  void Network.getNetworkStateAsync().then((state) => {
    online = isOnline(state);
  });
  const appState = AppState.addEventListener("change", (state) => {
    const active = state === "active";
    updateActiveTimer(active);
    if (!active) return;
    void resumeOperationalSync().catch(() => undefined);
    void scheduleAutomaticDataHealth("FOREGROUND").catch(() => undefined);
  });
  const network = Network.addNetworkStateListener((state) => {
    const next = isOnline(state);
    const restored = next && online === false;
    online = next;
    if (restored) {
      void resumeOperationalSync().catch(() => undefined);
      void scheduleAutomaticDataHealth("CONNECTIVITY_RESTORED").catch(() => undefined);
    }
  });
  const unsubscribeSync = subscribeLedgerOperationalSyncCompletion((event) => {
    void scheduleAutomaticDataHealth("SYNC_COMPLETED", event.journeyIds, event).catch(
      () => undefined,
    );
  });
  return {
    remove() {
      appState.remove();
      network.remove();
      unsubscribeSync();
      updateActiveTimer(false);
    },
  };
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
  await resumeOperationalSync();
  void scheduleAutomaticDataHealth("AUTH_RECOVERED").catch(() => undefined);
}

async function scheduleAutomaticDataHealth(
  trigger:
    | "COLD_START"
    | "FOREGROUND"
    | "PERIODIC"
    | "CONNECTIVITY_RESTORED"
    | "AUTH_RECOVERED"
    | "SYNC_COMPLETED",
  journeyIds: readonly string[] = [],
  expected?: LedgerOperationalSyncCompletion,
) {
  if (expected) {
    if (expected.generation !== getAccountGeneration()) return;
    const session = await readLocalSession();
    if (session?.identity?.userId !== expected.accountId) return;
  }
  await getDefaultDataHealthScheduler().schedule({ trigger, journeyIds });
}

function isOnline(state: { isConnected?: boolean; isInternetReachable?: boolean }) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

async function refreshThenSync() {
  const session = await readLocalSession();
  if (getSyncTransportMode() === "dev" && session?.refreshToken)
    await sessionAccessToken();
  await runLedgerOperationalSync();
}
