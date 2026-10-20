import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
const root = "/Users/xoery/Project/otr-mobile-canonical";
assert.equal(process.cwd(), root);
const container = "supabase_db_otr-trip-ai2c2";
const migration = readFileSync(
  "supabase/migrations/20261004000600_trip_person_command_foundation.sql",
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
    { input, encoding: "utf8", stdio: "pipe", cwd: root },
  ).trim();
const absent = () =>
  assert.equal(
    sql(
      "select to_regclass('public.trip_person_participation_receipts') is null and to_regclass('public.trip_person_command_gate') is null",
    ),
    "t",
  );
const mode = process.argv[2];
if (!["reuse", "sql", "codec", "concurrency", "forward"].includes(mode))
  throw new Error("Isolated local modes only");
if (mode === "reuse")
  test("polluted reserved roles fail atomically; never sanitized", async (t) => {
    absent();
    for (const role of [
      "otr_trip_person_command_gateway",
      "otr_trip_person_receipt_reader",
    ])
      sql(
        `do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls; end if; end$$`,
      );
    const probe = async (
      label,
      grant,
      revoke,
      query,
      reason = "UNSAFE_TRIP_PERSON_COMMAND_GRANTS",
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
      "otr_trip_person_lifecycle_writer",
      "otr_trip_person_command_gateway",
      "otr_trip_person_receipt_reader",
    ]) {
      for (const [table, column] of [
        ["trip_sources", "source_kind"],
        ["trip_source_representations", "role"],
        ["trip_source_actions", "action"],
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
          `grant ${privilege} on public.trip_sources to ${role}`,
          `revoke ${privilege} on public.trip_sources from ${role}`,
          `select has_table_privilege('${role}','public.trip_sources','${privilege}')`,
        );
      await probe(
        `${role} unexpected LOGIN`,
        `alter role ${role} login`,
        `alter role ${role} nologin`,
        `select rolcanlogin from pg_roles where rolname='${role}'`,
        "UNSAFE_TRIP_PERSON_COMMAND_ROLE",
      );
    }
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"])
      await probe(
        `PUBLIC effective ${privilege}`,
        `grant ${privilege}(source_kind) on public.trip_sources to public`,
        `revoke ${privilege}(source_kind) on public.trip_sources from public`,
        `select has_column_privilege('otr_trip_person_command_gateway','public.trip_sources','source_kind','${privilege}')`,
      );
    sql(
      "create role otr_ai2c2_donor nologin; grant update(source_kind) on public.trip_sources to otr_ai2c2_donor",
    );
    try {
      await probe(
        "inherited column grant",
        "grant otr_ai2c2_donor to otr_trip_person_command_gateway with inherit true,set false",
        "revoke otr_ai2c2_donor from otr_trip_person_command_gateway",
        "select has_column_privilege('otr_trip_person_command_gateway','public.trip_sources','source_kind','UPDATE')",
        "UNSAFE_TRIP_PERSON_COMMAND_ROLE",
      );
    } finally {
      sql(
        "revoke update(source_kind) on public.trip_sources from otr_ai2c2_donor; drop role otr_ai2c2_donor",
      );
    }
    await probe(
      "PUBLIC new-table default SELECT",
      "alter default privileges in schema public grant select on tables to public",
      "alter default privileges in schema public revoke select on tables from public",
      "select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclrole=current_user::regrole and d.defaclnamespace='public'::regnamespace and a.grantee=0 and a.privilege_type='SELECT')",
      "UNSAFE_TRIP_PERSON_COMMAND_DEFAULT_GRANTS",
    );
    sql(
      "create schema ai2c2_hostile; create sequence ai2c2_hostile.probe_seq; create role otr_ai2c2_exec_donor nologin; create function ai2c2_hostile.open_gate() returns void language plpgsql security definer set search_path=pg_catalog as $$begin execute 'alter table public.trip_person_command_gate drop constraint trip_source_gate_closed'; execute 'update public.trip_person_command_gate set enabled=true'; end$$; revoke all on function ai2c2_hostile.open_gate() from public; grant usage on schema ai2c2_hostile to public",
    );
    try {
      for (const role of [
        "otr_trip_person_lifecycle_writer",
        "otr_trip_person_command_gateway",
        "otr_trip_person_receipt_reader",
      ]) {
        await probe(
          `${role} API SET ROLE path`,
          `grant ${role} to authenticated with inherit false,set true`,
          `revoke ${role} from authenticated`,
          `select exists(select 1 from pg_auth_members where roleid='${role}'::regrole and member='authenticated'::regrole and set_option)`,
          "UNSAFE_TRIP_PERSON_COMMAND_ROLE",
        );
        await probe(
          `${role} incoming SET ROLE membership`,
          `grant otr_ai2c2_exec_donor to ${role} with inherit false,set true`,
          `revoke otr_ai2c2_exec_donor from ${role}`,
          `select exists(select 1 from pg_auth_members where roleid='otr_ai2c2_exec_donor'::regrole and member='${role}'::regrole and set_option)`,
          "UNSAFE_TRIP_PERSON_COMMAND_ROLE",
        );
        await probe(
          `${role} PUBLIC other-schema CREATE`,
          "grant create on schema ai2c2_hostile to public",
          "revoke create on schema ai2c2_hostile from public",
          `select has_schema_privilege('${role}','ai2c2_hostile','CREATE')`,
          "UNSAFE_TRIP_PERSON_COMMAND_ROLE",
        );
        await probe(
          `${role} default table SELECT`,
          `alter default privileges in schema public grant select on tables to ${role}`,
          `alter default privileges in schema public revoke select on tables from ${role}`,
          `select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclobjtype='r' and a.grantee='${role}'::regrole)`,
          "UNSAFE_TRIP_PERSON_COMMAND_DEFAULT_GRANTS",
        );
        await probe(
          `${role} hostile direct EXECUTE`,
          `grant execute on function ai2c2_hostile.open_gate() to ${role}`,
          `revoke execute on function ai2c2_hostile.open_gate() from ${role}`,
          `select has_function_privilege('${role}','ai2c2_hostile.open_gate()','EXECUTE')`,
          "UNSAFE_TRIP_PERSON_COMMAND_CAPABILITY",
        );
        await probe(
          `${role} hostile PUBLIC EXECUTE`,
          "grant execute on function ai2c2_hostile.open_gate() to public",
          "revoke execute on function ai2c2_hostile.open_gate() from public",
          `select has_function_privilege('${role}','ai2c2_hostile.open_gate()','EXECUTE')`,
          "UNSAFE_TRIP_PERSON_COMMAND_CAPABILITY",
        );
        await probe(
          `${role} inherited hostile EXECUTE`,
          `grant execute on function ai2c2_hostile.open_gate() to otr_ai2c2_exec_donor; grant otr_ai2c2_exec_donor to ${role} with inherit true,set false`,
          `revoke otr_ai2c2_exec_donor from ${role}; revoke execute on function ai2c2_hostile.open_gate() from otr_ai2c2_exec_donor`,
          `select has_function_privilege('${role}','ai2c2_hostile.open_gate()','EXECUTE')`,
          "UNSAFE_TRIP_PERSON_COMMAND_ROLE",
        );
        await probe(
          `${role} other-schema CREATE`,
          `grant create on schema ai2c2_hostile to ${role}`,
          `revoke create on schema ai2c2_hostile from ${role}`,
          `select has_schema_privilege('${role}','ai2c2_hostile','CREATE')`,
          "UNSAFE_TRIP_PERSON_COMMAND_ROLE",
        );
        await probe(
          `${role} inherited other-schema CREATE`,
          `grant create on schema ai2c2_hostile to otr_ai2c2_exec_donor; grant otr_ai2c2_exec_donor to ${role} with inherit true,set false`,
          `revoke otr_ai2c2_exec_donor from ${role}; revoke create on schema ai2c2_hostile from otr_ai2c2_exec_donor`,
          `select has_schema_privilege('${role}','ai2c2_hostile','CREATE')`,
          "UNSAFE_TRIP_PERSON_COMMAND_ROLE",
        );
        await probe(
          `${role} application sequence USAGE`,
          `grant usage on sequence ai2c2_hostile.probe_seq to ${role}`,
          `revoke usage on sequence ai2c2_hostile.probe_seq from ${role}`,
          `select has_sequence_privilege('${role}','ai2c2_hostile.probe_seq','USAGE')`,
          "UNSAFE_TRIP_PERSON_COMMAND_CAPABILITY",
        );
        await probe(
          `${role} default routine EXECUTE`,
          `alter default privileges in schema public grant execute on functions to ${role}`,
          `alter default privileges in schema public revoke execute on functions from ${role}`,
          `select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclrole=current_user::regrole and d.defaclobjtype='f' and a.grantee='${role}'::regrole)`,
          "UNSAFE_TRIP_PERSON_COMMAND_DEFAULT_GRANTS",
        );
      }

      await probe(
        "PUBLIC default sequence USAGE",
        "alter default privileges in schema public grant usage on sequences to public",
        "alter default privileges in schema public revoke usage on sequences from public",
        "select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclobjtype='S' and a.grantee=0)",
        "UNSAFE_TRIP_PERSON_COMMAND_DEFAULT_GRANTS",
      );
      await probe(
        "PUBLIC new-routine default EXECUTE",
        "alter default privileges in schema public grant execute on functions to public",
        "alter default privileges in schema public revoke execute on functions from public",
        "select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclobjtype='f' and a.grantee=0)",
        "UNSAFE_TRIP_PERSON_COMMAND_DEFAULT_GRANTS",
      );
    } finally {
      sql("drop schema ai2c2_hostile cascade; drop role otr_ai2c2_exec_donor");
    }
    for (const role of [
      "otr_trip_person_lifecycle_writer",
      "otr_trip_person_command_gateway",
      "otr_trip_person_receipt_reader",
    ]) {
      for (const [kind, catalog, column, definition] of [
        ["domain", "pg_type", "typowner", "as text"],
        ["collation", "pg_collation", "collowner", 'from pg_catalog."C"'],
      ])
        await t.test(
          `${role} hostile ${kind} ownership survives atomic rejection`,
          () => {
            sql(
              `create schema ai2c2_owned; grant usage on schema ai2c2_owned to ${role};
            create ${kind} ai2c2_owned.hostile ${definition};
            alter ${kind} ai2c2_owned.hostile owner to ${role};
            create table ai2c2_owned.victim (payload ${kind === "domain" ? "ai2c2_owned.hostile" : "text collate ai2c2_owned.hostile"});`,
              "supabase_admin",
            );
            try {
              const owner = `select ${column}='${role}'::regrole from ${catalog} where oid='ai2c2_owned.hostile'::${kind === "domain" ? "regtype" : "regcollation"}`;
              assert.equal(sql(owner), "t");
              assert.equal(
                sql(
                  `select relowner='supabase_admin'::regrole and not has_table_privilege('${role}',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') from pg_class where oid='ai2c2_owned.victim'::regclass`,
                ),
                "t",
              );
              assert.throws(
                () => sql(migration),
                (e) => e.stderr.includes("UNSAFE_TRIP_PERSON_COMMAND_OWNERSHIP"),
              );
              absent();
              assert.equal(sql(owner), "t", "hostile ownership survives rollback");
              assert.equal(
                sql(
                  `begin; set local role ${role}; drop ${kind} ai2c2_owned.hostile cascade;
              select not exists(select 1 from pg_attribute where attrelid='ai2c2_owned.victim'::regclass and attname='payload' and not attisdropped); rollback;`,
                  "supabase_admin",
                ),
                "t",
                "ownership still removes administrator victim column without table ACL",
              );
              assert.equal(sql(owner), "t", "destructive demonstration also rolls back");
            } finally {
              sql("drop schema ai2c2_owned cascade", "supabase_admin");
            }
          },
        );
    }
    for (const role of [
      "otr_trip_person_lifecycle_writer",
      "otr_trip_person_command_gateway",
      "otr_trip_person_receipt_reader",
    ])
      for (const [kind, definition] of [
        ["domain", "as text"],
        ["collation", 'from pg_catalog."C"'],
      ])
        await t.test(`${role} final inventory rejects injected ${kind} ownership`, () => {
          const injected = migration.replace(
            "-- Exact final application capability inventories.",
            `create ${kind} public.ai2c2_final_hostile ${definition}; alter ${kind} public.ai2c2_final_hostile owner to ${role};\n-- Exact final application capability inventories.`,
          );
          assert.notEqual(injected, migration);
          assert.throws(
            () => sql(injected, "supabase_admin"),
            (e) => e.stderr.includes("UNSAFE_TRIP_PERSON_COMMAND_FINAL_OWNERSHIP"),
          );
          absent();
          assert.equal(
            sql(
              "select not exists(select 1 from pg_type where typname='ai2c2_final_hostile') and not exists(select 1 from pg_collation where collname='ai2c2_final_hostile')",
            ),
            "t",
          );
        });
    for (const [role, name, approved, overload] of [
      [
        "otr_trip_person_lifecycle_writer",
        "trip_person_set_participation",
        "uuid,text",
        "uuid,text,boolean",
      ],
      [
        "otr_trip_person_receipt_reader",
        "trip_person_owner_admission",
        "uuid,uuid",
        "uuid,uuid,boolean",
      ],
    ])
      for (const [family, schema, args] of [
        ["approved-name overload", "public", overload],
        ["wrong-schema approved signature", "ai2c2_routine_owned", approved],
      ])
        for (const stage of ["pre-install", "final"]) {
          let bypass = false;
          await t.test(`${role} ${stage} rejects ${family} without sanitizing`, () => {
            const identity = `${schema}.${name}(${args})`;
            sql(
              `create schema ai2c2_routine_owned; grant usage on schema ai2c2_routine_owned to ${role};
              create function ${identity} returns integer language sql as $$select 1$$;
              revoke all on function ${identity} from public;
              ${stage === "pre-install" ? `alter function ${identity} owner to ${role};` : ""}`,
              "supabase_admin",
            );
            try {
              const snapshot = `select jsonb_build_object('oid',p.oid,'class','pg_proc','database',current_database(),'schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',p.proowner,'definition',pg_get_functiondef(p.oid),'acl',p.proacl) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid='${identity}'::regprocedure`;
              const before = sql(snapshot);
              assert.equal(
                sql(
                  `select proowner='${stage === "pre-install" ? role : "supabase_admin"}'::regrole from pg_proc where oid='${identity}'::regprocedure`,
                ),
                "t",
              );
              const candidate =
                stage === "pre-install"
                  ? migration
                  : migration.replace(
                      "-- Exact final application capability inventories.",
                      `alter function ${identity} owner to ${role};\n-- Exact final application capability inventories.`,
                    );
              if (stage === "final") assert.notEqual(candidate, migration);
              // A successful installation is a demonstrated defect: abort the
              // whole suite immediately rather than cleaning up and continuing.
              let rejection;
              try {
                sql(candidate, stage === "pre-install" ? "postgres" : "supabase_admin");
              } catch (error) {
                rejection = error;
              }
              if (!rejection) {
                bypass = true;
                throw new Error(
                  `STOP: ownership bypass accepted ${role} ${stage} ${identity}`,
                );
              }
              assert.ok(
                rejection.stderr.includes(
                  stage === "pre-install"
                    ? "UNSAFE_TRIP_PERSON_COMMAND_OWNERSHIP"
                    : "UNSAFE_TRIP_PERSON_COMMAND_FINAL_OWNERSHIP",
                ),
                rejection.stderr,
              );
              absent();
              assert.equal(
                sql(snapshot),
                before,
                "rollback preserves exact pre-existing identity, ownership, definition and ACL",
              );
            } finally {
              // Never erase evidence if the installation unexpectedly succeeded.
              if (
                sql(
                  "select to_regclass('public.trip_person_participation_receipts') is null",
                ) === "t"
              )
                sql(
                  `drop function ${identity}; drop schema ai2c2_routine_owned`,
                  "supabase_admin",
                );
            }
          });
          if (bypass)
            throw new Error("STOP: exact routine ownership regression exposed a bypass");
        }
    await t.test("clean exact role reservation installs closed", () => {
      sql(migration);
      assert.equal(sql("select not enabled from public.trip_person_command_gate"), "t");
    });
  });

if (mode === "sql")
  test("full native SQL suite", async (t) => {
    sql("create extension if not exists pgtap with schema extensions");
    let total = 0;
    for (const name of readdirSync("supabase/tests")
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await t.test(name, () => {
        const out = sql(
          "set search_path=public,extensions;\n" +
            readFileSync("supabase/tests/" + name, "utf8"),
          "postgres",
        );
        assert.doesNotMatch(out, /(?:^|\n)\s*not ok\b/);
        const plan = [...out.matchAll(/(?:^|\n)\s*1\.\.(\d+)/g)].at(-1);
        assert.ok(plan);
        const count = [...out.matchAll(/(?:^|\n)\s*ok\s+\d+\b/g)].length;
        assert.equal(count, Number(plan[1]));
        total += count;
      });
    console.log("SQL total:", total);
  });
const quote = (v) => "'" + v.replaceAll("'", "''") + "'";
const actor = "00000000-0000-4000-8000-000000000001",
  trip = "10000000-0000-4000-8000-000000000001",
  person = "ac290000-0000-4000-8000-000000000001";
const id = (n) => "ac290000-0000-4000-8000-" + String(n).padStart(12, "0");
const digest = (s) => createHash("sha256").update(s).digest("hex");
function intent(n, revision = 0, active = true, desired = false, reason = null) {
  const c = {
    contractVersion: 1,
    command: "SET_PARTICIPATION",
    operationId: id(n),
    actorUserId: actor,
    actorMemberId: null,
    tripId: trip,
    personId: person,
    expectedParticipation: { isParticipating: active, revision },
    isParticipating: desired,
    reason,
  };
  const tuple = [
    1,
    c.command,
    c.operationId,
    actor,
    null,
    trip,
    person,
    active,
    String(revision),
    desired,
    reason,
  ];
  return {
    ...c,
    intentDigest: digest("otr-trip-person-intent-v1\n" + JSON.stringify(tuple)),
  };
}
const execute = (c) =>
  `set session authorization otr_trip_person_command_gateway;select public.trip_person_set_participation('${actor}',${quote(JSON.stringify(c))});`;
const asyncSql = (input) =>
  new Promise((resolve, reject) => {
    const p = spawn(
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
        "supabase_admin",
        "-d",
        "postgres",
      ],
      { cwd: root },
    );
    let out = "",
      err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code ? reject(new Error(err)) : resolve(out.trim())));
    p.stdin.end(input);
  });
if (mode === "codec")
  test("independent Node/Backend/PostgreSQL exact intent and result bytes", async () => {
    const { participationIntentCodec } =
      await import("../../backend/src/tripPersonParticipationIntent.ts");
    for (const reason of [null, "雪😀\nexact\ttext", 'quote"\\slash', "é é"]) {
      const c = intent(100, 9007199254740991, false, true, reason);
      const raw = JSON.stringify(c),
        expected = participationIntentCodec(raw);
      assert.equal(
        JSON.parse(sql(`select public.trip_person_command_codec(${quote(raw)})`))
          .intentDigest,
        c.intentDigest,
      );
      assert.equal(
        sql(
          `select 'otr-trip-person-intent-v1'||chr(10)||public.trip_event_canonical_json(public.trip_person_intent_tuple(${quote(raw)}::jsonb)::json)`,
        ),
        expected.bytes,
      );
    }
    const c = intent(101),
      raw = JSON.stringify(c);
    for (const invalid of [
      raw.replace('"contractVersion":1', '"contractVersion":1,"contractVersion":1'),
      raw.replace('"revision":0', '"revision":-0'),
      raw.replace('"revision":0', '"revision":0e0'),
      raw.replace('"revision":0', '"revision":0.0'),
      raw.replace('"revision":0', '"revision":9007199254740992'),
      raw.replace('"reason":null', '"reason":"\\u0000"'),
      raw.replace('"reason":null', '"reason":"\\ud800"'),
      raw.replace('"reason":null', '"reason":" trimmed "'),
      raw.replace('"contractVersion":1', '"extra":true,"contractVersion":1'),
      raw.replace(c.intentDigest, "0".repeat(64)),
    ]) {
      assert.throws(() => participationIntentCodec(invalid));
      assert.throws(() =>
        sql(`select public.trip_person_command_codec(${quote(invalid)})`),
      );
    }
    const r = {
      receiptVersion: 1,
      receiptId: id(200),
      contractVersion: 1,
      command: "SET_PARTICIPATION",
      operationId: id(101),
      actorUserId: actor,
      actorMemberId: id(201),
      tripId: trip,
      personId: person,
      intentDigest: c.intentDigest,
      expectedParticipation: { isParticipating: true, revision: 0 },
      desiredParticipation: false,
      outcome: "APPLIED",
      priorParticipation: { isParticipating: true, revision: 0 },
      resultingParticipation: { isParticipating: false, revision: 1 },
      errorCode: null,
      observedAt: "2026-11-01T09:00:00.123456Z",
    };
    const tuple = [
      1,
      r.receiptId,
      1,
      r.command,
      r.operationId,
      actor,
      r.actorMemberId,
      trip,
      person,
      c.intentDigest,
      [true, "0"],
      false,
      "APPLIED",
      [true, "0"],
      [false, "1"],
      null,
      r.observedAt,
    ];
    const expected = digest("otr-trip-person-result-v1\n" + JSON.stringify(tuple));
    const { participationResultBytes } =
      await import("../../src/domain/trip/personParticipationCommand.ts");
    assert.equal(digest(participationResultBytes(r)), expected);
    for (const zone of ["UTC", "Pacific/Auckland", "America/Los_Angeles"]) {
      assert.equal(
        sql(
          `set timezone=${quote(zone)};select public.trip_person_hash('otr-trip-person-result-v1',public.trip_person_result_tuple(${quote(JSON.stringify(r))}::jsonb))`,
        ),
        expected,
      );
    }
  });
if (mode === "concurrency")
  test("real two-device CAS/replay, isolation and gate-close waiter", async () => {
    const opening = `begin;alter table public.trip_person_command_gate drop constraint trip_person_gate_closed;update public.trip_person_command_gate set enabled=true;
 grant select,update(id,participation_active,participation_revision) on public.journey_members to otr_trip_person_lifecycle_writer;
 create policy ai2c2_test_writer on public.journey_members to otr_trip_person_lifecycle_writer using(true) with check(true);
 insert into public.journey_members(id,trip_id,display_name) values('${person}','${trip}','A command race fixture');commit;`;
    sql(opening, "supabase_admin");
    try {
      const race = await Promise.all([
        asyncSql(execute(intent(301))),
        asyncSql(execute(intent(302))),
      ]);
      assert.deepEqual(race.map((x) => JSON.parse(x).receipt.outcome).sort(), [
        "APPLIED",
        "REVISION_CONFLICT",
      ]);
      const replay = await Promise.all([
        asyncSql(execute(intent(303, 1, false, true))),
        asyncSql(execute(intent(303, 1, false, true))),
      ]);
      assert.deepEqual(replay.map((x) => JSON.parse(x).idempotentReplay).sort(), [
        false,
        true,
      ]);
      assert.equal(
        sql(
          `select participation_revision from public.journey_members where id='${person}'`,
        ),
        "2",
      );
      assert.equal(
        JSON.parse(sql(execute(intent(301)), "supabase_admin")).receipt.outcome,
        JSON.parse(race[0]).receipt.outcome,
      );
      for (const level of ["repeatable read", "serializable"]) {
        assert.throws(
          () =>
            sql(
              `begin isolation level ${level};` + execute(intent(400, 2, true, false)),
              "supabase_admin",
            ),
          (e) => e.stderr.includes("PARTICIPATION_ISOLATION_UNSUPPORTED"),
        );
      }
      // Gate closer holds its exclusive fence until an actual RC shared-lock waiter
      // is observed. No sleep is taken as proof of the interleaving.
      let closer;
      const p = spawn(
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
          "supabase_admin",
          "-d",
          "postgres",
        ],
        { cwd: root },
      );
      let out = "",
        err = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (err += d));
      closer = new Promise((res, rej) => {
        p.on("error", rej);
        p.on("close", (code) => (code ? rej(new Error(err)) : res(out)));
      });
      p.stdin.write(
        "begin;set application_name='ai2c2-gate-close';select pg_advisory_xact_lock(hashtextextended('otr-trip-person-activation',0));\n",
      );
      async function observed(query) {
        for (let i = 0; i < 100; i++) {
          if (sql(query) === "t") return;
          await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error("interleaving not observed");
      }
      await observed(
        "select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='ai2c2-gate-close' and l.locktype='advisory' and l.granted)",
      );
      const waiter = asyncSql(
        "set application_name='ai2c2-gate-waiter';" +
          execute(intent(401, 2, true, false)),
      ).then(
        () => {
          throw new Error("gate accepted");
        },
        (e) => {
          assert.match(e.message, /PARTICIPATION_COMMANDS_DISABLED/);
        },
      );
      await observed(
        "select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='ai2c2-gate-waiter' and l.locktype='advisory' and not l.granted)",
      );
      p.stdin.end("update public.trip_person_command_gate set enabled=false;commit;\n");
      await closer;
      await waiter;
      assert.equal(
        sql(
          `select count(*) from public.trip_person_participation_receipts where idempotency_key in ('${id(400)}','${id(401)}')`,
        ),
        "0",
      );
      assert.equal(
        sql(
          `select participation_revision from public.journey_members where id='${person}'`,
        ),
        "2",
      );
    } finally {
      sql(
        `begin;update public.trip_person_command_gate set enabled=false;alter table public.trip_person_command_gate add constraint trip_person_gate_closed check(not enabled);drop policy ai2c2_test_writer on public.journey_members;revoke select,update(id,participation_active,participation_revision) on public.journey_members from otr_trip_person_lifecycle_writer;
 alter table public.trip_person_participation_receipts disable trigger trip_person_receipt_statement_guard;delete from public.trip_person_participation_receipts where person_id='${person}';alter table public.trip_person_participation_receipts enable trigger trip_person_receipt_statement_guard;delete from public.journey_members where id='${person}';commit;`,
        "supabase_admin",
      );
    }
  });

if (mode === "forward")
  test("populated 116-table forward non-interference", () => {
    absent();
    const fixture = readFileSync(
      "supabase/tests/trip_source_protected_foundation.test.sql",
      "utf8",
    );
    const start = fixture.indexOf("set local role service_role;");
    const end = fixture.indexOf(
      "select lives_ok($q$set constraints all immediate",
      start,
    );
    let setup =
      "begin;create extension if not exists pgtap with schema extensions;set search_path=public,extensions;" +
      fixture.slice(start, end);
    setup += "set constraints all immediate;";
    for (const table of [
      "trip_sources",
      "trip_source_revisions",
      "trip_source_representations",
      "trip_source_actions",
    ])
      setup += `alter table public.${table} enable trigger trip_source_mutation_guard;alter table public.${table} enable trigger trip_source_statement_guard;`;
    setup +=
      "insert into public.itinerary_events(id,trip_id,title,created_by) values('cf000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Literal legacy retained','00000000-0000-4000-8000-000000000001');set constraints all immediate;commit;";
    sql(setup);
    const tables = JSON.parse(
      sql(
        "select jsonb_agg(relname order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r'",
      ),
    );
    assert.equal(tables.length, 116);
    const data = () =>
      sql(
        tables
          .map(
            (table) =>
              `select jsonb_build_object('table',${quote(table)},'rows',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public."${table}" t))`,
          )
          .join(" union all ") + " order by 1",
      );
    const schema = () =>
      sql(`set search_path=pg_catalog; select jsonb_agg(value order by value::text) from (
 select jsonb_build_array('table',c.relname,c.relrowsecurity,c.relforcerowsecurity,(select jsonb_agg(to_jsonb(a) order by a.grantee,a.privilege_type) from aclexplode(c.relacl) a where a.grantee not in (select oid from pg_roles where rolname in ('otr_trip_person_lifecycle_writer','otr_trip_person_receipt_reader','otr_trip_person_command_gateway')))) value from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any(array[${tables.map(quote).join(",")}])
 union all select jsonb_build_array('column',c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relname=any(array[${tables.map(quote).join(",")}]) and a.attnum>0 and not a.attisdropped
 union all select jsonb_build_array('constraint',c.relname,x.conname,pg_get_constraintdef(x.oid,true)) from pg_constraint x join pg_class c on c.oid=x.conrelid where x.conname<>'trip_person_transition_evidence_guard' and c.relnamespace='public'::regnamespace and c.relname=any(array[${tables.map(quote).join(",")}])
 union all select jsonb_build_array('trigger',c.relname,t.tgname,pg_get_triggerdef(t.oid,true),t.tgenabled) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname=any(array[${tables.map(quote).join(",")}]) and not t.tgisinternal and t.tgname<>'trip_person_transition_evidence_guard'
 union all select jsonb_build_array('index',tablename,indexname,indexdef) from pg_indexes where schemaname='public' and tablename=any(array[${tables.map(quote).join(",")}])
 union all select jsonb_build_array('policy',to_jsonb(p)) from pg_policies p where schemaname in ('public','storage') and policyname not in ('trip_person_authority_read','trip_person_gate_read','trip_person_receipt_writer_read','trip_person_receipt_read','trip_person_receipt_writer_insert')
 ) facts`);
    const beforeData = data(),
      beforeSchema = schema();
    // Freeze old routine identities; new Source routines are intentionally additive.
    const oldOids = sql(
      "select string_agg(oid::text,',') from pg_proc where pronamespace='public'::regnamespace and proname<>'guard_trip_person_participation'",
    );
    const oldRoutines = () =>
      sql(
        `set search_path=pg_catalog;select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proowner,(select jsonb_agg(to_jsonb(a) order by a.grantee,a.privilege_type) from aclexplode(p.proacl) a where a.grantee not in(select oid from pg_roles where rolname in ('otr_trip_person_lifecycle_writer','otr_trip_person_receipt_reader','otr_trip_person_command_gateway')))) order by p.oid::regprocedure::text) from pg_proc p where p.oid=any(array[${oldOids}]::oid[])`,
      );
    const beforeRoutines = oldRoutines(),
      beforeStorage = sql(
        "select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b",
      );
    sql(migration);
    assert.equal(data(), beforeData);
    const afterSchema = schema();
    const beforeFacts = JSON.parse(beforeSchema).map(JSON.stringify),
      afterFacts = JSON.parse(afterSchema).map(JSON.stringify);
    assert.deepEqual(
      afterFacts.filter((f) => !beforeFacts.includes(f)),
      [],
      "unexpected added/changed old schema facts",
    );
    assert.deepEqual(
      beforeFacts.filter((f) => !afterFacts.includes(f)),
      [],
      "unexpected removed/changed old schema facts",
    );
    assert.equal(oldRoutines(), beforeRoutines);
    assert.equal(
      sql("select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b"),
      beforeStorage,
    );
    console.log(
      `Forward: ${tables.length} old tables, ${beforeData.split("\n").filter((x) => !x.includes('"rows": []')).length} nonempty; data SHA256 ${createHash("sha256").update(beforeData).digest("hex")}`,
    );
  });
