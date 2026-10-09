import { checkServerIdentity } from "node:tls";
import type { Duplex } from "node:stream";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { createRequestBoundary } from "../../src/data/api/requestBoundary";
import {
  PublicationCatalogError,
  type PublicationCatalogConnection,
} from "./tripPublicationCatalogRead";

const configSchema = z
  .object({
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
  })
  .strict();
export type PublicationCatalogPgConfig = z.input<typeof configSchema>;
const unavailable = () =>
  new PublicationCatalogError(503, "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE");
const begin = "BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY";
const commands = [
  begin,
  "SET LOCAL statement_timeout = '5000ms'",
  "SET LOCAL lock_timeout = '1000ms'",
  "SELECT session_user AS principal",
  "SELECT public.trip_source_read_import_catalogs($1::uuid,$2::uuid) AS catalog",
  "COMMIT",
];
let owner: Pool | undefined;

// Dormant: server.ts must explicitly provision the reviewed primary principal before using this.
export function createPublicationCatalogPgConnection(
  input: PublicationCatalogPgConfig,
): PublicationCatalogConnection & { close(): Promise<void> } {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success || owner) throw unavailable();
  const config = parsed.data;
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: "otr_trip_source_command_gateway",
    password: config.password,
    ssl: {
      rejectUnauthorized: true,
      ...(config.ca ? { ca: config.ca } : {}),
      checkServerIdentity: (_host, certificate) =>
        checkServerIdentity(config.host, certificate),
    },
    max: 1,
    connectionTimeoutMillis: 1000,
    idleTimeoutMillis: 10000,
    options:
      "-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000",
  });
  owner = pool;
  // pg-pool already removes errored idle clients; never log raw driver errors.
  pool.on("error", () => {});
  let closed = false;
  let occupied = false;
  let lastClient: PoolClient | undefined;
  let retireActive: (() => void) | undefined;
  let closing: Promise<void> | undefined;
  return {
    async withLease(work, signal) {
      if (closed || occupied || signal.aborted) throw unavailable();
      occupied = true;
      const boundary = createRequestBoundary(5000, signal);
      const checkout = createRequestBoundary(1000, boundary.signal);
      let client: PoolClient | undefined;
      let retired = false;
      let released = false;
      let step = 0;
      let safe = false;
      let querying = false;
      const retire = () => {
        retired = true;
        if (client && !released) {
          released = true;
          // pg 8.16.3 release(true) may gracefully end an idle socket: force destruction first.
          (
            client as PoolClient & { connection: { stream: Duplex } }
          ).connection.stream.destroy();
          client.release(true);
        }
      };
      retireActive = retire;
      boundary.signal.addEventListener("abort", retire, { once: true });
      const pending = pool.connect().then((connected) => {
        client = connected;
        lastClient = connected;
        if (retired || closed || checkout.signal.aborted) {
          retire();
          throw unavailable();
        }
        connected.on("error", retire);
        return connected;
      });
      let acquired = false;
      try {
        await checkout.run(() => pending);
        acquired = true;
        checkout.close();
        const query = async (
          sql: string,
          parameters: readonly string[],
          querySignal?: AbortSignal,
        ) => {
          const rollback = sql === "ROLLBACK" && step > 0 && !safe;
          if (
            retired ||
            safe ||
            querying ||
            !client ||
            (!rollback && sql !== commands[step]) ||
            (sql === commands[4]
              ? parameters.length !== 2 ||
                parameters.some((id) => !z.uuid().safeParse(id).success)
              : parameters.length !== 0)
          ) {
            retire();
            throw unavailable();
          }
          const queryBoundary = createRequestBoundary(
            rollback ? 1000 : 5000,
            querySignal ?? boundary.signal,
          );
          const abort = () => retire();
          queryBoundary.signal.addEventListener("abort", abort, { once: true });
          querying = true;
          try {
            const result = await queryBoundary.run(() =>
              client!.query(sql, [...parameters]),
            );
            boundary.assertCurrent();
            if (retired) throw unavailable();
            if (rollback || sql === "COMMIT") safe = true;
            else step++;
            return { rows: result.rows as Record<string, unknown>[] };
          } catch (error) {
            // Only two reviewed SQL denials retain a lease long enough for bounded rollback.
            const denial = error as { code?: string; message?: string };
            if (
              !retired &&
              sql === commands[4] &&
              denial.code === "42501" &&
              denial.message === "FORBIDDEN"
            )
              throw new PublicationCatalogError(403, "TRIP_READ_FORBIDDEN");
            if (
              !retired &&
              sql === commands[4] &&
              denial.message === "IMPORT_READ_RESOURCE_LIMIT"
            )
              throw new PublicationCatalogError(503, "IMPORT_READ_RESOURCE_LIMIT");
            retire();
            throw unavailable();
          } finally {
            querying = false;
            queryBoundary.signal.removeEventListener("abort", abort);
            queryBoundary.close();
          }
        };
        const primary = await boundary.run(() =>
          client!.query("SELECT pg_is_in_recovery() AS recovery"),
        );
        if (primary.rows.length !== 1 || primary.rows[0].recovery !== false)
          throw unavailable();
        const result = await boundary.run(() => work({ query }));
        boundary.assertCurrent();
        if (retired || !safe) throw unavailable();
        return result;
      } catch (error) {
        if (!safe) retire();
        if (error instanceof PublicationCatalogError) throw error;
        throw unavailable();
      } finally {
        checkout.close();
        boundary.signal.removeEventListener("abort", retire);
        boundary.close();
        if (client && !released) {
          client.removeListener("error", retire);
          released = true;
          client.release();
        }
        // A canceled checkout owns capacity until its late completion is destroyed.
        const finish = () => {
          occupied = false;
          retireActive = undefined;
        };
        if (acquired) finish();
        else void pending.then(finish, finish);
      }
    },
    close() {
      if (!closing) {
        closed = true;
        retireActive?.();
        if (lastClient)
          (
            lastClient as PoolClient & { connection: { stream: Duplex } }
          ).connection.stream.destroy();
        closing = pool.end().then(() => {
          if (owner === pool) owner = undefined;
        });
      }
      return closing;
    },
  };
}
