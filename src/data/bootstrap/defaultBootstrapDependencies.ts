import { ApiClientError } from "@/data/api/client";
import { readLocalSession, requireActiveUserId } from "@/data/auth/authRepository";
import { adoptLegacyAccountState } from "@/data/auth/accountLocalState";
import {
  captureAccountScope,
  assertAccountRequestContext,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import { chooseJourneyEntry } from "@/domain/ledger/journeyContext";
import { openDatabase } from "@/data/db/database";
import {
  allowLedgerOperationalSync,
  scheduleOperationalReadRetry,
  notifyLedgerReadCompletion,
  pauseLedgerOperationalSync,
  reactivateLongLivedLedgerFailures,
  runLedgerOperationalSync,
  subscribeLedgerOperationalSyncCompletion,
  type LedgerOperationalSyncCompletion,
} from "@/data/sync/ledgerOperationalSync";
import { getSyncTransportMode } from "@/data/sync/transportSelection";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import {
  refreshJourneyLedgerWithStatus,
  refreshMyLedger,
} from "@/data/sync/ledgerReportingCoordinator";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { getDefaultDataHealthScheduler } from "@/data/health/defaultDataHealthScheduler";
import * as Network from "expo-network";
import { AppState } from "react-native";

import type { LocalSession } from "@/domain/auth/localSession";
import type { FoundationBootstrapDependencies } from "./bootstrapApplication";

export const defaultBootstrapDependencies: FoundationBootstrapDependencies = {
  openDatabase,
  readLocalSession,
  adoptLegacyState: async (userId) =>
    adoptLegacyAccountState(await openDatabase(), userId),
  resumeSync: resumeOperationalSync,
  scheduleHealth: () => scheduleAutomaticDataHealth("COLD_START"),
};

let resuming: { generation: number; promise: Promise<void> } | null = null;
let discovery: { generation: number; complete: boolean; failures: number } | null = null;
let syncOnline = true;
let syncActive = AppState.currentState === "active";

export async function bootstrapActivatedAccount(session: LocalSession | null) {
  // Reload the installed Account's cache independently of remote availability.
  if (session?.identity?.userId) {
    void captureAccountScope(requireActiveUserId)
      .then((context) => {
        if (context.accountId === session.identity?.userId)
          notifyLedgerReadCompletion({
            ...context,
            journeyIds: [],
            discoveryChanged: true,
          });
      })
      .catch(() => undefined);
  }
  if (!syncPaused) void resumeOperationalSync().catch(() => undefined);
}
let syncPaused = false;
let activeHealthTimer: ReturnType<typeof setInterval> | null = null;
const ACTIVE_HEALTH_INTERVAL_MS = 15 * 60_000;

export function subscribeOperationalSyncLifecycle() {
  let online: boolean | null = null;
  let liveConnectivity = false;
  let removed = false;
  const updateActiveTimer = (active: boolean) => {
    if (activeHealthTimer) clearInterval(activeHealthTimer);
    activeHealthTimer = active
      ? setInterval(
          () => void scheduleAutomaticDataHealth("PERIODIC").catch(() => undefined),
          ACTIVE_HEALTH_INTERVAL_MS,
        )
      : null;
  };
  syncActive = AppState.currentState === "active";
  updateActiveTimer(syncActive);
  void Network.getNetworkStateAsync()
    .then((state) => {
      if (liveConnectivity || removed) return;
      online = isOnline(state);
      syncOnline = online;
      if (!online) scheduleOperationalReadRetry(null);
    })
    .catch(() => undefined);
  const appState = AppState.addEventListener("change", (state) => {
    const active = state === "active";
    updateActiveTimer(active);
    syncActive = active;
    if (!active) {
      scheduleOperationalReadRetry(null);
      return;
    }
    void resumeOperationalSync().catch(() => undefined);
    void scheduleAutomaticDataHealth("FOREGROUND").catch(() => undefined);
  });
  const network = Network.addNetworkStateListener((state) => {
    liveConnectivity = true;
    const next = isOnline(state);
    const restored = next && online === false;
    online = next;
    syncOnline = next;
    if (!next) scheduleOperationalReadRetry(null);
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
      removed = true;
      appState.remove();
      network.remove();
      unsubscribeSync();
      updateActiveTimer(false);
    },
  };
}

export function resumeOperationalSync() {
  if (syncPaused || !syncOnline || !syncActive) return Promise.resolve();
  const generation = getAccountGeneration();
  if (resuming?.generation === generation) return resuming.promise;
  const promise = refreshThenSync().finally(() => {
    if (resuming?.promise === promise) resuming = null;
  });
  resuming = { generation, promise };
  return promise;
}

export async function pauseOperationalSync() {
  syncPaused = true;
  scheduleOperationalReadRetry(null);
  // Read callbacks are generation-fenced; only durable mutation work must drain.
  await pauseLedgerOperationalSync();
}

export async function restartOperationalSync() {
  allowLedgerOperationalSync();
  syncPaused = false;
  void reactivateLongLivedLedgerFailures()
    .catch(() => undefined)
    .then(() => resumeOperationalSync())
    .catch(() => undefined);
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
  if (!session?.identity?.userId) return;
  const context = await captureAccountScope(requireActiveUserId);
  await runLedgerOperationalSync();
  await assertAccountRequestContext(context, requireActiveUserId);
  if (getSyncTransportMode() === "dev") await discoverAccountJourneys(context);
}

async function discoverAccountJourneys(context: AccountScope) {
  if (discovery?.generation !== context.generation)
    discovery = { generation: context.generation, complete: false, failures: 0 };
  const state = discovery;
  let discoveryChanged = false;
  let journeyId: string | null = null;
  try {
    if (!state.complete) {
      await refreshMyLedger("ALL", { from: null, to: null }, context);
      await assertAccountRequestContext(context, requireActiveUserId);
      state.complete = true;
      discoveryChanged = true;
      notifyLedgerReadCompletion({ ...context, journeyIds: [], discoveryChanged: true });
    }
    const repository = await getDefaultLedgerReportingRepository();
    const [journeys, selected] = await Promise.all([
      repository.listJourneys(),
      repository.getSelectedJourneyId(),
    ]);
    await assertAccountRequestContext(context, requireActiveUserId);
    // A retained Account choice wins; otherwise retain the approved date policy.
    const entry = chooseJourneyEntry(journeys, localCalendarDate(), selected);
    journeyId =
      selected && journeys.some((j) => j.journeyId === selected)
        ? selected
        : entry.kind === "JOURNEY"
          ? entry.journeyId
          : null;
    if (journeyId) {
      if (selected !== journeyId) await repository.selectJourney(journeyId, context);
      const result = await refreshJourneyLedgerWithStatus(
        journeyId,
        Object.freeze({ ...context, tripId: journeyId }),
      );
      await assertAccountRequestContext(context, requireActiveUserId);
      if (result.incomplete) {
        const errors = result.auxiliaryErrors ?? [];
        throw (
          errors.find((error) => !isRetryableReadFailure(error)) ??
          errors[0] ??
          new ApiClientError("Incomplete read has no classified failure.", "validation")
        );
      }
    }
    state.failures = 0;
    scheduleOperationalReadRetry(null);
  } catch (error) {
    await assertAccountRequestContext(context, requireActiveUserId);
    const transient = isRetryableReadFailure(error);
    if (transient && !syncPaused && syncActive && syncOnline) {
      const delay = [15_000, 30_000, 60_000][Math.min(state.failures++, 2)];
      scheduleOperationalReadRetry({
        at: Date.now() + delay,
        generation: context.generation,
        run: resumeOperationalSync,
      });
    } else scheduleOperationalReadRetry(null);
    console.info(
      JSON.stringify({
        event: "ledger_sync_failure",
        phase: "discovery",
        kind: error instanceof ApiClientError ? error.kind : "local",
      }),
    );
  } finally {
    await assertAccountRequestContext(context, requireActiveUserId);
    notifyLedgerReadCompletion({
      ...context,
      journeyIds: journeyId ? [journeyId] : [],
      discoveryChanged,
    });
  }
}

function localCalendarDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isRetryableReadFailure(error: unknown) {
  return (
    error instanceof ApiClientError &&
    (error.kind === "network" ||
      error.kind === "timeout" ||
      (error.kind === "http" &&
        error.status !== undefined &&
        (error.status === 429 || error.status >= 500)))
  );
}
