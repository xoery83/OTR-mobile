import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

type Phase = {
  count: number;
  totalMs: number;
  maxMs: number;
  failures: Partial<Record<"lock_unavailable" | "query_canceled" | "other", number>>;
};
const timing = new AsyncLocalStorage<Map<string, Phase>>();

export function sourcePdfTimingStart() {
  return timing.getStore() ? performance.now() : undefined;
}

export function recordSourcePdfTiming(
  phase: string,
  start: number | undefined,
  error?: unknown,
) {
  if (start === undefined) return;
  const phases = timing.getStore();
  if (!phases) return;
  const elapsed = performance.now() - start;
  const entry = phases.get(phase) ?? { count: 0, totalMs: 0, maxMs: 0, failures: {} };
  entry.count++;
  entry.totalMs += elapsed;
  entry.maxMs = Math.max(entry.maxMs, elapsed);
  if (error !== undefined) {
    const code =
      typeof error === "object" && error !== null && "code" in error && error.code;
    const kind =
      code === "55P03"
        ? "lock_unavailable"
        : code === "57014"
          ? "query_canceled"
          : "other";
    entry.failures[kind] = (entry.failures[kind] ?? 0) + 1;
  }
  phases.set(phase, entry);
}

export function measureSourcePdfPhase<T>(
  phase: string,
  work: () => Promise<T>,
): Promise<T> {
  const start = sourcePdfTimingStart();
  if (start === undefined) return work();
  return (async () => {
    try {
      const result = await work();
      recordSourcePdfTiming(phase, start);
      return result;
    } catch (error) {
      recordSourcePdfTiming(phase, start, error ?? true);
      throw error;
    }
  })();
}

export async function runSourcePdfTimings(
  requestId: string,
  action: "dispatch" | "observe-retained" | "advance",
  work: () => Promise<Response>,
) {
  return timing.run(new Map(), async () => {
    const start = performance.now();
    let status: number | undefined;
    try {
      const response = await work();
      status = response.status;
      return response;
    } finally {
      try {
        const phases = Object.fromEntries(
          Array.from(timing.getStore()!, ([phase, value]) => [
            phase,
            {
              ...value,
              totalMs: Math.round(value.totalMs),
              maxMs: Math.round(value.maxMs),
            },
          ]),
        );
        console.info(
          JSON.stringify({
            event: "universal_source_pdf_timing",
            requestId,
            action,
            status,
            totalMs: Math.round(performance.now() - start),
            phases,
          }),
        );
      } catch {
        // Preserve the request result if logging is unavailable.
      }
    }
  });
}
