import { checkServerIdentity } from "node:tls";
import type { Duplex } from "node:stream";
import { Client, Pool, type PoolClient } from "pg";
import { z } from "zod";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
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
// Core reuses a physical connection only after verified transaction/session cleanup.
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
export function createSourcePdfPgConnection(input: CorePgConfig): CorePgConnection {
  return createOwningPgConnection(input, "otr_trip_source_command_gateway", {
    idleMs: 65000,
    leaseMs: 75000,
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
  budget = { idleMs: 5000, leaseMs: 30000 },
): CorePgConnection {
  const config = configSchema.parse(input);
  let pool: Pool | undefined;
  let occupied = false;
  const waiters = new Set<() => void>();
  // The Core principal retains its one-connection FIFO and bounded waiters.
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
    async withLease(work) {
      await acquire();
      let client: Client | PoolClient | undefined;
      try {
        const options = {
          ...config,
          user: principal,
          connectionTimeoutMillis: 3000,
          query_timeout: 5000,
          ssl: {
            rejectUnauthorized: true,
            ...(config.ca ? { ca: config.ca } : {}),
            checkServerIdentity: (
              _host: string,
              certificate: Parameters<typeof checkServerIdentity>[1],
            ) => checkServerIdentity(config.host, certificate),
          },
          options: `-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=${budget.idleMs}`,
        };
        if (principal === "otr_trip_core_v2_gateway") {
          if (!pool) {
            pool = new Pool({
              ...options,
              max: 1,
              idleTimeoutMillis: 60_000,
              maxLifetimeSeconds: 120,
              allowExitOnIdle: true,
            });
            // pg has already removed a failed idle client before emitting this event.
            pool.on("error", () => {});
          }
        } else client = new Client(options);
      } catch (error) {
        release();
        throw error;
      }
      let retired = false,
        returned = false,
        successful = false,
        querying = false,
        finished = false;
      const retire = () => {
        retired = true;
        if (pool) {
          if (client && !returned) {
            returned = true;
            client.removeListener("error", retire);
            (client as PoolClient).release(true);
          }
          return;
        }
        (
          client as Client & { connection?: { stream?: Duplex } }
        ).connection?.stream?.destroy();
        void (client as Client).end().catch(() => {});
      };
      client?.on("error", retire);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            retire();
            reject(new Error("CORE_CONNECTION_TIMEOUT"));
          }, budget.leaseMs);
        });
        const operation = async () => {
          if (pool) {
            const connected = await pool.connect();
            if (retired) {
              connected.release(true);
              throw new Error("CORE_CONNECTION_RETIRED");
            }
            client = connected;
            client.on("error", retire);
          } else await client!.connect();
          if (retired) throw new Error("CORE_CONNECTION_RETIRED");
          const physical = client!;
          const identity = (
            await physical.query(
              pool
                ? "SELECT session_user AS principal,current_user AS role,pg_is_in_recovery() AS recovery,(SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname=session_user) AS login,(SELECT rolvaliduntil IS NULL OR rolvaliduntil>clock_timestamp() FROM pg_catalog.pg_roles WHERE rolname=session_user) AS unexpired"
                : "SELECT session_user AS principal,current_user AS role,pg_is_in_recovery() AS recovery",
            )
          ).rows;
          if (
            identity.length !== 1 ||
            identity[0].principal !== principal ||
            identity[0].role !== principal ||
            identity[0].recovery !== false ||
            (pool && (identity[0].login !== true || identity[0].unexpired !== true))
          )
            throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
          const lease: CorePgLease = {
            retire,
            async query(sql, parameters = []) {
              if (retired || returned || querying || finished)
                throw new Error("CORE_CONNECTION_RETIRED");
              querying = true;
              try {
                const result = await physical.query(sql, [...parameters]);
                if (retired) throw new Error("CORE_CONNECTION_RETIRED");
                if (sql === "COMMIT" || sql === "ROLLBACK") finished = true;
                return { rows: result.rows };
              } catch (error) {
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
          if (!finished || retired) throw new Error("CORE_TRANSACTION_UNFINISHED");
          return result;
        };
        const result = await Promise.race([operation(), deadline]);
        successful = true;
        return result;
      } finally {
        if (timeout) clearTimeout(timeout);
        if (pool && client && successful && finished && !retired) {
          try {
            // Do not hand the FIFO slot to another actor until cleanup or destruction.
            await client.query("DISCARD ALL");
            client.removeListener("error", retire);
            if (!retired && !returned) {
              returned = true;
              (client as PoolClient).release();
            }
          } catch {
            // Cleanup cannot replace a result whose owning transaction already committed.
            retire();
          }
        } else retire();
        release();
      }
    },
  };
}
