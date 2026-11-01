import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { Client } from "pg";
import { checkServerIdentity } from "node:tls";
import { createCorePgConnection } from "../../backend/src/tripCoreV2PgConnection";
import { createCorePgReader } from "../../backend/src/tripCoreV2PgRead";
import type { CorePgConnection } from "../../backend/src/tripCoreV2PgStorage";

// Only an owned loopback fixture; never run this setup against Hosted DEV.
const [configPath, fixturePath, metadataPath, resultPath] = process.argv.slice(2);
assert(
  configPath && fixturePath && metadataPath && resultPath,
  "FOUR_FIXTURE_PATHS_REQUIRED",
);
const f = JSON.parse(readFileSync(configPath, "utf8"));
assert(f.host === "127.0.0.1" && /^otr_core_reuse_[a-f0-9]{8}$/.test(f.database));
assert(/^[a-f0-9]{32}$/.test(f.marker));
const config = {
  host: f.host,
  port: f.port,
  database: f.database,
  password: f.password,
  ca: f.ca,
};
const admin = new Client({
  ...config,
  user: "postgres",
  connectionTimeoutMillis: 3000,
  ssl: {
    rejectUnauthorized: true,
    ca: f.ca,
    checkServerIdentity: (_host, cert) => checkServerIdentity(config.host, cert),
  },
});
const meta = JSON.parse(readFileSync(metadataPath, "utf8"));
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
await admin.connect();
assert.deepEqual((await admin.query("SELECT value FROM fixture_marker")).rows, [
  { value: f.marker },
]);
const a = meta.actor,
  b = { ...a, accountId: randomUUID(), personId: randomUUID(), personIds: [] };
const quoted = (v: unknown) => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
const phases: unknown[] = [];
const originalInfo = console.info;
console.info = (v: unknown) => {
  if (typeof v === "string" && v.includes("core_authorized_version_projection"))
    phases.push(JSON.parse(v));
  else originalInfo(v);
};
try {
  const setup = readFileSync(fixturePath, "utf8").split("BEGIN READ ONLY;")[0];
  await admin.query(setup);
  // These are synthetic authority stand-ins, not a production ACL/RLS qualification.
  await admin.query(`CREATE ROLE otr_trip_core_v2_writer NOLOGIN; GRANT otr_trip_core_v2_writer TO otr_trip_core_v2_gateway;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO otr_trip_core_v2_writer,otr_trip_core_v2_gateway;
    CREATE TABLE trip_core_read_state(trip_id uuid PRIMARY KEY,epoch uuid,revision bigint,access_revision bigint);
    CREATE TABLE trip_core_activation_gate(singleton boolean,runtime_enabled boolean);
    INSERT INTO trip_core_activation_gate VALUES(true,true);
    CREATE FUNCTION trip_core_finite_scope_allowed(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT $2=current_setting(''otr.core.trip'')::uuid';
    CREATE FUNCTION trip_core_lock_actor_scope(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT CASE WHEN $1='${a.accountId}'::uuid AND $2='${a.tripId}'::uuid THEN ${quoted(a)} WHEN $1='${b.accountId}'::uuid AND $2='${a.tripId}'::uuid THEN ${quoted(b)} ELSE NULL END $$;
    CREATE FUNCTION trip_core_read_person_bindings(uuid,uuid) RETURNS jsonb LANGUAGE sql AS 'SELECT ''[]''::jsonb';
    GRANT SELECT ON trip_core_read_state,trip_core_activation_gate TO otr_trip_core_v2_gateway;`);
  await admin.query("INSERT INTO trip_core_read_state VALUES($1,$2,1,1)", [
    a.tripId,
    meta.epoch,
  ]);
  const connection = createCorePgConnection(config);
  let queries = 0,
    bytes = 0;
  const pids: number[] = [];
  const measured: CorePgConnection = {
    withLease: (work) =>
      connection.withLease(async (lease) => {
        const pid = (await lease.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        assert(typeof pid === "number" && Number.isSafeInteger(pid));
        pids.push(pid);
        return work({
          retire: () => lease.retire(),
          query: async (sql, args) => {
            queries++;
            const r = await lease.query(sql, args);
            bytes += Buffer.byteLength(JSON.stringify(r.rows));
            return r;
          },
        });
      }),
  };
  const reader = createCorePgReader(measured, hash);
  const samples: unknown[] = [];
  async function read(label: string, account = a.accountId) {
    const q = queries,
      z = bytes,
      t = performance.now();
    const v = await reader.authorizedVersion(account, a.tripId);
    samples.push({
      label,
      ms: +(performance.now() - t).toFixed(2),
      queries: queries - q,
      resultBytes: bytes - z,
    });
    return v;
  }
  const initial = await read("cold");
  for (let i = 0; i < 4; i++) assert.deepEqual(await read("warm"), initial);
  assert(
    pids.every((pid) => pid === pids[0]),
    "POOL_MUST_REUSE_PID",
  );
  const privateId = randomUUID();
  const template = (
    await admin.query("SELECT to_jsonb(e) AS row FROM itinerary_events e LIMIT 1")
  ).rows[0].row;
  const privateRow = {
    ...template,
    id: privateId,
    owner_account_id: b.accountId,
    visibility: "PRIVATE",
  };
  await admin.query(
    "INSERT INTO itinerary_events SELECT * FROM jsonb_populate_record(NULL::itinerary_events,$1)",
    [JSON.stringify(privateRow)],
  );
  const visibleBefore = await read("hidden_create_A");
  assert.deepEqual(visibleBefore, initial, "HIDDEN_CREATE_MUST_NOT_CHANGE_A_TOKEN");
  const ownBefore = await read("owner_B", b.accountId);
  await admin.query(
    "UPDATE itinerary_events SET semantic_revision=semantic_revision+1 WHERE id=$1",
    [privateId],
  );
  assert.deepEqual(
    await read("hidden_edit_A"),
    initial,
    "HIDDEN_EDIT_MUST_NOT_CHANGE_A_TOKEN",
  );
  assert.notEqual((await read("owner_edit_B", b.accountId)).token, ownBefore.token);
  await admin.query(
    "UPDATE itinerary_events SET semantic_revision=semantic_revision+1 WHERE id=$1",
    [meta.p3ItemId],
  );
  assert.notEqual((await read("visible_P3_edit_A")).token, initial.token);
  await admin.query("UPDATE trip_core_activation_gate SET runtime_enabled=false");
  await assert.rejects(
    () => reader.authorizedVersion(a.accountId, a.tripId),
    /CORE_CAPABILITY_CLOSED/,
  );
  const result = {
    status: "ISOLATED_PG_PASS_NOT_HOSTED",
    syntheticAuthorityStandIns: true,
    externalEndpoints: false,
    source: "actual deployed reader projection + f70d69cf Core pool",
    samples,
    phases,
    physicalConnectionCount: new Set(pids).size,
    checks: [
      "warm PID reuse",
      "hidden private Create/Edit does not change A token",
      "B own private Edit changes B token",
      "visible P3 Edit changes A token",
      "closed gate rejected",
    ],
    limitations: [
      "Loopback includes Docker stdio tunnel overhead; not Hosted latency",
      "Synthetic authorization functions are not production RLS proof",
      "Authored P1/P3 only; other graphs fall back to full collection",
    ],
  };
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: result.status,
      samples,
      physicalConnectionCount: result.physicalConnectionCount,
    }),
  );
} finally {
  console.info = originalInfo;
  await admin.end();
}
