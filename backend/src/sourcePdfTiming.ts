import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

type Phase = {
  count: number;
  totalMs: number;
  maxMs: number;
  failures: Partial<Record<"lock_unavailable" | "query_canceled" | "other", number>>;
  errorCodes?: Record<string, number>;
};
type RemoteSample = { operation: string; elapsedMs: number };
const pgCommandPhases = new Set([
  "pg_sql_setup",
  "pg_sql_end",
  "pg_source_scope",
  "pg_source_command",
  "pg_task_command",
  "pg_catalog_command",
]);
const remotePhases = new Set([
  "auth",
  "trip_access",
  "pg_connect",
  "pg_catalog_connect",
  "ledger_bootstrap",
  "storage_http",
  "provider_http",
]);
const readFailureCodes = new Set([
  "53300",
  "42501",
  "57014",
  "40001",
  "40P01",
  "25P02",
  "42P01",
  "42703",
  "42883",
  "28P01",
  "08006",
  "57P01",
  "P0001",
  "55P03",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "CORE_CONNECTION_BUSY",
  "CORE_CONNECTION_TIMEOUT",
  "CORE_CONNECTION_RETIRED",
  "CORE_PRINCIPAL_UNAVAILABLE",
  "CORE_TRANSACTION_UNFINISHED",
  "TRIP_CREATE_RESULT_MISMATCH",
  "TRIP_CREATE_CLOSED",
  "TRIP_SUSTAINED_DEV_CLOSED",
]);
const timing = new AsyncLocalStorage<{
  readDiagnostic: boolean;
  phases: Map<string, Phase>;
  pgCommandsByStage: Record<string, number>;
  slowestRemote: RemoteSample[];
}>();

export function sourcePdfTimingStart() {
  return timing.getStore() ? performance.now() : undefined;
}

export function recordSourcePdfTiming(
  phase: string,
  start: number | undefined,
  error?: unknown,
  operation?: string,
) {
  if (start === undefined) return;
  const active = timing.getStore();
  if (!active) return;
  const { phases, pgCommandsByStage, slowestRemote } = active;
  const elapsed = performance.now() - start;
  const entry: Phase = phases.get(phase) ?? {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    failures: {},
  };
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
    if (active.readDiagnostic) {
      const message = error instanceof Error ? error.message : "";
      const category =
        typeof code === "string" && readFailureCodes.has(code)
          ? code
          : error instanceof Error && error.name === "ZodError"
            ? "RESULT_SCHEMA_INVALID"
            : readFailureCodes.has(message)
              ? message
              : [
                    "Connection terminated due to connection timeout",
                    "timeout expired",
                  ].includes(message)
                ? "CONNECT_TIMEOUT"
                : message === "Query read timeout"
                  ? "QUERY_TIMEOUT"
                  : "OTHER";
      entry.errorCodes ??= {};
      entry.errorCodes[category] = (entry.errorCodes[category] ?? 0) + 1;
    }
  }
  phases.set(phase, entry);
  if (pgCommandPhases.has(phase)) {
    const stage =
      phase === "pg_catalog_command"
        ? "catalog"
        : phase === "pg_sql_setup" || phase === "pg_sql_end"
          ? "session"
          : phase === "pg_source_scope"
            ? "source_scope"
            : operation?.startsWith("trip_source_png_operation")
              ? "png"
              : operation?.startsWith("trip_source_pdf_")
                ? "pdf"
                : operation?.startsWith("trip_source_begin_") ||
                    operation?.startsWith("trip_source_find_")
                  ? "run"
                  : phase === "pg_task_command"
                    ? "task"
                    : "source";
    pgCommandsByStage[stage] = (pgCommandsByStage[stage] ?? 0) + 1;
  }
  const remote = operation ?? (remotePhases.has(phase) ? phase : undefined);
  if (remote && (slowestRemote.length < 5 || elapsed > slowestRemote.at(-1)!.elapsedMs)) {
    slowestRemote.push({ operation: remote, elapsedMs: elapsed });
    slowestRemote.sort((a, b) => b.elapsedMs - a.elapsedMs);
    if (slowestRemote.length > 5) slowestRemote.pop();
  }
}

export function measureSourcePdfPhase<T>(
  phase: string,
  work: () => Promise<T>,
  operation?: string,
): Promise<T> {
  const start = sourcePdfTimingStart();
  if (
    start === undefined ||
    (phase === "pg_read_result" && !timing.getStore()?.readDiagnostic)
  )
    return work();
  return (async () => {
    try {
      const result = await work();
      recordSourcePdfTiming(phase, start, undefined, operation);
      return result;
    } catch (error) {
      recordSourcePdfTiming(phase, start, error ?? true, operation);
      throw error;
    }
  })();
}

export async function runSourcePdfTimings<T>(
  requestId: string,
  action:
    | "dispatch"
    | "observe-retained"
    | "advance"
    | "start-resume"
    | "material-intake"
    | "run-wake"
    | "core-read"
    | "metadata-read"
    | "metadata-write"
    | "parent-receipt-read",
  work: () => Promise<T>,
) {
  return timing.run(
    {
      phases: new Map(),
      pgCommandsByStage: {},
      slowestRemote: [],
      readDiagnostic:
        action === "core-read" ||
        action === "metadata-read" ||
        action === "metadata-write" ||
        action === "parent-receipt-read",
    },
    async () => {
      const start = performance.now();
      let status: number | undefined;
      try {
        const response = await work();
        if (response instanceof Response) status = response.status;
        return response;
      } finally {
        try {
          const active = timing.getStore()!;
          const phases = Object.fromEntries(
            Array.from(active.phases, ([phase, value]) => [
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
              ...(action === "start-resume" ||
              action === "material-intake" ||
              action === "run-wake"
                ? {
                    pgCommands: Object.values(active.pgCommandsByStage).reduce(
                      (sum, count) => sum + count,
                      0,
                    ),
                    pgCommandsByStage: active.pgCommandsByStage,
                    pgSourceTaskConnectionAttempts: phases.pg_connect?.count ?? 0,
                    pgCatalogConnectionsOpened: phases.pg_catalog_connect?.count ?? 0,
                    pgConnectionsOpened:
                      (phases.pg_connect?.count ?? 0) +
                      (phases.pg_catalog_connect?.count ?? 0) -
                      Object.values(phases.pg_connect?.failures ?? {}).reduce(
                        (a, b) => a + b,
                        0,
                      ),
                    slowestRemote: active.slowestRemote.map(
                      ({ operation, elapsedMs }) => ({
                        operation,
                        elapsedMs: Math.round(elapsedMs),
                      }),
                    ),
                  }
                : {}),
            }),
          );
        } catch {
          // Preserve the request result if logging is unavailable.
        }
      }
    },
  );
}
