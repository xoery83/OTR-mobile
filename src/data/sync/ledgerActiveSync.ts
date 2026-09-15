import { openDatabase } from "@/data/db/database";
import { resumeOperationalSync } from "@/data/bootstrap/defaultBootstrapDependencies";

import { refreshJourneyLedger } from "./ledgerReportingCoordinator";

export const LEDGER_POLL_INTERVAL_MS = 8_000;

export type LedgerSyncStatus = "SYNCING" | "UP_TO_DATE" | "OFFLINE" | "CHANGES_WAITING";

export type LedgerActiveSyncResult = {
  changed: boolean;
  pendingCount: number;
  pullSucceeded: boolean;
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
  const database = await openDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT
       (SELECT COUNT(*) FROM sync_operations
        WHERE trip_id = ? AND entity_type LIKE 'ledger_%'
          AND status IN ('PENDING', 'PROCESSING', 'RETRYABLE', 'CONFLICT'))
       +
       (SELECT COUNT(*) FROM ledger_asset_operations
        WHERE journey_id = ? AND status IN ('PENDING', 'PROCESSING', 'RETRYABLE'))
       AS count`,
    journeyId,
    journeyId,
  );
  return row?.count ?? 0;
}

export async function runLedgerActiveSync(
  journeyId: string,
): Promise<LedgerActiveSyncResult> {
  let changed = false;
  let pullSucceeded = true;
  try {
    await resumeOperationalSync();
    changed = await refreshJourneyLedger(journeyId);
  } catch {
    pullSucceeded = false;
  }
  return {
    changed,
    pendingCount: await getLedgerPendingMutationCount(journeyId),
    pullSucceeded,
  };
}

export function createLedgerActiveSyncController(input: {
  run: () => Promise<LedgerActiveSyncResult>;
  onStart: () => void;
  onSuccess: (result: LedgerActiveSyncResult) => void;
  onError: () => void;
  intervalMs?: number;
}) {
  let active = true;
  let visible = false;
  let online = true;
  let running = false;
  let rerun = false;
  let generation = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const updateTimer = () => {
    if (timer) clearInterval(timer);
    timer =
      active && visible && online
        ? setInterval(() => void trigger(), input.intervalMs ?? LEDGER_POLL_INTERVAL_MS)
        : null;
  };

  const trigger = async () => {
    if (!active || !visible || !online) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    const startedGeneration = generation;
    input.onStart();
    try {
      const result = await input.run();
      if (startedGeneration === generation && active && visible) input.onSuccess(result);
    } catch {
      if (startedGeneration === generation && active && visible) input.onError();
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        void trigger();
      }
    }
  };

  return {
    start() {
      if (visible) return;
      visible = true;
      generation += 1;
      updateTimer();
      void trigger();
    },
    stop() {
      visible = false;
      rerun = false;
      generation += 1;
      updateTimer();
    },
    setActive(next: boolean) {
      if (active === next) return;
      active = next;
      generation += 1;
      updateTimer();
      if (next) void trigger();
    },
    setOnline(next: boolean) {
      if (online === next) return;
      online = next;
      generation += 1;
      updateTimer();
      if (next) void trigger();
    },
    trigger,
  };
}
