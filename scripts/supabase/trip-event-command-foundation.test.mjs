import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// Hard-bound disposable container. No remote URL/environment override or saved DB.
const container = "supabase_db_otr-trip-bt3d";
const migration = readFileSync(
  "supabase/migrations/20261004000400_trip_event_command_foundation.sql",
  "utf8",
);
const sql = (input, user = "postgres") =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      user,
      "-d",
      "postgres",
    ],
    { input, encoding: "utf8", stdio: "pipe" },
  ).trim();
const absent = () =>
  assert.equal(
    sql(
      "select to_regclass('public.trip_event_operation_receipts') is null and to_regclass('public.trip_event_command_gate') is null",
    ),
    "t",
  );
const mode = process.argv[2];
if (!["sql", "reuse", "concurrency", "codec"].includes(mode))
  throw new Error("Choose sql/reuse/concurrency/codec; isolated local container only.");
if (mode === "sql")
  test("complete native SQL suite", async (t) => {
    sql("create extension if not exists pgtap with schema extensions");
    let total = 0;
    for (const name of readdirSync("supabase/tests")
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await t.test(name, () => {
        const output = sql(
          "set search_path=public,extensions;\n" +
            readFileSync(`supabase/tests/${name}`, "utf8"),
        );
        assert.doesNotMatch(output, /(?:^|\n)\s*not ok\b/);
        const plan = [...output.matchAll(/(?:^|\n)\s*1\.\.(\d+)/g)].at(-1);
        assert.ok(plan, `missing TAP plan: ${name}`);
        const count = [...output.matchAll(/(?:^|\n)\s*ok\s+\d+\b/g)].length;
        assert.equal(count, Number(plan[1]));
        total += count;
      });
    console.log(`SQL total: ${total} assertions`);
  });
if (mode === "reuse")
  test("polluted reserved roles fail atomically; never sanitized", async (t) => {
    absent();
    for (const role of [
      "otr_trip_event_command_gateway",
      "otr_trip_event_receipt_reader",
    ])
      sql(
        `do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls; end if; end$$`,
      );
    const probe = async (
      label,
      grant,
      revoke,
      query,
      reason = "UNSAFE_TRIP_EVENT_COMMAND_GRANTS",
    ) =>
      t.test(label, () => {
        sql(grant);
        try {
          assert.equal(sql(query), "t");
          assert.throws(
            () => sql(migration),
            (e) => e.stderr.includes(reason),
          );
          absent();
          assert.equal(sql(query), "t", "fixture privilege survives failed migration");
        } finally {
          sql(revoke);
        }
      });
    for (const role of [
      "otr_trip_event_semantic_writer",
      "otr_trip_event_command_gateway",
      "otr_trip_event_receipt_reader",
    ]) {
      for (const [table, column] of [
        ["itinerary_events", "title"],
        ["itinerary_transport_endpoints", "role"],
        ["itinerary_event_participants", "participation_status"],
      ]) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"])
          await probe(
            `${role} ${table}.${column} ${privilege}`,
            `grant ${privilege}(${column}) on public.${table} to ${role}`,
            `revoke ${privilege}(${column}) on public.${table} from ${role}`,
            `select not has_table_privilege('${role}','public.${table}','${privilege}') and has_column_privilege('${role}','public.${table}','${column}','${privilege}')`,
          );
      }
      for (const privilege of ["DELETE", "TRUNCATE", "TRIGGER"])
        await probe(
          `${role} table ${privilege}`,
          `grant ${privilege} on public.itinerary_events to ${role}`,
          `revoke ${privilege} on public.itinerary_events from ${role}`,
          `select has_table_privilege('${role}','public.itinerary_events','${privilege}')`,
        );
      await probe(
        `${role} unexpected LOGIN`,
        `alter role ${role} login`,
        `alter role ${role} nologin`,
        `select rolcanlogin from pg_roles where rolname='${role}'`,
        "UNSAFE_TRIP_EVENT_COMMAND_ROLE",
      );
    }
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"])
      await probe(
        `PUBLIC effective ${privilege}`,
        `grant ${privilege}(title) on public.itinerary_events to public`,
        `revoke ${privilege}(title) on public.itinerary_events from public`,
        `select has_column_privilege('otr_trip_event_command_gateway','public.itinerary_events','title','${privilege}')`,
      );
    sql(
      "create role otr_bt3d_donor nologin; grant update(title) on public.itinerary_events to otr_bt3d_donor",
    );
    try {
      await probe(
        "inherited column grant",
        "grant otr_bt3d_donor to otr_trip_event_command_gateway with inherit true,set false",
        "revoke otr_bt3d_donor from otr_trip_event_command_gateway",
        "select has_column_privilege('otr_trip_event_command_gateway','public.itinerary_events','title','UPDATE')",
        "UNSAFE_TRIP_EVENT_COMMAND_ROLE",
      );
    } finally {
      sql(
        "revoke update(title) on public.itinerary_events from otr_bt3d_donor; drop role otr_bt3d_donor",
      );
    }
    await probe(
      "PUBLIC new-table default SELECT",
      "alter default privileges in schema public grant select on tables to public",
      "alter default privileges in schema public revoke select on tables from public",
      "select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclrole=current_user::regrole and d.defaclnamespace='public'::regnamespace and a.grantee=0 and a.privilege_type='SELECT')",
      "UNSAFE_TRIP_EVENT_COMMAND_DEFAULT_GRANTS",
    );
    sql(
      "create schema bt3d_hostile; create sequence bt3d_hostile.probe_seq; create role otr_bt3d_exec_donor nologin; create function bt3d_hostile.open_gate() returns void language plpgsql security definer set search_path=pg_catalog as $$begin execute 'alter table public.trip_event_command_gate drop constraint trip_event_gate_closed'; execute 'update public.trip_event_command_gate set enabled=true'; end$$; revoke all on function bt3d_hostile.open_gate() from public; grant usage on schema bt3d_hostile to public",
    );
    try {
      for (const role of [
        "otr_trip_event_semantic_writer",
        "otr_trip_event_command_gateway",
        "otr_trip_event_receipt_reader",
      ]) {
        await probe(
          `${role} hostile direct EXECUTE`,
          `grant execute on function bt3d_hostile.open_gate() to ${role}`,
          `revoke execute on function bt3d_hostile.open_gate() from ${role}`,
          `select has_function_privilege('${role}','bt3d_hostile.open_gate()','EXECUTE')`,
          "UNSAFE_TRIP_EVENT_COMMAND_CAPABILITY",
        );
        await probe(
          `${role} hostile PUBLIC EXECUTE`,
          "grant execute on function bt3d_hostile.open_gate() to public",
          "revoke execute on function bt3d_hostile.open_gate() from public",
          `select has_function_privilege('${role}','bt3d_hostile.open_gate()','EXECUTE')`,
          "UNSAFE_TRIP_EVENT_COMMAND_CAPABILITY",
        );
        await probe(
          `${role} inherited hostile EXECUTE`,
          `grant execute on function bt3d_hostile.open_gate() to otr_bt3d_exec_donor; grant otr_bt3d_exec_donor to ${role} with inherit true,set false`,
          `revoke otr_bt3d_exec_donor from ${role}; revoke execute on function bt3d_hostile.open_gate() from otr_bt3d_exec_donor`,
          `select has_function_privilege('${role}','bt3d_hostile.open_gate()','EXECUTE')`,
          "UNSAFE_TRIP_EVENT_COMMAND_ROLE",
        );
        await probe(
          `${role} other-schema CREATE`,
          `grant create on schema bt3d_hostile to ${role}`,
          `revoke create on schema bt3d_hostile from ${role}`,
          `select has_schema_privilege('${role}','bt3d_hostile','CREATE')`,
          "UNSAFE_TRIP_EVENT_COMMAND_ROLE",
        );
        await probe(
          `${role} inherited other-schema CREATE`,
          `grant create on schema bt3d_hostile to otr_bt3d_exec_donor; grant otr_bt3d_exec_donor to ${role} with inherit true,set false`,
          `revoke otr_bt3d_exec_donor from ${role}; revoke create on schema bt3d_hostile from otr_bt3d_exec_donor`,
          `select has_schema_privilege('${role}','bt3d_hostile','CREATE')`,
          "UNSAFE_TRIP_EVENT_COMMAND_ROLE",
        );
        await probe(
          `${role} application sequence USAGE`,
          `grant usage on sequence bt3d_hostile.probe_seq to ${role}`,
          `revoke usage on sequence bt3d_hostile.probe_seq from ${role}`,
          `select has_sequence_privilege('${role}','bt3d_hostile.probe_seq','USAGE')`,
          "UNSAFE_TRIP_EVENT_COMMAND_CAPABILITY",
        );
        await probe(
          `${role} default routine EXECUTE`,
          `alter default privileges in schema public grant execute on functions to ${role}`,
          `alter default privileges in schema public revoke execute on functions from ${role}`,
          `select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclrole=current_user::regrole and d.defaclobjtype='f' and a.grantee='${role}'::regrole)`,
          "UNSAFE_TRIP_EVENT_COMMAND_DEFAULT_GRANTS",
        );
      }
      await probe(
        "PUBLIC new-routine default EXECUTE",
        "alter default privileges in schema public grant execute on functions to public",
        "alter default privileges in schema public revoke execute on functions from public",
        "select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclobjtype='f' and a.grantee=0)",
        "UNSAFE_TRIP_EVENT_COMMAND_DEFAULT_GRANTS",
      );
    } finally {
      sql("drop schema bt3d_hostile cascade; drop role otr_bt3d_exec_donor");
    }
    await t.test("clean exact role reservation installs closed", () => {
      sql(migration);
      assert.equal(sql("select not enabled from public.trip_event_command_gate"), "t");
    });
  });
if (mode === "codec")
  test("PostgreSQL/Backend canonical bytes and hashes match", async () => {
    const { eventIntentCodec, canonicalEventJson, canonicalCoordinate } =
      await import("../../backend/src/tripEventIntent.ts");
    for (const [limit, values] of [
      [
        90,
        [
          "90",
          "-90",
          "89.999999999999999",
          "-89.999999999999999",
          "90.000000000000001",
          "-90.000000000000001",
        ],
      ],
      [
        180,
        [
          "180",
          "-180",
          "179.99999999999999",
          "-179.99999999999999",
          "180.00000000000001",
          "-180.00000000000001",
        ],
      ],
    ]) {
      for (const value of [
        ...values,
        "-0",
        "01",
        "1.0",
        "1e0",
        "+1",
        "NaN",
        "0.123456789012345678",
      ]) {
        const accepted =
          !value.includes(".0000000000000") &&
          !["-0", "01", "1.0", "1e0", "+1", "NaN", "0.123456789012345678"].includes(
            value,
          );
        if (accepted) {
          assert.equal(canonicalCoordinate(value, limit), value);
          assert.equal(
            Number(sql(`select public.trip_event_coordinate('${value}',${limit})`)),
            Number(value),
          );
        } else {
          assert.throws(() => canonicalCoordinate(value, limit));
          assert.throws(() =>
            sql(`select public.trip_event_coordinate('${value}',${limit})`),
          );
        }
      }
    }
    const envelope = {
      contractVersion: 1,
      intentVersion: 1,
      command: "CREATE_EVENT",
      commandVersion: 1,
      operationKey: "00000000-0000-4000-8000-000000000006",
      actorAccountId: "00000000-0000-4000-8000-000000000001",
      tripId: "00000000-0000-4000-8000-000000000003",
      eventId: "00000000-0000-4000-8000-000000000005",
      baseSemanticRevision: null,
      payload: {},
    };
    for (const payload of [
      { a: "雪\n🚆", z: [2, 1], clear: null },
      {},
      { empty: null },
      { text: '\b\t\n\f\r"\\/\u000b\u2028' },
      { coordinate: { latitude: "-36.848461", longitude: "174.763336" } },
      { text: '\u0000\b\t\n\f\r"\\/\u2028' },
    ]) {
      const raw = JSON.stringify({ ...envelope, payload });

      // PostgreSQL text cannot retain U+0000; reject it at Backend ingress too.
      if (raw.includes("\\u0000")) {
        assert.throws(() =>
          sql(
            `select public.trip_event_canonical_json('${raw.replaceAll("'", "''")}'::json)`,
          ),
        );
        assert.throws(() => eventIntentCodec(raw));
        continue;
      }
      const encoded = eventIntentCodec(raw);
      assert.equal(
        sql(
          `select public.trip_event_canonical_json('${raw.replaceAll("'", "''")}'::json)`,
        ),
        encoded.canonical,
      );
      const bound = canonicalEventJson({
        ...encoded.envelope,
        encoding: "otr-event-intent-v1",
      });
      assert.equal(
        sql(
          `select encode(extensions.digest(convert_to('${bound.replaceAll("'", "''")}','UTF8'),'sha256'),'hex')`,
        ),
        encoded.intentSha256,
      );
    }
  });
if (mode === "concurrency")
  test("real concurrent CAS, isolation gate fence and timezone replay", async (t) => {
    const actor = "00000000-0000-4000-8000-000000000001",
      trip = "10000000-0000-4000-8000-000000000001",
      event = "bd900000-0000-4000-8000-000000000001";
    const intent = (command, op, base, payload) =>
      JSON.stringify({
        contractVersion: 1,
        intentVersion: 1,
        command,
        commandVersion: 1,
        operationKey: `bd900000-0000-4000-8000-${String(op).padStart(12, "0")}`,
        actorAccountId: actor,
        tripId: trip,
        eventId: event,
        baseSemanticRevision: base,
        payload,
      });
    const call = (command, op, base, payload) =>
      `select public.trip_event_${command.toLowerCase()}('${actor}','${trip}','bd900000-0000-4000-8000-${String(op).padStart(12, "0")}','${event}',${command === "CREATE_EVENT" ? "" : `${base},`}'${intent(command, op, base, payload).replaceAll("'", "''")}')`;
    // Opening fixture is confined to this disposable DB. Final cleanup closes it;
    // two later full resets prove no fixture/grant/bypass enters installed schema.
    sql(`alter table public.trip_event_command_gate drop constraint trip_event_gate_closed; update public.trip_event_command_gate set enabled=true;
 grant select,insert,update on public.itinerary_events to otr_trip_event_semantic_writer;
 grant select,update(id) on public.trips,public.trip_members,public.journey_members,public.trip_days,public.places to otr_trip_event_semantic_writer;
 create policy bt3d_concurrent_parent on public.itinerary_events to otr_trip_event_semantic_writer using(true) with check(true);
 create policy bt3d_concurrent_trip on public.trips to otr_trip_event_semantic_writer using(true) with check(true);
 create policy bt3d_concurrent_member on public.trip_members to otr_trip_event_semantic_writer using(true) with check(true);
 create policy bt3d_concurrent_person on public.journey_members to otr_trip_event_semantic_writer using(true) with check(true);
 alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;`);
    const parallel = (source, isolation = "READ COMMITTED", zone = "UTC") =>
      new Promise((resolve, reject) => {
        const child = spawn("docker", [
          "exec",
          "-i",
          container,
          "psql",
          "-X",
          "-qAt",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "supabase_admin",
          "-d",
          "postgres",
        ]);
        let out = "",
          err = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (err += d));
        child.on("error", reject);
        child.on("close", (code) =>
          code ? reject(new Error(err)) : resolve(out.trim()),
        );
        child.stdin.end(
          `begin isolation level ${isolation}; set local timezone='${zone}'; set local statement_timeout='5s'; set session authorization otr_trip_event_command_gateway; ${source}; commit;`,
        );
      });
    try {
      const boundary = {
        local_date: null,
        local_time: null,
        clock_precision: null,
        quality: "UNKNOWN",
        basis: "DERIVED_CIVIL",
        zone_id: null,
        supplied_offset_seconds: null,
        source_instant: null,
        source_instant_precision: null,
        fold_choice: null,
      };
      const created = await parallel(
        call("CREATE_EVENT", 1, null, {
          shape: "POINT",
          participantScope: "UNASSIGNED",
          core: { title: "Concurrent", description: null },
          time: { start: boundary },
          proofs: { "ROOT.title": { kind: "MANUAL" } },
        }),
      );
      assert.equal(JSON.parse(created).receipt.outcome, "APPLIED");
      const different = await Promise.all([
        parallel(call("UPDATE_STATUS", 2, 1, { status: "completed" })),
        parallel(call("UPDATE_STATUS", 3, 1, { status: "skipped" })),
      ]);
      assert.deepEqual(different.map((x) => JSON.parse(x).receipt.outcome).sort(), [
        "APPLIED",
        "CONFLICT",
      ]);
      const repeated = await Promise.all([
        parallel(
          call("UPDATE_CORE_TEXT", 4, 2, {
            patch: { title: "Same key" },
            proofs: { "ROOT.title": { kind: "MANUAL" } },
          }),
        ),
        parallel(
          call("UPDATE_CORE_TEXT", 4, 2, {
            patch: { title: "Same key" },
            proofs: { "ROOT.title": { kind: "MANUAL" } },
          }),
        ),
      ]);
      assert.deepEqual(repeated.map((x) => JSON.parse(x).idempotentReplay).sort(), [
        false,
        true,
      ]);
      assert.equal(
        JSON.parse(repeated[0]).receipt.receipt_sha256,
        JSON.parse(repeated[1]).receipt.receipt_sha256,
      );
      assert.equal(
        sql(`select semantic_revision from public.itinerary_events where id='${event}'`),
        "3",
      );
      await t.test(
        "timezone-independent complete historic bytes/hash after later edits",
        async () => {
          for (const zone of ["UTC", "Pacific/Auckland", "America/Los_Angeles"]) {
            const historic = JSON.parse(
              await parallel(
                `select public.trip_event_receipt_lookup('${actor}','${trip}','bd900000-0000-4000-8000-000000000001')`,
                "REPEATABLE READ",
                zone,
              ),
            );
            assert.deepEqual(historic, JSON.parse(created).receipt);
            const replay = JSON.parse(
              await parallel(
                call("CREATE_EVENT", 1, null, {
                  shape: "POINT",
                  participantScope: "UNASSIGNED",
                  core: { title: "Concurrent", description: null },
                  time: { start: boundary },
                  proofs: { "ROOT.title": { kind: "MANUAL" } },
                }),
                "SERIALIZABLE",
                zone,
              ),
            );
            assert.equal(replay.idempotentReplay, true);
            assert.deepEqual(replay.receipt, historic);
            assert.match(
              historic.committed_at,
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
            );
          }
        },
      );
      await t.test(
        "exclusive gate close fences RC waiter and rejects RR/SERIALIZABLE before locks",
        async () => {
          const closer = spawn("docker", [
            "exec",
            "-i",
            container,
            "psql",
            "-X",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "postgres",
          ]);
          let output = "",
            errors = "";
          const closed = new Promise((resolve, reject) => {
            closer.stderr.on("data", (d) => (errors += d));
            closer.on("error", reject);
            closer.on("close", (code) => (code ? reject(new Error(errors)) : resolve()));
          });
          const locked = new Promise((resolve, reject) => {
            closer.stdout.on("data", (d) => {
              output += d;
              if (output.includes("LOCKED")) resolve();
            });
            closer.on("error", reject);
          });
          closer.stdin.write(
            "begin; select pg_advisory_xact_lock(730401,1); select 'LOCKED';\n",
          );
          await locked;
          try {
            // Owner establishes the same old-snapshot premise as the review repro.
            // Gateway has no gate SELECT capability; its RR command is rejected before
            // it could wait on the activation lock, even while the gate is still true.
            for (const [isolation, op] of [
              ["REPEATABLE READ", 51],
              ["SERIALIZABLE", 52],
            ]) {
              await assert.rejects(
                parallel(
                  `select public.trip_event_receipt_lookup('${actor}','${trip}','bd900000-0000-4000-8000-000000000001'); ${call("UPDATE_STATUS", op, 3, { status: "skipped" })}`,
                  isolation,
                ),
                /UNSUPPORTED_TRANSACTION_ISOLATION/,
              );
            }
            const waiter = parallel(call("UPDATE_STATUS", 50, 3, { status: "skipped" }));
            const waiterRejected = assert.rejects(waiter, /CANONICAL_WRITES_DISABLED/);
            // Observe the real waiter at the shared activation lock, not a sleep guess.
            let waiting = false;
            for (let attempt = 0; attempt < 100; attempt++) {
              waiting =
                sql(
                  "select exists(select 1 from pg_locks where locktype='advisory' and classid=730401 and objid=1 and not granted)",
                ) === "t";
              if (waiting) break;
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.ok(waiting, "READ COMMITTED command actually waits at the gate lock");
            closer.stdin.end(
              "update public.trip_event_command_gate set enabled=false; commit;\n",
            );
            await closed;
            await waiterRejected;
            assert.equal(
              sql(
                `select semantic_revision from public.itinerary_events where id='${event}'`,
              ),
              "3",
            );
            assert.equal(
              sql(
                "select count(*) from public.trip_event_operation_receipts where operation_key in ('bd900000-0000-4000-8000-000000000050','bd900000-0000-4000-8000-000000000051','bd900000-0000-4000-8000-000000000052')",
              ),
              "0",
            );
            for (const isolation of ["REPEATABLE READ", "SERIALIZABLE"]) {
              const historic = JSON.parse(
                await parallel(
                  `select public.trip_event_receipt_lookup('${actor}','${trip}','bd900000-0000-4000-8000-000000000001')`,
                  isolation,
                ),
              );
              assert.deepEqual(historic, JSON.parse(created).receipt);
            }
          } finally {
            if (!closer.stdin.writableEnded) closer.stdin.end("rollback;\n");
            await closed;
          }
        },
      );
    } finally {
      sql(
        "begin; select pg_advisory_xact_lock(730401,1); update public.trip_event_command_gate set enabled=false; alter table public.trip_event_command_gate add constraint trip_event_gate_closed check(not enabled); alter table public.itinerary_events enable trigger itinerary_event_semantic_guard; drop policy bt3d_concurrent_parent on public.itinerary_events; drop policy bt3d_concurrent_trip on public.trips; drop policy bt3d_concurrent_member on public.trip_members; drop policy bt3d_concurrent_person on public.journey_members; revoke select,insert,update on public.itinerary_events from otr_trip_event_semantic_writer; revoke select,update(id) on public.trips,public.trip_members,public.journey_members,public.trip_days,public.places from otr_trip_event_semantic_writer; commit;",
      );
    }
  });
