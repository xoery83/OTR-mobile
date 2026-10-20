export type RateDemandScanResult = {
  claimedRateDemands: number;
  personalPaymentFxWork: number;
  autoReferenceDemands: number;
  autoReferenceWork: number;
};

type ScanEvent = {
  event: "historical_rate_scan";
  sequence: number;
  durationMs: number;
  usefulWork: boolean;
  claimedRateDemands: number | null;
  personalPaymentFxWork: number | null;
  autoReferenceDemands: number | null;
  autoReferenceWork: number | null;
  nextIntervalMs: number | null;
  failureCount: number;
  failureClass: string | null;
  wakeups: number;
  coalescedWakeups: number;
};

const idleIntervals = [30_000, 60_000, 120_000, 300_000];
const failureIntervals = [60_000, 120_000, 300_000];

export function createRateDemandScanner(
  scan: () => Promise<RateDemandScanResult>,
  log: (event: ScanEvent) => void,
) {
  let started = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let nextDelayIsImmediate = false;
  let wakePending = false;
  let sequence = 0;
  let emptyStreak = 0;
  let failureStreak = 0;
  let failureBackoffUntil = 0;
  let failureCount = 0;
  let wakeups = 0;
  let coalescedWakeups = 0;

  const schedule = (delay: number) => {
    nextDelayIsImmediate = delay === 0;
    timer = setTimeout(() => {
      timer = null;
      nextDelayIsImmediate = false;
      void run();
    }, delay);
    timer.unref();
  };

  const run = async () => {
    if (!started || running) return;
    running = true;
    const startedAt = Date.now();
    const currentSequence = ++sequence;
    let result: RateDemandScanResult | null = null;
    let failureClass: string | null = null;
    let nextIntervalMs: number;
    try {
      result = await scan();
      failureStreak = 0;
      failureBackoffUntil = 0;
      const usefulWork = Object.values(result).some((count) => count > 0);
      emptyStreak = usefulWork ? 0 : emptyStreak + 1;
      nextIntervalMs = usefulWork
        ? idleIntervals[0]
        : idleIntervals[Math.min(emptyStreak - 1, idleIntervals.length - 1)];
    } catch (error) {
      failureCount += 1;
      failureStreak += 1;
      emptyStreak = 0;
      failureClass = error instanceof Error ? error.name : "UNKNOWN";
      nextIntervalMs =
        failureIntervals[Math.min(failureStreak - 1, failureIntervals.length - 1)];
      failureBackoffUntil = Date.now() + nextIntervalMs;
    } finally {
      running = false;
    }
    if (wakePending) {
      wakePending = false;
      if (!failureClass) nextIntervalMs = 0;
    }
    if (started) schedule(nextIntervalMs);
    log({
      event: "historical_rate_scan",
      sequence: currentSequence,
      durationMs: Date.now() - startedAt,
      usefulWork: result !== null && Object.values(result).some((count) => count > 0),
      claimedRateDemands: result?.claimedRateDemands ?? null,
      personalPaymentFxWork: result?.personalPaymentFxWork ?? null,
      autoReferenceDemands: result?.autoReferenceDemands ?? null,
      autoReferenceWork: result?.autoReferenceWork ?? null,
      nextIntervalMs: started ? nextIntervalMs : null,
      failureCount,
      failureClass,
      wakeups,
      coalescedWakeups,
    });
  };

  return {
    start() {
      if (started) return;
      started = true;
      void run();
    },
    wake() {
      if (!started) return;
      wakeups += 1;
      if (
        Date.now() < failureBackoffUntil ||
        wakePending ||
        (timer && nextDelayIsImmediate)
      ) {
        coalescedWakeups += 1;
        return;
      }
      if (running) {
        wakePending = true;
        return;
      }
      if (timer) clearTimeout(timer);
      schedule(0);
    },
    stop() {
      started = false;
      wakePending = false;
      if (timer) clearTimeout(timer);
      timer = null;
      nextDelayIsImmediate = false;
    },
  };
}
