import { readFileSync } from "node:fs";
import { Client } from "pg";
import { checkServerIdentity } from "node:tls";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { createCorePgConnection } from "./tripCoreV2PgConnection";
import type { CorePgLease } from "./tripCoreV2PgStorage";

// Explicit opt-in: only an independently created loopback fixture, never hosted DEV.
const fixturePath = process.env.OTR_CORE_REUSE_LOCAL_FIXTURE;
const fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, "utf8")) : null;
const test = fixture ? it : it.skip;
let admin: Client;
let config: Parameters<typeof createCorePgConnection>[0];
beforeAll(async () => {
  if (!fixture) return;
  if (
    fixture.host !== "127.0.0.1" ||
    !/^otr_core_reuse_[a-f0-9]{8}$/.test(fixture.database) ||
    !/^[a-f0-9]{32}$/.test(fixture.marker)
  )
    throw Error("NOT_OWN_LOOPBACK_FIXTURE");
  config = {
    host: fixture.host,
    port: fixture.port,
    database: fixture.database,
    password: fixture.password,
    ca: fixture.ca,
  };
  const connection = new Client({
    ...config,
    user: "postgres",
    connectionTimeoutMillis: 3000,
    ssl: {
      rejectUnauthorized: true,
      ca: config.ca,
      checkServerIdentity: (_host, cert) => checkServerIdentity(config.host, cert),
    },
  });
  try {
    await connection.connect();
    expect((await connection.query("SELECT value FROM fixture_marker")).rows).toEqual([
      { value: fixture.marker },
    ]);
    // Cleanup may mutate roles only after this exact owned fixture is verified.
    admin = connection;
  } catch (error) {
    await connection.end();
    throw error;
  }
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (!admin) return;
  await admin.query("ALTER ROLE otr_trip_core_v2_gateway LOGIN VALID UNTIL 'infinity'");
  await admin.query("GRANT SELECT ON private_rows TO otr_trip_core_v2_gateway");
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND usename='otr_trip_core_v2_gateway'",
  );
});
afterAll(async () => {
  if (admin) await admin.end();
});

async function pid(lease: CorePgLease) {
  return (await lease.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
}

test("real TLS reuse clears Actor, role, temp/prepared state and advisory locks", async () => {
  const connection = createCorePgConnection(config);
  const first = await connection.withLease(async (a) => {
    await a.query("BEGIN");
    const first = await pid(a);
    await a.query("SELECT set_config('otr.core.actor','A',false)");
    expect((await a.query("SELECT value FROM private_rows")).rows).toEqual([
      { value: "private-A" },
    ]);
    await a.query("CREATE TEMP TABLE actor_secret(value text)");
    await a.query("PREPARE actor_statement AS SELECT 1");
    await a.query("SELECT pg_advisory_lock(19670101)");
    await a.query("SET ROLE otr_core_reuse_writer");
    await a.query("COMMIT");
    return first;
  });
  await connection.withLease(async (b) => {
    await b.query("BEGIN");
    expect(await pid(b)).toBe(first);
    expect(
      (
        await b.query(
          "SELECT current_user AS role, current_setting('otr.core.actor',true) AS actor, current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock, current_setting('idle_in_transaction_session_timeout') AS idle",
        )
      ).rows[0],
    ).toEqual({
      role: "otr_trip_core_v2_gateway",
      actor: "",
      statement: "5s",
      lock: "1s",
      idle: "5s",
    });
    expect(
      (
        await b.query(
          "SELECT to_regclass('pg_temp.actor_secret') AS temp, (SELECT count(*)::int FROM pg_prepared_statements WHERE name='actor_statement') AS prepared",
        )
      ).rows[0],
    ).toEqual({ temp: null, prepared: 0 });
    expect((await b.query("SELECT value FROM private_rows")).rows).toEqual([]);
    await b.query("SELECT set_config('otr.core.actor','B',true)");
    expect((await b.query("SELECT value FROM private_rows")).rows).toEqual([
      { value: "private-B" },
    ]);
    await b.query("COMMIT");
  });
  expect(
    (await admin.query("SELECT pg_try_advisory_lock(19670101) AS acquired")).rows[0]
      .acquired,
  ).toBe(true);
  await admin.query("SELECT pg_advisory_unlock(19670101)");
});

test("old lease cannot query or retire a new borrower of the same backend", async () => {
  const c = createCorePgConnection(config);
  let old!: CorePgLease;
  const first = await c.withLease(async (a) => {
    old = a;
    await a.query("BEGIN");
    const p = await pid(a);
    await a.query("COMMIT");
    return p;
  });
  await c.withLease(async (b) => {
    await b.query("BEGIN");
    old.retire();
    await expect(old.query("SELECT 1")).rejects.toThrow("CORE_CONNECTION_RETIRED");
    expect(await pid(b)).toBe(first);
    await b.query("COMMIT");
  });
});

test("failed and unfinished transactions destroy the connection and roll back", async () => {
  const c = createCorePgConnection(config);
  let first: unknown;
  await expect(
    c.withLease(async (a) => {
      await a.query("BEGIN");
      first = await pid(a);
      await a.query("SELECT set_config('otr.core.actor','A',true)");
      await a.query("UPDATE private_rows SET value='must-rollback'");
      throw Error("synthetic work failure");
    }),
  ).rejects.toThrow("synthetic work failure");
  expect(
    (await admin.query("SELECT value FROM private_rows WHERE actor='A'")).rows[0].value,
  ).toBe("private-A");
  await expect(
    c.withLease(async (a) => {
      await a.query("BEGIN");
      expect(await pid(a)).not.toBe(first);
    }),
  ).rejects.toThrow("CORE_TRANSACTION_UNFINISHED");
});

test("NOLOGIN is rechecked on a warm connection before business work", async () => {
  const c = createCorePgConnection(config);
  await c.withLease(async (a) => {
    await a.query("BEGIN");
    await a.query("COMMIT");
  });
  await admin.query("ALTER ROLE otr_trip_core_v2_gateway NOLOGIN");
  const work = vi.fn();
  await expect(c.withLease(work)).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
  expect(work).not.toHaveBeenCalled();
});

test("revoked SQL permission fails without successful mutation", async () => {
  const c = createCorePgConnection(config);
  await admin.query("REVOKE SELECT ON private_rows FROM otr_trip_core_v2_gateway");
  await expect(
    c.withLease(async (a) => {
      await a.query("BEGIN");
      await a.query("SELECT * FROM private_rows");
      await a.query("COMMIT");
    }),
  ).rejects.toMatchObject({ code: "42501" });
});

test("a real backend termination during reset preserves the committed result", async () => {
  const c = createCorePgConnection(config);
  let first: unknown;
  let injected = false;
  const original = Client.prototype.query;
  vi.spyOn(Client.prototype, "query").mockImplementation(function (
    this: Client,
    ...args: unknown[]
  ) {
    if (args[0] === "DISCARD ALL" && !injected) {
      injected = true;
      return admin
        .query("SELECT pg_terminate_backend($1)", [first])
        .then(() => Reflect.apply(original, this, args));
    }
    return Reflect.apply(original, this, args);
  } as typeof original);
  expect(
    await c.withLease(async (a) => {
      await a.query("BEGIN");
      first = await pid(a);
      await a.query("COMMIT");
      return "committed-receipt";
    }),
  ).toBe("committed-receipt");
  expect(injected).toBe(true);
  vi.restoreAllMocks();
  await c.withLease(async (b) => {
    await b.query("BEGIN");
    expect(await pid(b)).not.toBe(first);
    await b.query("COMMIT");
  });
});

test("untrusted TLS is rejected before the owning callback", async () => {
  const c = createCorePgConnection({ ...config, ca: undefined });
  const work = vi.fn();
  await expect(c.withLease(work)).rejects.toThrow();
  expect(work).not.toHaveBeenCalled();
});

test("real query timeout destroys the failed connection before another actor", async () => {
  const c = createCorePgConnection(config);
  let first: unknown;
  await expect(
    c.withLease(async (a) => {
      await a.query("BEGIN");
      first = await pid(a);
      await a.query("SELECT pg_sleep(6)");
      await a.query("COMMIT");
    }),
  ).rejects.toThrow(/statement timeout|Query read timeout/);
  await c.withLease(async (b) => {
    await b.query("BEGIN");
    expect(await pid(b)).not.toBe(first);
    await b.query("COMMIT");
  });
}, 10000);

test("VALID UNTIL expiry is rechecked on a warm LOGIN before business work", async () => {
  const c = createCorePgConnection(config);
  await c.withLease(async (a) => {
    await a.query("BEGIN");
    await a.query("COMMIT");
  });
  await admin.query(
    "ALTER ROLE otr_trip_core_v2_gateway VALID UNTIL '2000-01-01 00:00:00+00'",
  );
  const work = vi.fn();
  await expect(c.withLease(work)).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
  expect(work).not.toHaveBeenCalled();
});
