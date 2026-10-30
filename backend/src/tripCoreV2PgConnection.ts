import { checkServerIdentity } from "node:tls";
import type { Duplex } from "node:stream";
import { Client } from "pg";
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
// Each operation owns a fresh session; no role/GUC/aborted transaction can leak to another actor.
export function createCorePgConnection(input: CorePgConfig): CorePgConnection {
  return createOwningPgConnection(input, "otr_trip_core_v2_gateway");
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
  let occupied = false;
  return {
    async withLease(work) {
      if (occupied) throw new Error("CORE_CONNECTION_BUSY");
      occupied = true;
      const client = new Client({
        ...config,
        user: principal,
        connectionTimeoutMillis: 3000,
        query_timeout: 5000,
        ssl: {
          rejectUnauthorized: true,
          ...(config.ca ? { ca: config.ca } : {}),
          checkServerIdentity: (_host, certificate) =>
            checkServerIdentity(config.host, certificate),
        },
        options: `-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=${budget.idleMs}`,
      });
      let retired = false,
        querying = false,
        finished = false;
      const retire = () => {
        retired = true;
        (
          client as Client & { connection?: { stream?: Duplex } }
        ).connection?.stream?.destroy();
        void client.end().catch(() => {});
      };
      client.on("error", retire);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            retire();
            reject(new Error("CORE_CONNECTION_TIMEOUT"));
          }, budget.leaseMs);
        });
        const operation = async () => {
          await client.connect();
          if (retired) throw new Error("CORE_CONNECTION_RETIRED");
          const identity = (
            await client.query(
              "SELECT session_user AS principal,current_user AS role,pg_is_in_recovery() AS recovery",
            )
          ).rows;
          if (
            identity.length !== 1 ||
            identity[0].principal !== principal ||
            identity[0].role !== principal ||
            identity[0].recovery !== false
          )
            throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
          const lease: CorePgLease = {
            retire,
            async query(sql, parameters = []) {
              if (retired || querying || finished)
                throw new Error("CORE_CONNECTION_RETIRED");
              querying = true;
              try {
                const result = await client.query(sql, [...parameters]);
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
        return await Promise.race([operation(), deadline]);
      } finally {
        if (timeout) clearTimeout(timeout);
        retire();
        occupied = false;
      }
    },
  };
}
