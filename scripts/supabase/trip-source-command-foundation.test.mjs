import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// Hard-bound disposable container. No remote URL/environment override or saved DB.
const root = "/Users/xoery/Project/otr-mobile-import";
assert.equal(process.cwd(), root, "explicit import workdir required");
const container = "supabase_db_otr-trip-ci3d-recovery";
const migration = readFileSync(
  "supabase/migrations/20261004000500_trip_source_command_foundation.sql",
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
      "select to_regclass('public.trip_source_operations') is null and to_regclass('public.trip_source_command_gate') is null",
    ),
    "t",
  );
const mode = process.argv[2];
if (!["sql", "reuse", "concurrency", "vectors", "forward"].includes(mode))
  throw new Error("Choose sql/reuse/concurrency; isolated local container only.");
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
      "otr_trip_source_command_gateway",
      "otr_trip_source_operation_reader",
    ])
      sql(
        `do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls; end if; end$$`,
      );
    const probe = async (
      label,
      grant,
      revoke,
      query,
      reason = "UNSAFE_TRIP_SOURCE_COMMAND_GRANTS",
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
      "otr_trip_source_writer",
      "otr_trip_source_command_gateway",
      "otr_trip_source_operation_reader",
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
        "UNSAFE_TRIP_SOURCE_COMMAND_ROLE",
      );
    }
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"])
      await probe(
        `PUBLIC effective ${privilege}`,
        `grant ${privilege}(source_kind) on public.trip_sources to public`,
        `revoke ${privilege}(source_kind) on public.trip_sources from public`,
        `select has_column_privilege('otr_trip_source_command_gateway','public.trip_sources','source_kind','${privilege}')`,
      );
    sql(
      "create role otr_ci3d_donor nologin; grant update(source_kind) on public.trip_sources to otr_ci3d_donor",
    );
    try {
      await probe(
        "inherited column grant",
        "grant otr_ci3d_donor to otr_trip_source_command_gateway with inherit true,set false",
        "revoke otr_ci3d_donor from otr_trip_source_command_gateway",
        "select has_column_privilege('otr_trip_source_command_gateway','public.trip_sources','source_kind','UPDATE')",
        "UNSAFE_TRIP_SOURCE_COMMAND_ROLE",
      );
    } finally {
      sql(
        "revoke update(source_kind) on public.trip_sources from otr_ci3d_donor; drop role otr_ci3d_donor",
      );
    }
    await probe(
      "PUBLIC new-table default SELECT",
      "alter default privileges in schema public grant select on tables to public",
      "alter default privileges in schema public revoke select on tables from public",
      "select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclrole=current_user::regrole and d.defaclnamespace='public'::regnamespace and a.grantee=0 and a.privilege_type='SELECT')",
      "UNSAFE_TRIP_SOURCE_COMMAND_DEFAULT_GRANTS",
    );
    sql(
      "create schema ci3d_hostile; create sequence ci3d_hostile.probe_seq; create role otr_ci3d_exec_donor nologin; create function ci3d_hostile.open_gate() returns void language plpgsql security definer set search_path=pg_catalog as $$begin execute 'alter table public.trip_source_command_gate drop constraint trip_source_gate_closed'; execute 'update public.trip_source_command_gate set enabled=true'; end$$; revoke all on function ci3d_hostile.open_gate() from public; grant usage on schema ci3d_hostile to public",
    );
    try {
      for (const role of [
        "otr_trip_source_writer",
        "otr_trip_source_command_gateway",
        "otr_trip_source_operation_reader",
      ]) {
        await probe(
          `${role} API SET ROLE path`,
          `grant ${role} to authenticated with inherit false,set true`,
          `revoke ${role} from authenticated`,
          `select exists(select 1 from pg_auth_members where roleid='${role}'::regrole and member='authenticated'::regrole and set_option)`,
          "UNSAFE_TRIP_SOURCE_COMMAND_ROLE",
        );
        await probe(
          `${role} incoming SET ROLE membership`,
          `grant otr_ci3d_exec_donor to ${role} with inherit false,set true`,
          `revoke otr_ci3d_exec_donor from ${role}`,
          `select exists(select 1 from pg_auth_members where roleid='otr_ci3d_exec_donor'::regrole and member='${role}'::regrole and set_option)`,
          "UNSAFE_TRIP_SOURCE_COMMAND_ROLE",
        );
        await probe(
          `${role} PUBLIC other-schema CREATE`,
          "grant create on schema ci3d_hostile to public",
          "revoke create on schema ci3d_hostile from public",
          `select has_schema_privilege('${role}','ci3d_hostile','CREATE')`,
          "UNSAFE_TRIP_SOURCE_COMMAND_ROLE",
        );
        await probe(
          `${role} default table SELECT`,
          `alter default privileges in schema public grant select on tables to ${role}`,
          `alter default privileges in schema public revoke select on tables from ${role}`,
          `select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclobjtype='r' and a.grantee='${role}'::regrole)`,
          "UNSAFE_TRIP_SOURCE_COMMAND_DEFAULT_GRANTS",
        );
        await probe(
          `${role} hostile direct EXECUTE`,
          `grant execute on function ci3d_hostile.open_gate() to ${role}`,
          `revoke execute on function ci3d_hostile.open_gate() from ${role}`,
          `select has_function_privilege('${role}','ci3d_hostile.open_gate()','EXECUTE')`,
          "UNSAFE_TRIP_SOURCE_COMMAND_CAPABILITY",
        );
        await probe(
          `${role} hostile PUBLIC EXECUTE`,
          "grant execute on function ci3d_hostile.open_gate() to public",
          "revoke execute on function ci3d_hostile.open_gate() from public",
          `select has_function_privilege('${role}','ci3d_hostile.open_gate()','EXECUTE')`,
          "UNSAFE_TRIP_SOURCE_COMMAND_CAPABILITY",
        );
        await probe(
          `${role} inherited hostile EXECUTE`,
          `grant execute on function ci3d_hostile.open_gate() to otr_ci3d_exec_donor; grant otr_ci3d_exec_donor to ${role} with inherit true,set false`,
          `revoke otr_ci3d_exec_donor from ${role}; revoke execute on function ci3d_hostile.open_gate() from otr_ci3d_exec_donor`,
          `select has_function_privilege('${role}','ci3d_hostile.open_gate()','EXECUTE')`,
          "UNSAFE_TRIP_SOURCE_COMMAND_ROLE",
        );
        await probe(
          `${role} other-schema CREATE`,
          `grant create on schema ci3d_hostile to ${role}`,
          `revoke create on schema ci3d_hostile from ${role}`,
          `select has_schema_privilege('${role}','ci3d_hostile','CREATE')`,
          "UNSAFE_TRIP_SOURCE_COMMAND_ROLE",
        );
        await probe(
          `${role} inherited other-schema CREATE`,
          `grant create on schema ci3d_hostile to otr_ci3d_exec_donor; grant otr_ci3d_exec_donor to ${role} with inherit true,set false`,
          `revoke otr_ci3d_exec_donor from ${role}; revoke create on schema ci3d_hostile from otr_ci3d_exec_donor`,
          `select has_schema_privilege('${role}','ci3d_hostile','CREATE')`,
          "UNSAFE_TRIP_SOURCE_COMMAND_ROLE",
        );
        await probe(
          `${role} application sequence USAGE`,
          `grant usage on sequence ci3d_hostile.probe_seq to ${role}`,
          `revoke usage on sequence ci3d_hostile.probe_seq from ${role}`,
          `select has_sequence_privilege('${role}','ci3d_hostile.probe_seq','USAGE')`,
          "UNSAFE_TRIP_SOURCE_COMMAND_CAPABILITY",
        );
        await probe(
          `${role} default routine EXECUTE`,
          `alter default privileges in schema public grant execute on functions to ${role}`,
          `alter default privileges in schema public revoke execute on functions from ${role}`,
          `select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclrole=current_user::regrole and d.defaclobjtype='f' and a.grantee='${role}'::regrole)`,
          "UNSAFE_TRIP_SOURCE_COMMAND_DEFAULT_GRANTS",
        );
      }

      await probe(
        "PUBLIC default sequence USAGE",
        "alter default privileges in schema public grant usage on sequences to public",
        "alter default privileges in schema public revoke usage on sequences from public",
        "select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclobjtype='S' and a.grantee=0)",
        "UNSAFE_TRIP_SOURCE_COMMAND_DEFAULT_GRANTS",
      );
      await probe(
        "PUBLIC new-routine default EXECUTE",
        "alter default privileges in schema public grant execute on functions to public",
        "alter default privileges in schema public revoke execute on functions from public",
        "select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclobjtype='f' and a.grantee=0)",
        "UNSAFE_TRIP_SOURCE_COMMAND_DEFAULT_GRANTS",
      );
    } finally {
      sql("drop schema ci3d_hostile cascade; drop role otr_ci3d_exec_donor");
    }
    for (const role of [
      "otr_trip_source_writer",
      "otr_trip_source_command_gateway",
      "otr_trip_source_operation_reader",
    ]) {
      for (const [kind, catalog, column, definition] of [
        ["domain", "pg_type", "typowner", "as text"],
        ["collation", "pg_collation", "collowner", 'from pg_catalog."C"'],
      ])
        await t.test(
          `${role} hostile ${kind} ownership survives atomic rejection`,
          () => {
            sql(
              `create schema ci3d_owned; grant usage on schema ci3d_owned to ${role};
            create ${kind} ci3d_owned.hostile ${definition};
            alter ${kind} ci3d_owned.hostile owner to ${role};
            create table ci3d_owned.victim (payload ${kind === "domain" ? "ci3d_owned.hostile" : "text collate ci3d_owned.hostile"});`,
              "supabase_admin",
            );
            try {
              const owner = `select ${column}='${role}'::regrole from ${catalog} where oid='ci3d_owned.hostile'::${kind === "domain" ? "regtype" : "regcollation"}`;
              assert.equal(sql(owner), "t");
              assert.equal(
                sql(
                  `select relowner='supabase_admin'::regrole and not has_table_privilege('${role}',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') from pg_class where oid='ci3d_owned.victim'::regclass`,
                ),
                "t",
              );
              assert.throws(
                () => sql(migration),
                (e) => e.stderr.includes("UNSAFE_TRIP_SOURCE_COMMAND_OWNERSHIP"),
              );
              absent();
              assert.equal(sql(owner), "t", "hostile ownership survives rollback");
              assert.equal(
                sql(
                  `begin; set local role ${role}; drop ${kind} ci3d_owned.hostile cascade;
              select not exists(select 1 from pg_attribute where attrelid='ci3d_owned.victim'::regclass and attname='payload' and not attisdropped); rollback;`,
                  "supabase_admin",
                ),
                "t",
                "ownership still removes administrator victim column without table ACL",
              );
              assert.equal(sql(owner), "t", "destructive demonstration also rolls back");
            } finally {
              sql("drop schema ci3d_owned cascade", "supabase_admin");
            }
          },
        );
    }
    for (const role of [
      "otr_trip_source_writer",
      "otr_trip_source_command_gateway",
      "otr_trip_source_operation_reader",
    ])
      for (const [kind, definition] of [
        ["domain", "as text"],
        ["collation", 'from pg_catalog."C"'],
      ])
        await t.test(`${role} final inventory rejects injected ${kind} ownership`, () => {
          const injected = migration.replace(
            "-- Exact final application capability inventories.",
            `create ${kind} public.ci3d_final_hostile ${definition}; alter ${kind} public.ci3d_final_hostile owner to ${role};\n-- Exact final application capability inventories.`,
          );
          assert.notEqual(injected, migration);
          assert.throws(
            () => sql(injected, "supabase_admin"),
            (e) => e.stderr.includes("UNSAFE_TRIP_SOURCE_COMMAND_FINAL_OWNERSHIP"),
          );
          absent();
          assert.equal(
            sql(
              "select not exists(select 1 from pg_type where typname='ci3d_final_hostile') and not exists(select 1 from pg_collation where collname='ci3d_final_hostile')",
            ),
            "t",
          );
        });
    for (const [role, name, approved, overload] of [
      [
        "otr_trip_source_writer",
        "trip_source_acquire_source",
        "uuid,text",
        "uuid,text,boolean",
      ],
      [
        "otr_trip_source_operation_reader",
        "trip_source_admission",
        "uuid,uuid,boolean",
        "uuid,uuid",
      ],
    ])
      for (const [family, schema, args] of [
        ["approved-name overload", "public", overload],
        ["wrong-schema approved signature", "ci3d_routine_owned", approved],
      ])
        for (const stage of ["pre-install", "final"]) {
          let bypass = false;
          await t.test(`${role} ${stage} rejects ${family} without sanitizing`, () => {
            const identity = `${schema}.${name}(${args})`;
            sql(
              `create schema ci3d_routine_owned; grant usage on schema ci3d_routine_owned to ${role};
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
                    ? "UNSAFE_TRIP_SOURCE_COMMAND_OWNERSHIP"
                    : "UNSAFE_TRIP_SOURCE_COMMAND_FINAL_OWNERSHIP",
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
                sql("select to_regclass('public.trip_source_operations') is null") === "t"
              )
                sql(
                  `drop function ${identity}; drop schema ci3d_routine_owned`,
                  "supabase_admin",
                );
            }
          });
          if (bypass)
            throw new Error("STOP: exact routine ownership regression exposed a bypass");
        }
    await t.test("clean exact role reservation installs closed", () => {
      sql(migration);
      assert.equal(sql("select not enabled from public.trip_source_command_gate"), "t");
    });
  });

const quote = (v) => "'" + v.replaceAll("'", "''") + "'";
const hash = (prefix, tuple) =>
  createHash("sha256")
    .update(prefix + "\n" + JSON.stringify(tuple))
    .digest("hex");
const actor = "00000000-0000-4000-8000-000000000001";
const trip = "10000000-0000-4000-8000-000000000001";
const id = (n) => "ce000000-0000-4000-8000-" + String(n).padStart(12, "0");
function acquisition(n, source, representation, text = "雪\nexact", kind = "TEXT") {
  const descriptor = [
    id(representation),
    kind,
    null,
    null,
    kind === "BINARY" ? "application/pdf" : null,
    kind === "BINARY" ? null : "UTF-8",
    createHash("sha256").update(text).digest("hex"),
    Buffer.byteLength(text),
    kind === "TEXT" ? text : null,
    kind === "LOCATOR" ? text : null,
  ];
  const capture = hash("otr-source-capture-v1", [
    1,
    id(source),
    1,
    null,
    [id(representation)],
    "AS_SUPPLIED",
    "ACQUISITION",
    null,
    null,
  ]);
  const input = [
    kind === "BINARY" ? "FILE" : kind === "TEXT" ? "TEXT" : "URL",
    kind === "BINARY" ? "FILES" : kind === "TEXT" ? "PASTE" : "URL_CAPTURE",
    null,
    "UNKNOWN",
  ];
  const acquisitionDigest = hash("otr-source-acquisition-v1", [
    1,
    trip,
    actor,
    id(source),
    "race-" + n,
    ...input,
    capture,
    descriptor,
  ]);
  const payload = {
    acquisition_key: "race-" + n,
    acquisition_sha256: acquisitionDigest,
    source_input: Object.fromEntries(
      ["source_kind", "acquisition_channel", "captured_at", "capture_time_basis"].map(
        (k, i) => [k, input[i]],
      ),
    ),
    capture: { completeness: "AS_SUPPLIED", capture_sha256: capture },
    original: Object.fromEntries(
      [
        "id",
        "material_kind",
        "original_filename",
        "part_key",
        "mime_type",
        "encoding",
        "payload_sha256",
        "byte_count",
        "text_content",
        "locator_uri",
      ].map((k, i) => [k, descriptor[i]]),
    ),
  };
  const operationDigest = hash("otr-source-command-v1", [
    1,
    "ACQUIRE_SOURCE",
    id(n),
    "race-" + n,
    actor,
    trip,
    id(source),
    ["race-" + n, acquisitionDigest, input, ["AS_SUPPLIED", capture], descriptor],
  ]);
  return {
    contract_version: 1,
    command: "ACQUIRE_SOURCE",
    operation_id: id(n),
    operation_key: "race-" + n,
    actor_account_id: actor,
    trip_id: trip,
    source_id: id(source),
    operation_sha256: operationDigest,
    payload,
  };
}
function child(
  family,
  n,
  source,
  representation,
  sourceBase = 1,
  repBase = 1,
  material = 1,
) {
  const state = ["ACTIVE", "RETAINED"],
    repState = [
      family === "RECOVER_REPRESENTATION"
        ? "LOST"
        : family === "MARK_REPRESENTATION_LOST"
          ? "VERIFIED"
          : "PENDING",
      "RETAINED",
    ];
  const payload = {
    material_revision: material,
    expected_source_row_revision: sourceBase,
    expected_source_state: { lifecycle: state[0], retention_state: state[1] },
    representation_id: id(representation),
    expected_representation_row_revision: repBase,
    expected_representation_state: {
      remote_state: repState[0],
      retention_state: repState[1],
    },
  };
  return {
    contract_version: 1,
    command: family,
    operation_id: id(n),
    operation_key: "race-" + n,
    actor_account_id: actor,
    trip_id: trip,
    source_id: id(source),
    operation_sha256: hash("otr-source-command-v1", [
      1,
      family,
      id(n),
      "race-" + n,
      actor,
      trip,
      id(source),
      [material, sourceBase, state, id(representation), repBase, repState],
    ]),
    payload,
  };
}
const execute = (j) =>
  `set session authorization otr_trip_source_command_gateway; select public.trip_source_${j.command.toLowerCase()}('${actor}',${quote(JSON.stringify(j))});`;
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
if (mode === "vectors")
  test("independent positional Source digest vectors", () => {
    for (const j of [
      acquisition(800, 810, 811),
      acquisition(820, 830, 831, "https://example.invalid/雪?q=exact", "LOCATOR"),
      acquisition(840, 850, 851, "%PDF synthetic", "BINARY"),
      child("PREPARE_REPRESENTATION", 860, 850, 851),
      child("MARK_REPRESENTATION_LOST", 870, 850, 851, 1, 2),
    ]) {
      assert.deepEqual(
        JSON.parse(
          sql(`select public.trip_source_command_codec(${quote(JSON.stringify(j))})`),
        ),
        j,
      );
      const changed = { ...j, operation_sha256: "0".repeat(64) };
      assert.throws(
        () =>
          sql(
            `select public.trip_source_command_codec(${quote(JSON.stringify(changed))})`,
          ),
        (e) => e.stderr.includes("INVALID_SOURCE_COMMAND"),
      );
    }
    const tuple = [
      1,
      id(880),
      "VERIFY_REPRESENTATION",
      "a".repeat(64),
      "APPLIED",
      null,
      "2026-11-01T09:00:00.123456Z",
      1,
      1,
      2,
      "VERIFIED",
      "RETAINED",
      null,
      "2026-11-01T09:00:00.123456Z",
    ];
    assert.equal(
      sql(
        `select public.trip_source_hash('otr-source-result-v1',${quote(JSON.stringify(tuple))}::jsonb)`,
      ),
      hash("otr-source-result-v1", tuple),
    );
    const upload = [
      1,
      id(890),
      "u-890",
      actor,
      trip,
      id(850),
      1,
      id(851),
      id(860),
      1,
      1,
      [
        ["ACTIVE", "RETAINED"],
        ["PENDING", "RETAINED"],
      ],
      "a".repeat(64),
      12,
      "application/pdf",
    ];
    assert.equal(
      sql(
        `select public.trip_source_hash('otr-source-upload-v1',${quote(JSON.stringify(upload))}::jsonb)`,
      ),
      hash("otr-source-upload-v1", upload),
    );
  });
if (mode === "concurrency")
  test("parallel exact replay, Source CAS and phase/generation ownership", async () => {
    const sourceTest = readFileSync(
      "supabase/tests/trip_source_command_foundation.test.sql",
      "utf8",
    );
    const start = sourceTest.indexOf(
      "alter table public.trip_source_command_gate drop constraint",
    );
    const end = sourceTest.indexOf("insert into ci3d_inputs values(10", start);
    const opening = sourceTest.slice(start, end).replace(/reset role;\s*/g, "");
    sql("begin;" + opening + "commit;", "supabase_admin");
    try {
      const j = acquisition(900, 910, 911, "%PDF synthetic", "BINARY");
      await assert.rejects(
        asyncSql(
          "begin isolation level repeatable read;" + execute(acquisition(898, 899, 897)),
        ),
        /UNSUPPORTED_TRANSACTION_ISOLATION/,
      );
      await assert.rejects(
        asyncSql(
          "begin isolation level serializable;" + execute(acquisition(895, 896, 894)),
        ),
        /UNSUPPORTED_TRANSACTION_ISOLATION/,
      );
      const receipts = await Promise.all([asyncSql(execute(j)), asyncSql(execute(j))]);
      assert.deepEqual(JSON.parse(receipts[0]), JSON.parse(receipts[1]));
      assert.equal(
        sql(
          `select count(*) from public.trip_source_actions where source_id='${id(910)}'`,
        ),
        "1",
      );
      const io = child("VERIFY_REPRESENTATION", 920, 910, 911);
      assert.equal(JSON.parse(await asyncSql(execute(io))).phase, "ADMITTED");
      const attempt = (n, phase, generation, prior) =>
        `set session authorization otr_trip_source_command_gateway;set role otr_trip_source_writer;select public.trip_source_attempt_start('${actor}','${trip}','${id(910)}','${io.operation_id}','${io.operation_key}','${io.operation_sha256}','${phase}',${generation},${prior ? quote(id(prior)) : "null"},'${id(n)}');`;
      const raced = await Promise.allSettled([
        asyncSql(attempt(921, "ADMITTED", 1, null)),
        asyncSql(attempt(922, "ADMITTED", 1, null)),
      ]);
      assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1);
      assert.match(
        raced.find((r) => r.status === "rejected").reason.message,
        /SOURCE_ATTEMPT_CONFLICT/,
      );
      const owned = sql(
        `select attempt_id from public.trip_source_operations where id='${io.operation_id}'`,
      );
      const observe = (generation, which, phase, observation) =>
        `set session authorization otr_trip_source_command_gateway;set role otr_trip_source_writer;select public.trip_source_attempt_observe('${io.operation_id}','${io.operation_sha256}','${phase}',${generation},'${which}','${observation}');`;
      await asyncSql(observe(1, owned, "IO_ACTIVE", "UNKNOWN"));
      await assert.rejects(
        asyncSql(attempt(923, "IO_UNKNOWN", 1, Number(owned.slice(-12)))),
        /SOURCE_ATTEMPT_CONFLICT/,
      );
      await asyncSql(observe(1, owned, "IO_UNKNOWN", "DEFINITIVE_COMPLETION"));
      await asyncSql(attempt(923, "IO_QUIESCENT", 1, Number(owned.slice(-12))));
      await assert.rejects(
        asyncSql(observe(1, owned, "IO_ACTIVE", "DEFINITIVE_COMPLETION")),
        /SOURCE_ATTEMPT_CONFLICT/,
      );
      await asyncSql(observe(2, id(923), "IO_ACTIVE", "DEFINITIVE_COMPLETION"));
      // Race independent replacements against the same Source base.
      const replacement = (n, rid) => {
        const a = acquisition(n, 910, rid, "new");
        const p = {
          material_revision: 1,
          expected_source_row_revision: 1,
          expected_source_state: { lifecycle: "ACTIVE", retention_state: "RETAINED" },
          expected_current_material_revision: 1,
          capture: {
            completeness: "AS_SUPPLIED",
            capture_sha256: hash("otr-source-capture-v1", [
              1,
              id(910),
              2,
              1,
              [id(rid)],
              "AS_SUPPLIED",
              "REPLACEMENT",
              null,
              null,
            ]),
          },
          original: a.payload.original,
        };
        // Replacement preserves FILE/BINARY compatibility.
        p.original = acquisition(
          n,
          910,
          rid,
          "%PDF replacement",
          "BINARY",
        ).payload.original;
        const d = Object.values(p.original);
        return {
          ...a,
          command: "REPLACE_MATERIAL",
          payload: p,
          operation_sha256: hash("otr-source-command-v1", [
            1,
            "REPLACE_MATERIAL",
            id(n),
            "race-" + n,
            actor,
            trip,
            id(910),
            [
              1,
              1,
              ["ACTIVE", "RETAINED"],
              1,
              ["AS_SUPPLIED", p.capture.capture_sha256],
              d,
            ],
          ]),
        };
      };
      const cas = await Promise.all([
        asyncSql(execute(replacement(930, 931))),
        asyncSql(execute(replacement(940, 941))),
      ]);
      assert.deepEqual(cas.map((x) => JSON.parse(x).outcome).sort(), [
        "APPLIED",
        "REJECTED",
      ]);
      assert.equal(
        sql(`select row_revision from public.trip_sources where id='${id(910)}'`),
        "2",
      );

      const closer = spawn(
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
          "postgres",
          "-d",
          "postgres",
        ],
        { cwd: root },
      );
      let closeOutput = "",
        closeError = "";
      const ready = new Promise((resolve, reject) => {
        closer.stdout.on("data", (d) => {
          closeOutput += d;
          if (closeOutput.includes("CI3D_LOCKED")) resolve();
        });
        closer.on("error", reject);
      });
      const closed = new Promise((resolve, reject) => {
        closer.stderr.on("data", (d) => (closeError += d));
        closer.on("error", reject);
        closer.on("close", (code) => (code ? reject(new Error(closeError)) : resolve()));
      });
      closer.stdin.write(
        "begin;select pg_advisory_xact_lock(hashtextextended('otr-source-activation-v1',0));select 'CI3D_LOCKED';\n",
      );
      await ready;
      try {
        const fresh = acquisition(950, 951, 952, "gate fence");
        const waiter = asyncSql(execute(fresh));
        const rejected = assert.rejects(waiter, /TRIP_SOURCE_COMMANDS_DISABLED/);
        let waiting = false;
        for (let i = 0; i < 100; i++) {
          waiting =
            sql(
              "select exists(select 1 from pg_locks where locktype='advisory' and classid=((hashtextextended('otr-source-activation-v1',0)>>32)&4294967295)::oid and objid=(hashtextextended('otr-source-activation-v1',0)&4294967295)::oid and not granted)",
            ) === "t";
          if (waiting) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(waiting, "actual Source RC waiter holds no stale gate observation");
        closer.stdin.end(
          "update public.trip_source_command_gate set enabled=false;commit;\n",
        );
        await closed;
        await rejected;
        assert.equal(
          sql(
            `select count(*) from public.trip_source_operations where id='${fresh.operation_id}'`,
          ),
          "0",
        );
      } finally {
        if (!closer.stdin.writableEnded) closer.stdin.end("rollback;\n");
        await closed;
      }
    } finally {
      let cleanup =
        "begin;update public.trip_source_command_gate set enabled=false;alter table public.trip_source_command_gate add constraint trip_source_gate_closed check(not enabled);revoke otr_trip_source_writer from otr_trip_source_command_gateway;revoke select,insert,update on public.trip_sources,public.trip_source_revisions,public.trip_source_representations,public.trip_source_actions,public.trip_source_operations from otr_trip_source_writer;revoke select,update on public.trips,public.trip_members,public.journey_members from otr_trip_source_writer;revoke execute on function public.trip_source_uuid_array_valid(uuid[],integer,integer) from otr_trip_source_writer;";
      for (const table of [
        "trip_sources",
        "trip_source_revisions",
        "trip_source_representations",
        "trip_source_actions",
        "trip_source_operations",
        "trips",
        "trip_members",
        "journey_members",
      ])
        cleanup += `drop policy ci3d_fixture on public.${table};`;
      for (const table of [
        "trip_sources",
        "trip_source_revisions",
        "trip_source_representations",
        "trip_source_actions",
      ])
        cleanup += `alter table public.${table} enable trigger trip_source_mutation_guard;alter table public.${table} enable trigger trip_source_statement_guard;`;
      sql(cleanup + "commit;", "supabase_admin");
    }
  });

if (mode === "forward")
  test("populated 114-table forward non-interference", () => {
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
    assert.equal(tables.length, 114);
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
 select jsonb_build_array('table',c.relname,c.relrowsecurity,c.relforcerowsecurity,(select jsonb_agg(to_jsonb(a) order by a.grantee,a.privilege_type) from aclexplode(c.relacl) a where a.grantee not in (select oid from pg_roles where rolname in ('otr_trip_source_writer','otr_trip_source_operation_reader')))) value from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any(array[${tables.map(quote).join(",")}])
 union all select jsonb_build_array('column',c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relname=any(array[${tables.map(quote).join(",")}]) and a.attnum>0 and not a.attisdropped
 union all select jsonb_build_array('constraint',c.relname,x.conname,pg_get_constraintdef(x.oid,true)) from pg_constraint x join pg_class c on c.oid=x.conrelid where c.relnamespace='public'::regnamespace and c.relname=any(array[${tables.map(quote).join(",")}])
 union all select jsonb_build_array('trigger',c.relname,t.tgname,pg_get_triggerdef(t.oid,true),t.tgenabled) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname=any(array[${tables.map(quote).join(",")}]) and not t.tgisinternal
 union all select jsonb_build_array('index',tablename,indexname,indexdef) from pg_indexes where schemaname='public' and tablename=any(array[${tables.map(quote).join(",")}])
 union all select jsonb_build_array('policy',to_jsonb(p)) from pg_policies p where schemaname in ('public','storage') and policyname not in ('trip_source_owner_read','trip_source_trip_read','trip_source_legacy_admission_read','trip_source_person_admission_read','trip_source_gate_read','trip_source_operation_read')
 ) facts`);
    const beforeData = data(),
      beforeSchema = schema();
    // Freeze old routine identities; new Source routines are intentionally additive.
    const oldOids = sql(
      "select string_agg(oid::text,',') from pg_proc where pronamespace='public'::regnamespace",
    );
    const oldRoutines = () =>
      sql(
        `set search_path=pg_catalog;select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proowner,(select jsonb_agg(to_jsonb(a) order by a.grantee,a.privilege_type) from aclexplode(p.proacl) a where a.grantee not in(select oid from pg_roles where rolname in ('otr_trip_source_writer','otr_trip_source_operation_reader')))) order by p.oid::regprocedure::text) from pg_proc p where p.oid=any(array[${oldOids}]::oid[])`,
      );
    const beforeRoutines = oldRoutines(),
      beforeStorage = sql(
        "select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b",
      );
    sql(migration);
    assert.equal(data(), beforeData);
    assert.equal(schema(), beforeSchema);
    assert.equal(oldRoutines(), beforeRoutines);
    assert.equal(
      sql("select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b"),
      beforeStorage,
    );
    console.log(
      `Forward: ${tables.length} old tables, ${beforeData.split("\n").filter((x) => !x.includes('"rows": []')).length} nonempty; data SHA256 ${createHash("sha256").update(beforeData).digest("hex")}`,
    );
  });
