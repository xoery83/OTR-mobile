import { getLedgerQueueActivity } from "./ledgerQueueActivity";
import { isLedgerOperationalSyncPaused } from "./ledgerOperationalSync";

import { refreshJourneyLedgerWithStatus } from "./ledgerReportingCoordinator";
import { refreshLedgerPersonalPayments } from "./ledgerPersonalPaymentCoordinator";

export const LEDGER_POLL_INTERVAL_MS = 8_000;
const idleIntervals = [8_000, 15_000, 30_000, 60_000];
const failureIntervals = [15_000, 30_000, 60_000];

export type LedgerSyncStatus = "SYNCING" | "UP_TO_DATE" | "OFFLINE" | "CHANGES_WAITING";

export type LedgerActiveSyncResult = {
  changed: boolean;
  pendingCount: number;
  actionableNow: number;
  nextActionableAt: number | null;
  pullSucceeded: boolean;
  personalPaymentRefreshCount?: number;
  incomplete?: boolean;
  pullApiRequestCount?: number | null;
  reviewOutcome?: "review_success" | "review_blocked_stable" | "review_error";
};

export type LedgerActiveSyncMetric = {
  cycle: number;
  durationMs: number;
  currentIntervalMs: number;
  nextIntervalMs: number | null;
  resetReason: string | null;
  outcome: "idle" | "remote_change" | "queue_nonempty" | "failure";
  successfulNoChangeCycles: number;
  remoteChangeCycles: number;
  localWorkCycles: number;
  queueNonemptyCycles: number;
  failureCycles: number;
  personalPaymentRefreshCount: number;
  wakeups: number;
  coalescedWakeups: number;
  pullApiRequestCount: number | null;
  pendingCount: number | null;
  actionableNow: number | null;
  nextActionableAt: number | null;
  reviewOutcome: LedgerActiveSyncResult["reviewOutcome"];
};

export function deriveLedgerSyncStatus(input: {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  pullSucceeded: boolean;
}): LedgerSyncStatus {
  if (input.syncing && input.online) return "SYNCING";
  if (input.pendingCount > 0) return "CHANGES_WAITING";
  if (!input.online || !input.pullSucceeded) return "OFFLINE";
  return "UP_TO_DATE";
}

export async function getLedgerPendingMutationCount(journeyId: string) {
  return (await getLedgerQueueActivity(journeyId)).unresolvedCount;
}

export async function runLedgerActiveSync(
  journeyId: string,
): Promise<LedgerActiveSyncResult> {
  let incomplete = false;
  let pullApiRequestCount = 0;
  let reviewOutcome: LedgerActiveSyncResult["reviewOutcome"];
  const result = await runActiveSync(journeyId, async (id) => {
    const pulled = await refreshJourneyLedgerWithStatus(id);
    incomplete = pulled.incomplete;
    pullApiRequestCount = pulled.pullApiRequestCount;
    reviewOutcome = pulled.reviewOutcome;
    return pulled.changed;
  });
  return {
    ...result,
    incomplete,
    reviewOutcome,
    pullApiRequestCount: result.pullSucceeded ? pullApiRequestCount : null,
  };
}

export async function runPersonalPaymentActiveSync(
  journeyId: string,
): Promise<LedgerActiveSyncResult> {
  let pullApiRequestCount = 0;
  const result = await runActiveSync(journeyId, (id) =>
    refreshLedgerPersonalPayments(id, () => {
      pullApiRequestCount += 1;
    }),
  );
  return {
    ...result,
    pullApiRequestCount: result.pullSucceeded ? pullApiRequestCount : null,
  };
}

async function runActiveSync(
  journeyId: string,
  refresh: (journeyId: string) => Promise<boolean>,
): Promise<LedgerActiveSyncResult> {
  let changed = false;
  let pullSucceeded = true;
  let personalPaymentRefreshCount = 0;
  try {
    personalPaymentRefreshCount = 1;
    changed = await refresh(journeyId);
  } catch {
    pullSucceeded = false;
  }
  const activity = await getLedgerQueueActivity(journeyId);
  return {
    changed,
    pendingCount: activity.unresolvedCount,
    actionableNow: isLedgerOperationalSyncPaused() ? 0 : activity.actionableNow,
    nextActionableAt: isLedgerOperationalSyncPaused() ? null : activity.nextActionableAt,
    pullSucceeded,
    personalPaymentRefreshCount,
  };
}

export function createLedgerActiveSyncController(input: {
  run: () => Promise<LedgerActiveSyncResult>;
  onStart: () => void;
  onSuccess: (result: LedgerActiveSyncResult) => void;
  onError: () => void;
  initialOnline?: boolean;
  isCurrent?: () => boolean;
  onCycle?: (metric: LedgerActiveSyncMetric) => void;
}) {
  let active = true;
  let visible = false;
  let online = input.initialOnline ?? true;
  let running = false;
  let rerun = false;
  let rerunReason: string | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let emptyStreak = 0;
  let failureStreak = 0;
  let cycle = 0;
  let successfulNoChangeCycles = 0;
  let remoteChangeCycles = 0;
  let localWorkCycles = 0;
  let queueNonemptyCycles = 0;
  let failureCycles = 0;
  let personalPaymentRefreshCount = 0;
  let wakeups = 0;
  let coalescedWakeups = 0;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const canRun = () => active && visible && online && (input.isCurrent?.() ?? true);
  const schedule = (delay: number) => {
    clearTimer();
    if (!canRun()) return;
    timer = setTimeout(() => {
      timer = null;
      void trigger(null, delay);
    }, delay);
  };

  const trigger = async (reason: string | null = null, currentIntervalMs = 0) => {
    if (!canRun()) return;
    if (running) {
      if (rerun) coalescedWakeups += 1;
      rerun = true;
      rerunReason = reason;
      return;
    }
    clearTimer();
    running = true;
    if (reason === "local_mutation" || reason === "coalesced_wakeup")
      localWorkCycles += 1;
    const startedGeneration = generation;
    const startedAt = Date.now();
    cycle += 1;
    let outcome: LedgerActiveSyncMetric["outcome"] = "failure";
    let resetReason = reason;
    let nextIntervalMs: number | null = null;
    let pullApiRequestCount: number | null = null;
    let pendingCount: number | null = null;
    let actionableNow: number | null = null;
    let nextActionableAt: number | null = null;
    let reviewOutcome: LedgerActiveSyncResult["reviewOutcome"];
    input.onStart();
    try {
      const result = await input.run();
      if (startedGeneration !== generation || !canRun()) return;
      input.onSuccess(result);
      personalPaymentRefreshCount += result.personalPaymentRefreshCount ?? 0;
      pendingCount = result.pendingCount;
      actionableNow = result.actionableNow;
      nextActionableAt = result.nextActionableAt;
      reviewOutcome = result.reviewOutcome;
      pullApiRequestCount = result.pullApiRequestCount ?? null;
      if (!result.pullSucceeded || result.incomplete) {
        failureCycles += 1;
        failureStreak += 1;
        emptyStreak = 0;
        nextIntervalMs = failureIntervals[Math.min(failureStreak - 1, 2)];
      } else if (result.changed) {
        outcome = "remote_change";
        remoteChangeCycles += 1;
        failureStreak = 0;
        emptyStreak = 0;
        resetReason = "remote_change";
        nextIntervalMs = LEDGER_POLL_INTERVAL_MS;
      } else if (result.actionableNow > 0) {
        outcome = "queue_nonempty";
        queueNonemptyCycles += 1;
        failureStreak = 0;
        emptyStreak = 0;
        resetReason = "queue_nonempty";
        nextIntervalMs = LEDGER_POLL_INTERVAL_MS;
      } else {
        outcome = "idle";
        successfulNoChangeCycles += 1;
        failureStreak = 0;
        emptyStreak += 1;
        nextIntervalMs = idleIntervals[Math.min(emptyStreak - 1, 3)];
      }
    } catch {
      if (startedGeneration !== generation || !canRun()) return;
      input.onError();
      failureCycles += 1;
      failureStreak += 1;
      emptyStreak = 0;
      nextIntervalMs = failureIntervals[Math.min(failureStreak - 1, 2)];
    } finally {
      running = false;
      if (startedGeneration !== generation) {
        const restart = rerun && canRun();
        const nextReason = rerunReason;
        rerun = false;
        rerunReason = null;
        if (restart) void trigger(nextReason);
        return;
      }
      if (!canRun()) {
        rerun = false;
        rerunReason = null;
        return;
      }
      input.onCycle?.({
        cycle,
        durationMs: Date.now() - startedAt,
        currentIntervalMs,
        nextIntervalMs: rerun ? 0 : nextIntervalMs,
        resetReason,
        outcome,
        successfulNoChangeCycles,
        remoteChangeCycles,
        localWorkCycles,
        queueNonemptyCycles,
        failureCycles,
        personalPaymentRefreshCount,
        wakeups,
        coalescedWakeups,
        pullApiRequestCount,
        pendingCount,
        actionableNow,
        nextActionableAt,
        reviewOutcome,
      });
      if (rerun) {
        rerun = false;
        const nextReason = rerunReason;
        rerunReason = null;
        void trigger(nextReason ?? "coalesced_wakeup");
      } else if (nextIntervalMs !== null) schedule(nextIntervalMs);
    }
  };

  const reset = (reason: string) => {
    generation += 1;
    emptyStreak = 0;
    failureStreak = 0;
    clearTimer();
    if (running) {
      if (rerun) coalescedWakeups += 1;
      rerun = true;
      rerunReason = reason;
    } else void trigger(reason);
  };

  return {
    start() {
      if (visible) return;
      visible = true;
      reset("focus");
    },
    stop() {
      visible = false;
      rerun = false;
      rerunReason = null;
      generation += 1;
      clearTimer();
    },
    setActive(next: boolean) {
      if (active === next) return;
      active = next;
      if (next) reset("foreground");
      else {
        generation += 1;
        rerun = false;
        rerunReason = null;
        clearTimer();
      }
    },
    setOnline(next: boolean) {
      if (online === next) return;
      online = next;
      if (next) reset("reconnect");
      else {
        generation += 1;
        rerun = false;
        rerunReason = null;
        clearTimer();
      }
    },
    trigger,
    wake() {
      wakeups += 1;
      emptyStreak = 0;
      failureStreak = 0;
      clearTimer();
      void trigger("local_mutation");
    },
  };
}
