import { openDatabase } from "@/data/db/database";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  cleanupReconstructibleLedgerData,
  enforceReceiptCacheLimit,
} from "@/data/operations/ledgerMaintenance";
import { createLedgerReceiptRepository } from "@/data/repositories/ledgerReceiptRepository";

import { runLedgerExpenseSync } from "./ledgerExpenseDemoCoordinator";
import { runLedgerReceiptSync } from "./ledgerReceiptCoordinator";
import { runLedgerReviewSync } from "./ledgerReviewCoordinator";
import { runLedgerSettlementPaymentSync } from "./ledgerSettlementPaymentCoordinator";
import { runLedgerPersonalPaymentSync } from "./ledgerPersonalPaymentCoordinator";
import { runPersonalSettlementReviewSync } from "./personalSettlementReviewCoordinator";
import { createSyncOperationRepository } from "./syncOperationRepository";
import {
  getLedgerQueueActivity,
  subscribeLedgerQueueWorkAvailable,
} from "./ledgerQueueActivity";

let running: Promise<void> | null = null;
let paused = false;
let queueTimer: ReturnType<typeof setTimeout> | null = null;
let workSignaledDuringRun = false;
let queueScheduleVersion = 0;

function clearQueueTimer() {
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = null;
}

async function scheduleQueueWake() {
  const generation = getAccountGeneration();
  const version = ++queueScheduleVersion;
  try {
    const activity = await getLedgerQueueActivity();
    if (
      paused ||
      generation !== getAccountGeneration() ||
      version !== queueScheduleVersion
    )
      return;
    const delay =
      workSignaledDuringRun && activity.actionableNow > 0
        ? 0
        : activity.actionableNow > 0
          ? Math.min(
              60_000,
              activity.nextActionableAt === null
                ? 60_000
                : Math.max(0, activity.nextActionableAt - Date.now()),
            )
          : activity.nextActionableAt !== null
            ? Math.max(0, activity.nextActionableAt - Date.now())
            : null;
    workSignaledDuringRun = false;
    clearQueueTimer();
    if (delay === null) return;
    queueTimer = setTimeout(() => {
      queueTimer = null;
      if (!paused && generation === getAccountGeneration())
        void runLedgerOperationalSync().catch(() => undefined);
    }, delay);
  } catch {
    // No active account or unavailable SQLite: lifecycle recovery will retry.
  }
}

subscribeLedgerQueueWorkAvailable(() => {
  if (paused) return;
  if (running) {
    workSignaledDuringRun = true;
    return;
  }
  queueScheduleVersion += 1;
  clearQueueTimer();
  const generation = getAccountGeneration();
  queueTimer = setTimeout(() => {
    queueTimer = null;
    if (!paused && generation === getAccountGeneration())
      void runLedgerOperationalSync().catch(() => undefined);
  }, 0);
});

export type LedgerOperationalSyncOrigin = "NORMAL" | "DATA_HEALTH";
export type LedgerOperationalSyncCompletion = {
  accountId: string;
  generation: number;
  journeyIds: string[];
};

export function isLedgerOperationalSyncPaused() {
  return paused;
}

const completionListeners = new Set<(event: LedgerOperationalSyncCompletion) => void>();
const kickListeners = new Set<(generation: number) => void>();

export function subscribeLedgerOperationalSyncKick(
  listener: (generation: number) => void,
) {
  kickListeners.add(listener);
  return () => {
    kickListeners.delete(listener);
  };
}

export function subscribeLedgerOperationalSyncCompletion(
  listener: (event: LedgerOperationalSyncCompletion) => void,
) {
  completionListeners.add(listener);
  return () => completionListeners.delete(listener);
}

export function runLedgerOperationalSync(
  input: {
    origin?: LedgerOperationalSyncOrigin;
  } = {},
) {
  if (paused) return Promise.resolve();
  if (!running) {
    queueScheduleVersion += 1;
    clearQueueTimer();
    running = runOperationalCycle(input.origin ?? "NORMAL").finally(() => {
      running = null;
      void scheduleQueueWake();
    });
  }
  return running;
}

async function runOperationalCycle(origin: LedgerOperationalSyncOrigin) {
  const completion = await captureEligibleScopes();
  await Promise.resolve(runLedgerPersonalPaymentSync())
    .catch(() => undefined)
    .then(() =>
      Promise.allSettled([
        runLedgerExpenseSync(),
        runLedgerReceiptSync(),
        runLedgerSettlementPaymentSync(),
        runLedgerReviewSync(),
        runPersonalSettlementReviewSync(),
      ]),
    )
    .then(async () => {
      try {
        const database = await openDatabase();
        await cleanupReconstructibleLedgerData(
          database,
          new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString(),
        );
        await enforceReceiptCacheLimit(database, 250 * 1024 * 1024);
      } catch {
        // Maintenance is best-effort and must never block cached startup or sync.
      }
    })
    .then(() => undefined);
  if (origin === "DATA_HEALTH" || !completion?.journeyIds.length) return;
  for (const listener of completionListeners) listener(completion);
}

async function captureEligibleScopes(): Promise<LedgerOperationalSyncCompletion | null> {
  try {
    const [database, accountId] = await Promise.all([
      openDatabase(),
      requireActiveUserId(),
    ]);
    const timestamp = new Date().toISOString();
    const rows = await database.getAllAsync<{ journeyId: string }>(
      `SELECT DISTINCT journeyId FROM (
         SELECT operation.trip_id AS journeyId
         FROM sync_operations operation
         LEFT JOIN sync_operations dependency
           ON dependency.id = operation.dependency_operation_id
          AND dependency.owner_user_id = operation.owner_user_id
         WHERE operation.owner_user_id = ? AND operation.trip_id IS NOT NULL
           AND operation.failure_category IS NOT 'AUTH'
           AND (
             operation.status = 'PENDING'
             OR (operation.status = 'RETRYABLE' AND (
               operation.next_attempt_at IS NULL OR operation.next_attempt_at <= ?
             ))
             OR (operation.status = 'PROCESSING'
               AND operation.lease_expires_at IS NOT NULL
               AND operation.lease_expires_at <= ?)
             OR (operation.status = 'DEPENDENCY_BLOCKED'
               AND dependency.status = 'COMPLETED')
           )
         UNION
         SELECT operation.journey_id
         FROM ledger_asset_operations operation
         LEFT JOIN ledger_asset_operations dependency
           ON dependency.id = operation.dependency_operation_id
          AND dependency.owner_user_id = operation.owner_user_id
         WHERE operation.owner_user_id = ?
           AND operation.failure_category IS NOT 'AUTH'
           AND (
             operation.status = 'PENDING'
             OR (operation.status = 'RETRYABLE' AND (
               operation.next_attempt_at IS NULL OR operation.next_attempt_at <= ?
             ))
             OR (operation.status = 'PROCESSING'
               AND operation.lease_expires_at IS NOT NULL
               AND operation.lease_expires_at <= ?)
           )
         UNION
         SELECT change.journey_id
         FROM ledger_deferred_server_changes change
         JOIN ledger_actor_context actor ON actor.journey_id = change.journey_id
         WHERE actor.user_id = ?
       ) WHERE journeyId IS NOT NULL ORDER BY journeyId`,
      accountId,
      timestamp,
      timestamp,
      accountId,
      timestamp,
      timestamp,
      accountId,
    );
    return {
      accountId,
      generation: getAccountGeneration(),
      journeyIds: rows.map((row) => row.journeyId),
    };
  } catch {
    return null;
  }
}

export async function pauseLedgerOperationalSync() {
  paused = true;
  queueScheduleVersion += 1;
  clearQueueTimer();
  workSignaledDuringRun = false;
  await running;
}

export function allowLedgerOperationalSync() {
  paused = false;
}

export async function reactivateLongLivedLedgerFailures() {
  const database = await openDatabase();
  await Promise.all([
    createSyncOperationRepository(
      database,
      requireActiveUserId,
    ).reactivateLongLivedFailures(),
    createLedgerReceiptRepository(
      database,
      requireActiveUserId,
    ).reactivateLongLivedFailures(),
  ]);
}

export function kickLedgerOperationalSync(
  run: () => Promise<unknown> = runLedgerOperationalSync,
) {
  void run().catch(() => undefined);
  if (!paused) {
    const generation = getAccountGeneration();
    for (const listener of kickListeners) {
      try {
        listener(generation);
      } catch {
        // A polling hint must not turn a durable local write into a failure.
      }
    }
  }
}
