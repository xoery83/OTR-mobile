import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { session } from "./__fixtures__/tripCoreV2Sql";
import {
  withCorePgStorageTransaction,
  type CorePgConnection,
  type CorePgLease,
} from "./tripCoreV2PgStorage";

const fixture = process.env.OTR_CORE_TRANSACTION_SQL_FIXTURE;
// Disposable local PG only: tests transaction composition, not Guest publication authority.
it.skipIf(!fixture)(
  "commits or rolls back the complete caller-held PG transaction",
  async () => {
    const sql = session(fixture!);
    const hash = async (bytes: Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");
    const connection: CorePgConnection = {
      withLease: (work) => work(sql.lease),
    };
    let escaped: CorePgLease | undefined;
    try {
      await sql.lease.query("SET ROLE postgres");
      await sql.lease.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_gateway') THEN
        CREATE ROLE otr_trip_core_v2_gateway NOLOGIN;
      END IF;
    END $$`);
      await sql.lease.query("RESET ROLE");
      await sql.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      await sql.lease.query(
        "CREATE TEMP TABLE transaction_probe(id integer PRIMARY KEY)",
      );
      const count = async () =>
        (await sql.lease.query("SELECT count(*)::int AS n FROM transaction_probe"))
          .rows[0].n;
      await withCorePgStorageTransaction(connection, hash, async ({ lease }) => {
        escaped = lease;
        await lease.query("INSERT INTO transaction_probe VALUES (1)");
        await lease.query("INSERT INTO transaction_probe VALUES (2)");
      });
      expect(await count()).toBe(2);
      await expect(
        withCorePgStorageTransaction(connection, hash, async ({ lease }) => {
          await lease.query("INSERT INTO transaction_probe VALUES (3)");
          await lease.query("INSERT INTO transaction_probe VALUES (4)");
          throw Error("LATER_STEP_FAILED");
        }),
      ).rejects.toThrow("LATER_STEP_FAILED");
      expect(await count()).toBe(2);
      await expect(
        withCorePgStorageTransaction(connection, hash, async ({ lease }) => {
          await lease.query("INSERT INTO transaction_probe VALUES (5)");
          await lease.query("COMMIT").catch(() => undefined);
        }),
      ).rejects.toThrow("CORE_TRANSACTION_OWNER_REQUIRED");
      expect(await count()).toBe(2);
      for (const statement of [
        "/* note */ COMMIT",
        "-- note\nCOMMIT",
        "SELECT 1; COMMIT",
      ]) {
        await expect(
          withCorePgStorageTransaction(connection, hash, async ({ lease }) => {
            await lease.query("INSERT INTO transaction_probe VALUES (7)");
            await lease.query(statement).catch(() => undefined);
          }),
        ).rejects.toThrow("CORE_TRANSACTION_OWNER_REQUIRED");
        expect(await count()).toBe(2);
      }
      await expect(
        escaped!.query("INSERT INTO transaction_probe VALUES (6)"),
      ).rejects.toThrow("CORE_TRANSACTION_RELEASED");
      expect(await count()).toBe(2);
      expect(
        (await sql.lease.query("SELECT session_user AS principal,current_user AS role"))
          .rows[0],
      ).toEqual({
        principal: "otr_trip_core_v2_gateway",
        role: "otr_trip_core_v2_gateway",
      });
    } finally {
      sql.close();
    }
  },
  15000,
);
