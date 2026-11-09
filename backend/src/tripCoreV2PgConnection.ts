import { checkServerIdentity } from "node:tls";
import type { Duplex } from "node:stream";
import { Client } from "pg";
import { z } from "zod";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
import { measureSourcePdfPhase } from "./sourcePdfTiming";
const configSchema = z.strictObject({
  host: z
    .string()
    .min(1)
    .refine(
      (host) =>
        !/[\s/?#@]/.test(host) &&
        !host.replace(/\.$/, "").toLowerCase().endsWith("pooler.supabase.com"),
    ),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .refine((port) => port !== 6543),
  database: z.string().min(1),
  password: z.string().min(1),
  ca: z.string().min(1).optional(),
});
export type CorePgConfig = z.input<typeof configSchema>;
// Dormant until a separately accepted dedicated primary principal is provisioned.
// Each operation owns a fresh session; no role/GUC/aborted transaction can leak to another actor.
export function createCorePgConnection(input: CorePgConfig): CorePgConnection {
  // Sealed Source admission revalidates evidence; the 90s Import request covers FIFO + lease.
  return createOwningPgConnection(input, "otr_trip_core_v2_gateway", {
    idleMs: 5000,
    leaseMs: 60000,
  });
}
export function createSourcePgConnection(input: CorePgConfig): CorePgConnection {
  return createOwningPgConnection(input, "otr_trip_source_command_gateway");
}
// Dormant PDF-only budget: two 15s custody reads + fixed 20s worker, under Native's 90s request.
export function createSourcePdfPgConnection(input: CorePgConfig) {
  return createOwningPgConnection(input, "otr_trip_source_command_gateway", {
    idleMs: 65000,
    leaseMs: 75000,
    // Fresh TLS sessions on the PDF path can exceed the ordinary 3s connect budget.
    connectMs: 5000,
    reuse: true,
  });
}
export function createTripPgConnection(input: CorePgConfig): CorePgConnection {
  return createOwningPgConnection(input, "otr_trip_create_gateway");
}
// Explicit isolated V2 composition only; this cannot open SQL/credential gates.
export function createTripMetadataPgConnection(input: CorePgConfig): CorePgConnection {
  return createOwningPgConnection(input, "otr_trip_metadata_gateway");
}
export function createPersonPgConnection(input: CorePgConfig): CorePgConnection {
  return createOwningPgConnection(input, "otr_trip_person_command_gateway");
}
export function createModelTaskPgConnection(input: CorePgConfig): CorePgConnection {
  return createOwningPgConnection(input, "otr_external_integration_call_gateway");
}
function createOwningPgConnection(
  input: CorePgConfig,
  principal:
    | "otr_trip_core_v2_gateway"
    | "otr_trip_person_command_gateway"
    | "otr_trip_source_command_gateway"
    | "otr_trip_create_gateway"
    | "otr_trip_metadata_gateway"
    | "otr_external_integration_call_gateway",
  budget: { idleMs: number; leaseMs: number; connectMs?: number; reuse?: boolean } = {
    idleMs: 5000,
    leaseMs: 30000,
  },
) {
  const config = configSchema.parse(input);
  let occupied = false;
  let closed = false;
  let idle: { client: Client; retire(): Promise<void>; isRetired(): boolean } | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  function discardIdle() {
    clearTimeout(idleTimer);
    idleTimer = undefined;
    const prior = idle;
    idle = undefined;
    return prior?.retire();
  }
  const waiters = new Set<() => void>();
  // The Core principal has one connection: bound contention without reusing actor sessions.
  async function acquire() {
    if (!occupied) {
      occupied = true;
      return;
    }
    if (principal !== "otr_trip_core_v2_gateway" || waiters.size >= 4)
      throw new Error("CORE_CONNECTION_BUSY");
    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        waiters.delete(wake);
        reject(new Error("CORE_CONNECTION_BUSY"));
      }, 15_000);
      waiters.add(wake);
    });
  }
  function release() {
    const next = waiters.values().next().value;
    if (next) {
      waiters.delete(next);
      next();
    } else occupied = false;
  }
  return {
    discardIdle,
    close() {
      closed = true;
      return discardIdle();
    },
    async withLease<T>(work: (lease: CorePgLease) => Promise<T>) {
      if (closed) throw new Error("CORE_CONNECTION_RETIRED");
      await measureSourcePdfPhase("pg_lease_wait", acquire);
      const reused = idle && !idle.isRetired() ? idle : undefined;
      clearTimeout(idleTimer);
      idleTimer = undefined;
      idle = undefined;
      let session: NonNullable<typeof reused>;
      try {
        if (closed) throw new Error("CORE_CONNECTION_RETIRED");
        if (reused) session = reused;
        else {
          const client = new Client({
            ...config,
            user: principal,
            connectionTimeoutMillis: budget.connectMs ?? 3000,
            query_timeout: 5000,
            ssl: {
              rejectUnauthorized: true,
              ...(config.ca ? { ca: config.ca } : {}),
              checkServerIdentity: (_host, certificate) =>
                checkServerIdentity(config.host, certificate),
            },
            options: `-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=${budget.idleMs}`,
          });
          let ending: Promise<void> | undefined;
          const retire = () => {
            if (ending) return ending;
            (
              client as Client & { connection?: { stream?: Duplex } }
            ).connection?.stream?.destroy();
            ending = client.end().catch(() => {});
            return ending;
          };
          client.on("error", retire);
          session = { client, retire, isRetired: () => ending !== undefined };
        }
      } catch (error) {
        await reused?.retire();
        release();
        throw error;
      }
      const { client, retire, isRetired } = session;
      let querying = false;
      let finished = false;
      let failed = false;
      let reusable = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            retire();
            reject(new Error("CORE_CONNECTION_TIMEOUT"));
          }, budget.leaseMs);
        });
        const operation = async () => {
          if (reused)
            await measureSourcePdfPhase("pg_sql_setup", () =>
              client.query("DISCARD ALL"),
            );
          else {
            await measureSourcePdfPhase("pg_connect", () => client.connect());
            if (isRetired()) throw new Error("CORE_CONNECTION_RETIRED");
            const identity = (
              await measureSourcePdfPhase("pg_sql_setup", () =>
                client.query(
                  "SELECT session_user AS principal,current_user AS role,pg_is_in_recovery() AS recovery",
                ),
              )
            ).rows;
            if (
              identity.length !== 1 ||
              identity[0].principal !== principal ||
              identity[0].role !== principal ||
              identity[0].recovery !== false
            )
              throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
          }
          const lease: CorePgLease = {
            retire,
            ...(budget.reuse ? { verifiedSourceSession: true as const } : {}),
            async query(sql, parameters = []) {
              if (isRetired() || querying || finished)
                throw new Error("CORE_CONNECTION_RETIRED");
              querying = true;
              try {
                const phase = sql.startsWith(
                  "SELECT public.trip_source_universal_pdf_enter(",
                )
                  ? "pg_source_scope"
                  : sql.startsWith("SELECT public.")
                    ? "pg_source_command"
                    : sql === "COMMIT" || sql === "ROLLBACK"
                      ? "pg_sql_end"
                      : "pg_sql_setup";
                const result = await measureSourcePdfPhase(phase, () =>
                  client.query(sql, [...parameters]),
                );
                if (isRetired()) throw new Error("CORE_CONNECTION_RETIRED");
                if (sql === "COMMIT" || sql === "ROLLBACK") finished = true;
                return { rows: result.rows };
              } catch (error) {
                failed = true;
                if (
                  (error as { message?: string }).message?.includes("Query read timeout")
                )
                  retire();
                throw error;
              } finally {
                querying = false;
              }
            },
          };
          const result = await work(lease);
          if (!finished || isRetired()) throw new Error("CORE_TRANSACTION_UNFINISHED");
          reusable = !failed;
          return result;
        };
        return await Promise.race([operation(), deadline]);
      } finally {
        if (timeout) clearTimeout(timeout);
        if (budget.reuse && !closed && reusable && !isRetired()) {
          idle = session;
          idleTimer = setTimeout(discardIdle, 15000);
          idleTimer.unref();
        } else await retire();
        release();
      }
    },
  };
}
