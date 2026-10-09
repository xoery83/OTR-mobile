// Explicit disposable fixture only: never reads project env files or contacts Hosted.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, connect, type Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test, before, after } from "node:test";
import { Client, Pool, type PoolClient } from "pg";
import { createPublicationCatalogPgConnection } from "./tripPublicationCatalogPgConnection";
import { readPublicationCatalog } from "./tripPublicationCatalogRead";
import fixture from "../../src/data/repositories/__fixtures__/tripImportCatalogs.json";
const host = "otr-r2-sql-20261009";
assert.equal(
  process.env.OTR_R2_DISPOSABLE_SQL,
  host,
  "explicit isolated fixture authorization required",
);
const ca = readFileSync("/r2-tls/server.crt", "utf8");
const settings = {
  host,
  port: 5432,
  database: "postgres",
  password: "otr_r2_local_fixture",
  ca,
};
const admin = new Client({
  ...settings,
  user: "supabase_admin",
  ssl: { ca, rejectUnauthorized: true },
});
const originalConnect = Pool.prototype.connect;
let leased: PoolClient & { processID: number; connection: { stream: Socket } };
let instrument: ((client: PoolClient) => void) | undefined;
// Real pg Pool/client/socket throughout; instrument only the test's response-loss boundary.
Pool.prototype.connect = function (): any {
  return (originalConnect as unknown as (this: Pool) => Promise<PoolClient>)
    .call(this)
    .then((client: any) => {
      leased = client;
      instrument?.(client);
      return client;
    });
};
before(async () => {
  await admin.connect();
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'otr_trip_source_command_gateway') THEN CREATE ROLE otr_trip_source_command_gateway LOGIN PASSWORD 'otr_r2_local_fixture'; END IF; END $$",
  );
  await admin.query(
    `CREATE OR REPLACE FUNCTION public.trip_source_read_import_catalogs(actor uuid, trip uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '${JSON.stringify(fixture)}'::jsonb $$`,
  );
  await admin.query(
    "GRANT EXECUTE ON FUNCTION public.trip_source_read_import_catalogs(uuid,uuid) TO otr_trip_source_command_gateway",
  );
});
after(async () => {
  Pool.prototype.connect = originalConnect;
  await admin.end();
});
const read = (
  connection: ReturnType<typeof createPublicationCatalogPgConnection>,
  signal = new AbortController().signal,
) =>
  readPublicationCatalog(connection, fixture.actor_account_id, fixture.trip_id, signal);
const rejection = (e: any) =>
  e.status === 503 &&
  e.code === "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE" &&
  e.message === "Publication catalog read is unavailable.";
async function gone(pid: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await admin.query("SELECT pid FROM pg_stat_activity WHERE pid=$1", [
      pid,
    ]);
    if (!result.rowCount) return;
    await delay(20);
  }
  assert.fail("retired physical PostgreSQL backend survived");
}
async function proxy() {
  const sockets = new Set<Socket>();
  let block = false;
  const server = createServer((downstream) => {
    const upstream = connect({ host, port: 5432 });
    sockets.add(upstream);
    sockets.add(downstream);
    downstream.pipe(upstream);
    upstream.on("data", (chunk) => {
      if (!block) downstream.write(chunk);
    });
    downstream.on("close", () => {
      upstream.destroy();
      sockets.delete(downstream);
    });
    upstream.on("close", () => {
      downstream.destroy();
      sockets.delete(upstream);
    });
    downstream.on("error", () => upstream.destroy());
    upstream.on("error", () => downstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    block: () => {
      block = true;
    },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
test("real TLS identity/read-only transaction and same physical lease reuse", async () => {
  const observed: { sql: string; pid: number }[] = [];
  instrument = (client) => {
    const query = client.query.bind(client) as any;
    client.query = (async (sql: string, params?: any) => {
      observed.push({ sql, pid: leased.processID });
      if (sql.includes("session_user")) {
        const identity = await query(
          "SELECT session_user AS principal, current_user, current_setting('transaction_read_only') AS readonly, pg_backend_pid() AS pid",
        );
        assert.deepEqual(identity.rows, [
          {
            principal: "otr_trip_source_command_gateway",
            current_user: "otr_trip_source_command_gateway",
            readonly: "on",
            pid: leased.processID,
          },
        ]);
        return identity;
      }
      return query(sql, params);
    }) as any;
  };
  const connection = createPublicationCatalogPgConnection(settings);
  try {
    const result = await read(connection);
    assert.deepEqual(JSON.parse(result), fixture);
    const pid = leased.processID;
    assert.equal(leased.connection.stream.destroyed, false);
    instrument = undefined;
    await read(connection);
    assert.equal(leased.processID, pid);
    assert.equal(new Set(observed.map((row) => row.pid)).size, 1);
    assert.ok(observed.some((row) => row.sql === "COMMIT"));
  } finally {
    await connection.close();
    instrument = undefined;
  }
});
test("real wrong principal and missing connection fail closed", async () => {
  instrument = (client) => {
    const query = client.query.bind(client) as any;
    client.query = ((sql: string, params?: any) =>
      query(
        sql.includes("session_user") ? "SELECT 'wrong' AS principal" : sql,
        params,
      )) as any;
  };
  const connection = createPublicationCatalogPgConnection(settings);
  try {
    await assert.rejects(read(connection), rejection);
    assert.equal(leased.connection.stream.destroyed, false);
    await assert.rejects(
      readPublicationCatalog(
        undefined,
        fixture.actor_account_id,
        fixture.trip_id,
        new AbortController().signal,
      ),
      rejection,
    );
  } finally {
    await connection.close();
    instrument = undefined;
  }
});
test("actual TLS rejects untrusted chain and trusted wrong hostname", async () => {
  instrument = undefined;
  const connection = createPublicationCatalogPgConnection({ ...settings, ca: undefined });
  try {
    await assert.rejects(read(connection), rejection);
  } finally {
    await connection.close();
  }
  const wire = await proxy();
  const wrongName = createPublicationCatalogPgConnection({
    ...settings,
    host: "127.0.0.1",
    port: wire.port,
  });
  try {
    await assert.rejects(read(wrongName), rejection);
  } finally {
    await wrongName.close();
    await wire.close();
  }
});
for (const phase of [
  "BEGIN",
  "session_user",
  "trip_source_read_import_catalogs",
  "COMMIT",
  "ROLLBACK",
  "cancel",
]) {
  test(
    `real encrypted lost ${phase} response destroys physical socket and backend; next request gets a fresh lease`,
    { timeout: 12000 },
    async () => {
      const wire = await proxy();
      let reached!: () => void;
      const waiting = new Promise<void>((resolve) => {
        reached = resolve;
      });
      instrument = (client) => {
        const query = client.query.bind(client) as any;
        client.query = ((sql: string, params?: any) => {
          if (phase === "ROLLBACK" && sql.includes("session_user"))
            return query("SELECT 'wrong' AS principal");
          if (
            phase === "COMMIT" || phase === "ROLLBACK"
              ? sql === phase
              : sql.includes(
                  phase === "cancel" ? "trip_source_read_import_catalogs" : phase,
                )
          ) {
            wire.block();
            reached();
          }
          return query(sql, params);
        }) as any;
      };
      const connection = createPublicationCatalogPgConnection({
        ...settings,
        host: "localhost",
        port: wire.port,
      });
      try {
        const controller = new AbortController();
        const rejected = assert.rejects(read(connection, controller.signal), rejection);
        await waiting;
        const pid = leased.processID;
        const socket = leased.connection.stream;
        await assert.rejects(read(connection), rejection); // max1: no queued catalog request
        await delay(30);
        const state = await admin.query(
          "SELECT state, xact_start FROM pg_stat_activity WHERE pid=$1",
          [pid],
        );
        assert.equal(state.rowCount, 1);
        assert.equal(
          state.rows[0].state,
          phase === "COMMIT" || phase === "ROLLBACK" ? "idle" : "idle in transaction",
        );
        if (phase === "cancel") controller.abort();
        await rejected;
        assert.equal(socket.destroyed, true);
        await gone(pid);
        instrument = undefined;
        await connection.close();
        const fresh = createPublicationCatalogPgConnection(settings);
        try {
          await read(fresh);
          assert.notEqual(leased.processID, pid);
        } finally {
          await fresh.close();
        }
      } finally {
        await connection.close();
        instrument = undefined;
        await wire.close();
      }
    },
  );
}
test(
  "real checkout handshake stalls are bounded to1s and physically close",
  { timeout: 5000 },
  async () => {
    let peer: Socket | undefined;
    const server = createServer((socket) => {
      peer = socket;
      socket.resume();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const connection = createPublicationCatalogPgConnection({
      ...settings,
      host: "localhost",
      port: (server.address() as { port: number }).port,
    });
    const started = Date.now();
    try {
      await assert.rejects(read(connection), rejection);
      assert.ok(Date.now() - started < 1500);
      for (let i = 0; i < 50 && !peer?.destroyed; i++) await delay(20);
      assert.equal(peer?.destroyed, true);
    } finally {
      await connection.close();
      peer?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
test(
  "actual completed COMMIT arriving late cannot reuse its retired physical lease",
  { timeout: 12000 },
  async () => {
    let late!: () => void;
    let reached!: () => void;
    const delayed = new Promise<void>((resolve) => {
      late = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      reached = resolve;
    });
    instrument = (client) => {
      const query = client.query.bind(client) as any;
      client.query = (async (sql: string, params?: any) => {
        const result = await query(sql, params);
        if (sql === "COMMIT") {
          reached();
          await delayed;
        }
        return result;
      }) as any;
    };
    const connection = createPublicationCatalogPgConnection(settings);
    try {
      const rejected = assert.rejects(read(connection), rejection);
      await waiting;
      const pid = leased.processID;
      const socket = leased.connection.stream;
      await rejected;
      assert.equal(socket.destroyed, true);
      await gone(pid);
      late();
      await delay(50);
      instrument = undefined;
      await read(connection);
      assert.notEqual(leased.processID, pid);
    } finally {
      late();
      await connection.close();
      instrument = undefined;
    }
  },
);
test("actual failed rollback destroys the physical backend", async () => {
  instrument = (client) => {
    const query = client.query.bind(client) as any;
    client.query = ((sql: string, params?: any) =>
      query(
        sql.includes("session_user")
          ? "SELECT 'wrong' AS principal"
          : sql === "ROLLBACK"
            ? "SELECT 1/0"
            : sql,
        params,
      )) as any;
  };
  const connection = createPublicationCatalogPgConnection(settings);
  try {
    await assert.rejects(read(connection), rejection);
    assert.equal(leased.connection.stream.destroyed, true);
    await gone(leased.processID);
  } finally {
    await connection.close();
    instrument = undefined;
  }
});
test("real SQL authorization denial rolls back and returns only its finite code", async () => {
  instrument = undefined;
  await admin.query(
    "CREATE OR REPLACE FUNCTION public.trip_source_read_import_catalogs(actor uuid, trip uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501', DETAIL='synthetic private actor'; END $$",
  );
  const connection = createPublicationCatalogPgConnection(settings);
  try {
    await assert.rejects(
      read(connection),
      (error: any) =>
        error.status === 403 &&
        error.code === "TRIP_READ_FORBIDDEN" &&
        error.message === "Publication catalog read is unavailable." &&
        !("detail" in error),
    );
    assert.equal(leased.connection.stream.destroyed, false);
    const state = await admin.query(
      "SELECT state, xact_start FROM pg_stat_activity WHERE pid=$1",
      [leased.processID],
    );
    assert.equal(state.rows[0].state, "idle");
    assert.equal(state.rows[0].xact_start, null);
  } finally {
    await connection.close();
    await admin.query(
      `CREATE OR REPLACE FUNCTION public.trip_source_read_import_catalogs(actor uuid, trip uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '${JSON.stringify(fixture)}'::jsonb $$`,
    );
  }
});
