import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
const container = "supabase_db_otr-trip-ai2c5";
const migration = readFileSync(
  "supabase/migrations/20261005000200_trip_person_participation_activation_foundation.sql",
  "utf8",
);
const sql = (input, user = "supabase_admin") =>
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
    { input, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  ).trim();
const apply = () => sql(migration, "postgres");
const absent = () =>
  assert.equal(
    sql("select to_regprocedure('public.trip_person_runtime_state()') is null"),
    "t",
  );
const mode = process.argv[2];
if (
  ![
    "reuse",
    "sql",
    "fence",
    "forward",
    "p2",
    "root",
    "scope",
    "compatibility",
    "integrated",
  ].includes(mode)
)
  throw Error("Fixed disposable local container; choose reuse/sql/fence/forward/p2/root");
if (mode === "sql")
  test("full SQL on closed 73-version replay", async (t) => {
    sql("create extension if not exists pgtap with schema extensions");
    let total = 0;
    for (const name of readdirSync("supabase/tests")
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await t.test(name, () => {
        const output = sql(
          "set search_path=public,extensions;\n" +
            readFileSync(`supabase/tests/${name}`, "utf8"),
          name === "trip_event_collection.test.sql" ? "supabase_admin" : "postgres",
        );
        assert.doesNotMatch(output, /(?:^|\n)\s*not ok\b/);
        const plan = [...output.matchAll(/(?:^|\n)\s*1\.\.(\d+)/g)].at(-1);
        assert.ok(plan, name);
        assert.equal(
          [...output.matchAll(/(?:^|\n)\s*ok\s+\d+\b/g)].length,
          Number(plan[1]),
        );
        total += Number(plan[1]);
      });
    console.log(`SQL total ${total} assertions`);
    assert.equal(
      sql("select not enabled and generation=0 from public.trip_person_command_gate"),
      "t",
    );
  });
if (mode === "reuse")
  test("hostile 72-version reuse rejects atomically without sanitation", async (t) => {
    absent();
    const probe = async (label, fixture, undo, present) =>
      t.test(label, () => {
        sql(fixture);
        try {
          assert.equal(sql(present), "t");
          assert.throws(apply, (e) => /UNSAFE_PARTICIPATION_ACTIVATION/.test(e.stderr));
          absent();
          assert.equal(sql(present), "t");
          assert.equal(
            sql("select not enabled from public.trip_person_command_gate"),
            "t",
          );
        } finally {
          sql(undo);
        }
      });
    for (const role of [
      "otr_trip_person_command_gateway",
      "otr_trip_person_lifecycle_writer",
      "otr_trip_person_receipt_reader",
    ]) {
      for (const attribute of [
        "login",
        "superuser",
        "createdb",
        "createrole",
        "inherit",
        "bypassrls",
        "replication",
      ]) {
        const field = {
          login: "rolcanlogin",
          superuser: "rolsuper",
          createdb: "rolcreatedb",
          createrole: "rolcreaterole",
          inherit: "rolinherit",
          bypassrls: "rolbypassrls",
          replication: "rolreplication",
        }[attribute];
        await probe(
          `${role} ${attribute}`,
          `alter role ${role} ${attribute}`,
          `alter role ${role} no${attribute}`,
          `select ${field} from pg_roles where rolname='${role}'`,
        );
      }
      for (const privilege of [
        "select",
        "insert",
        "update",
        "delete",
        "truncate",
        "references",
        "trigger",
      ])
        await probe(
          `${role} unexpected ${privilege}`,
          `grant ${privilege} on public.trip_sources to ${role}`,
          `revoke ${privilege} on public.trip_sources from ${role}`,
          `select has_table_privilege('${role}','public.trip_sources','${privilege}')`,
        );
    }
    await probe(
      "hostile independent anchor function",
      "create function public.trip_person_activation_reviewed_root() returns text language sql as $$select 'hostile'::text$$",
      "drop function public.trip_person_activation_reviewed_root()",
      "select to_regprocedure('public.trip_person_activation_reviewed_root()') is not null",
    );
    await probe(
      "hostile independent anchor wrong schema",
      "create function extensions.trip_person_activation_reviewed_root() returns text language sql as $$select 'hostile'::text$$",
      "drop function extensions.trip_person_activation_reviewed_root()",
      "select to_regprocedure('extensions.trip_person_activation_reviewed_root()') is not null",
    );
    await probe(
      "hostile independent anchor table collision",
      "create table public.trip_person_activation_reviewed_root(id int)",
      "drop table public.trip_person_activation_reviewed_root",
      "select to_regclass('public.trip_person_activation_reviewed_root') is not null",
    );
    const originalCommand = sql(
      "select pg_get_functiondef('public.trip_person_set_participation(uuid,text)'::regprocedure)",
    );
    await probe(
      "protected command definition drift",
      "create or replace function public.trip_person_set_participation(actor uuid,raw text) returns jsonb language sql security definer set search_path=pg_catalog as 'select null::jsonb'",
      originalCommand,
      "select pg_get_functiondef('public.trip_person_set_participation(uuid,text)'::regprocedure) like '%select null::jsonb%'",
    );
    await probe(
      "same-name overload survives rollback",
      "create function public.trip_person_runtime_state(text) returns int language sql as 'select 1'",
      "drop function public.trip_person_runtime_state(text)",
      "select to_regprocedure('public.trip_person_runtime_state(text)') is not null",
    );
    await probe(
      "same-name wrong-schema object",
      "create function extensions.trip_person_set_command_gate() returns int language sql as 'select 1'",
      "drop function extensions.trip_person_set_command_gate()",
      "select to_regprocedure('extensions.trip_person_set_command_gate()') is not null",
    );
    await probe(
      "hostile generation column",
      "alter table public.trip_person_command_gate add column generation text",
      "alter table public.trip_person_command_gate drop column generation",
      "select exists(select 1 from pg_attribute where attrelid='public.trip_person_command_gate'::regclass and attname='generation' and not attisdropped)",
    );
    await probe(
      "hostile gateway settings",
      "alter role otr_trip_person_command_gateway set search_path=public",
      "alter role otr_trip_person_command_gateway reset search_path",
      "select rolconfig is not null from pg_roles where rolname='otr_trip_person_command_gateway'",
    );
    sql(
      "create schema ai2c5_hostile;create sequence ai2c5_hostile.seq;create function ai2c5_hostile.authority() returns int language sql as 'select 1';revoke all on function ai2c5_hostile.authority() from public;grant usage on schema ai2c5_hostile to public;create role ai2c5_donor nologin",
    );
    try {
      for (const role of [
        "public",
        "otr_trip_person_command_gateway",
        "otr_trip_person_lifecycle_writer",
        "otr_trip_person_receipt_reader",
      ]) {
        await probe(
          `${role} leaked EXECUTE`,
          `grant execute on function ai2c5_hostile.authority() to ${role}`,
          `revoke execute on function ai2c5_hostile.authority() from ${role}`,
          `select has_function_privilege('otr_trip_person_command_gateway','ai2c5_hostile.authority()','EXECUTE') or has_function_privilege('${role === "public" ? "otr_trip_person_receipt_reader" : role}','ai2c5_hostile.authority()','EXECUTE')`,
        );
      }
      for (const privilege of ["usage", "select", "update"])
        await probe(
          `gateway sequence ${privilege}`,
          `grant ${privilege} on sequence ai2c5_hostile.seq to otr_trip_person_command_gateway`,
          `revoke ${privilege} on sequence ai2c5_hostile.seq from otr_trip_person_command_gateway`,
          `select has_sequence_privilege('otr_trip_person_command_gateway','ai2c5_hostile.seq','${privilege}')`,
        );
      await probe(
        "schema CREATE",
        "grant create on schema ai2c5_hostile to otr_trip_person_command_gateway",
        "revoke create on schema ai2c5_hostile from otr_trip_person_command_gateway",
        "select has_schema_privilege('otr_trip_person_command_gateway','ai2c5_hostile','CREATE')",
      );
      await probe(
        "inherited membership",
        "grant ai2c5_donor to otr_trip_person_command_gateway with inherit true,set false",
        "revoke ai2c5_donor from otr_trip_person_command_gateway",
        "select exists(select 1 from pg_auth_members where member='otr_trip_person_command_gateway'::regrole)",
      );
      await probe(
        "SET ROLE path from service",
        "grant otr_trip_person_command_gateway to service_role with inherit false,set true",
        "revoke otr_trip_person_command_gateway from service_role",
        "select exists(select 1 from pg_auth_members where roleid='otr_trip_person_command_gateway'::regrole)",
      );
      await probe(
        "unexpected ownership",
        "alter sequence ai2c5_hostile.seq owner to otr_trip_person_command_gateway",
        "alter sequence ai2c5_hostile.seq owner to supabase_admin",
        "select relowner='otr_trip_person_command_gateway'::regrole from pg_class where oid='ai2c5_hostile.seq'::regclass",
      );
      await probe(
        "PUBLIC default EXECUTE",
        "alter default privileges in schema public grant execute on functions to public",
        "alter default privileges in schema public revoke execute on functions from public",
        "select exists(select 1 from pg_default_acl where defaclnamespace='public'::regnamespace and defaclobjtype='f')",
      );
    } finally {
      sql("drop schema ai2c5_hostile cascade;drop role ai2c5_donor");
    }
  });
if (mode === "forward")
  test("populated forward preserves all old row data, protected code, B/C schema", () => {
    absent();
    const rowSnapshot = () => {
      const names = sql(
        "select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname",
      ).split("\n");
      return Object.fromEntries(
        names.map((n) => [
          n,
          sql(
            `select coalesce(jsonb_agg(r order by r::text),'[]'::jsonb) from (select to_jsonb(t) r from public.\"${n}\" t) x`,
          ),
        ]),
      );
    };
    const before = rowSnapshot();
    const schemas = sql(
      "select jsonb_agg(jsonb_build_array(n.nspname,c.relname,pg_get_constraintdef(k.oid)) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname<>'trip_person_command_gate'",
    );
    apply();
    const after = rowSnapshot();
    for (const [name, data] of Object.entries(before)) {
      if (name === "trip_person_command_gate") {
        assert.equal(
          after[name],
          '[{"enabled": false, "singleton": true, "generation": 0}]',
        );
      } else assert.equal(after[name], data, name);
    }
    assert.equal(
      sql(
        "select jsonb_agg(jsonb_build_array(n.nspname,c.relname,pg_get_constraintdef(k.oid)) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname<>'trip_person_command_gate'",
      ),
      schemas,
    );
    assert.equal(
      sql("select public.trip_person_activation_security_check(true,false)"),
      "t",
    );
    console.log(`Populated forward ${Object.keys(before).length} old tables preserved`);
  });
const asyncSql = (input) =>
  new Promise((resolve, reject) => {
    const p = spawn("docker", [
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
    let out = "",
      err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(Error(err))));
    p.stdin.end(input);
  });
if (mode === "fence")
  test("real exclusive fence and competing stale admin requests", async (t) => {
    await t.test("same-generation concurrent admin only one wins", async () => {
      const g = Number(sql("select generation from public.trip_person_command_gate"));
      const replies = await Promise.allSettled([
        asyncSql(`select public.trip_person_set_command_gate(${g},true)`),
        asyncSql(`select public.trip_person_set_command_gate(${g},false)`),
      ]);
      assert.equal(replies.filter((r) => r.status === "fulfilled").length, 1);
      assert.match(
        replies.find((r) => r.status === "rejected").reason.message,
        /PARTICIPATION_GATE_GENERATION_CONFLICT/,
      );
      sql(`select public.trip_person_set_command_gate(${g + 1},false)`, "postgres");
    });
    await t.test(
      "exclusive closure waits for shared command activation fence",
      async () => {
        const g = Number(sql("select generation from public.trip_person_command_gate"));
        const reader = spawn("docker", [
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
        let out = "";
        reader.stdout.on("data", (d) => (out += d));
        const closed = new Promise((resolve, reject) => {
          reader.on("error", reject);
          reader.on("close", (c) => (c === 0 ? resolve() : reject(Error(`reader ${c}`))));
        });
        reader.stdin.write(
          "begin;select pg_advisory_xact_lock_shared(hashtextextended('otr-trip-person-activation',0));select 'fence-held';\n",
        );
        const deadline = Date.now() + 8000;
        while (!out.includes("fence-held")) {
          assert.ok(Date.now() < deadline);
          await new Promise((r) => setTimeout(r, 20));
        }
        let finished = false;
        const transition = asyncSql(
          `set application_name='ai2c5-admin-waiter';select public.trip_person_set_command_gate(${g},false)`,
        ).then(() => (finished = true));
        while (
          sql(
            "select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='ai2c5-admin-waiter' and l.locktype='advisory' and not l.granted",
          ) === "0"
        ) {
          assert.ok(Date.now() < deadline);
          await new Promise((r) => setTimeout(r, 20));
        }
        assert.equal(finished, false);
        reader.stdin.end("commit;\n");
        await closed;
        await transition;
        assert.equal(sql("select not enabled from public.trip_person_command_gate"), "t");
      },
    );
  });

if (mode === "p2")
  test("fixed activation inventory rejects trusted DBA/environment drift", async (t) => {
    const negative = `do $probe$ declare rejected boolean:=false; begin
      begin perform public.trip_person_activation_security_check(true,false);
      exception when others then rejected:=true; end;
      if not rejected then raise exception 'probe inventory accepted drift'; end if;
    end $probe$;`;
    const openRejected = `set session authorization postgres;
      do $probe$ declare rejected boolean:=false; g bigint; begin
        select generation into g from public.trip_person_command_gate;
        begin perform public.trip_person_set_command_gate(g,true);
        exception when others then rejected:=true; end;
        if not rejected then raise exception 'probe OPEN accepted drift'; end if;
        if (select enabled or generation<>g from public.trip_person_command_gate) then
          raise exception 'probe rejected OPEN changed gate'; end if;
      end $probe$; reset session authorization;`;
    const discoveryRejected = `set session authorization otr_trip_person_command_gateway;
      do $probe$ declare rejected boolean:=false; begin
        begin perform public.trip_person_runtime_state();
        exception when others then rejected:=true; end;
        if not rejected then raise exception 'probe discovery accepted drift'; end if;
      end $probe$; reset session authorization;`;
    const probes = [
      [
        "reviewer runtime body",
        'create or replace function public.trip_person_runtime_state() returns jsonb language sql stable security definer set search_path=pg_catalog as $$select \'{"review_canary":"unreviewed-body"}\'::jsonb$$',
        false,
      ],
      [
        "reviewer runtime owner",
        "alter function public.trip_person_runtime_state() owner to postgres",
      ],
      [
        "runtime SECURITY INVOKER",
        "alter function public.trip_person_runtime_state() security invoker",
      ],
      [
        "runtime config",
        "alter function public.trip_person_runtime_state() set search_path=public",
      ],
      [
        "runtime volatility",
        "alter function public.trip_person_runtime_state() volatile",
      ],
      ["runtime strictness", "alter function public.trip_person_runtime_state() strict"],
      [
        "runtime leakproof",
        "alter function public.trip_person_runtime_state() leakproof",
      ],
      [
        "indirect trip_event_keys body",
        "create or replace function public.trip_event_keys(j jsonb,required text[],optional text[] default '{}') returns boolean language sql immutable set search_path=pg_catalog as $$select true$$",
      ],
      [
        "indirect helper owner",
        "alter function public.trip_event_keys(jsonb,text[],text[]) owner to supabase_admin",
      ],
      [
        "indirect helper config",
        "alter function public.trip_event_canonical_json(json,integer) set search_path=public",
      ],
      [
        "same-name helper overload",
        "create function public.trip_event_keys(text) returns boolean language sql as $$select true$$",
      ],
      [
        "wrong-schema helper",
        "create function extensions.trip_event_keys(jsonb,text[],text[]) returns boolean language sql as $$select true$$",
      ],
      [
        "runtime PUBLIC EXECUTE",
        "grant execute on function public.trip_person_runtime_state() to public",
      ],
      [
        "reviewer runtime authenticated EXECUTE",
        "grant execute on function public.trip_person_runtime_state() to authenticated",
      ],
      [
        "reviewer runtime service_role EXECUTE",
        "grant execute on function public.trip_person_runtime_state() to service_role",
      ],
      [
        "indirect helper API EXECUTE",
        "grant execute on function public.trip_event_keys(jsonb,text[],text[]) to authenticated",
      ],
      [
        "reader inherited application path",
        "grant otr_trip_person_receipt_reader to authenticated with inherit true,set false",
      ],
      [
        "reader SET ROLE application path",
        "grant otr_trip_person_receipt_reader to service_role with inherit false,set true",
      ],
      [
        "default API EXECUTE",
        "alter default privileges in schema public grant execute on functions to authenticated with grant option",
      ],
      [
        "reviewer disabled gate trigger",
        "alter table public.trip_person_command_gate disable trigger trip_person_command_gate_transition",
      ],
      [
        "replica gate trigger state",
        "alter table public.trip_person_command_gate enable replica trigger trip_person_command_gate_transition",
      ],
      [
        "always gate trigger state",
        "alter table public.trip_person_command_gate enable always trigger trip_person_command_gate_transition",
      ],
      [
        "replaced gate trigger function",
        "create or replace function public.trip_person_command_gate_transition_guard() returns trigger language plpgsql set search_path=pg_catalog as $$begin return NEW; end$$",
      ],
      [
        "gate trigger wrong function",
        "drop trigger trip_person_command_gate_transition on public.trip_person_command_gate; create trigger trip_person_command_gate_transition before update or delete on public.trip_person_command_gate for each row execute function public.touch_updated_at()",
      ],
      [
        "extra gate trigger",
        "create trigger hostile_activation_trigger before update on public.trip_person_command_gate for each row execute function public.trip_person_command_gate_transition_guard()",
      ],
      [
        "generation bound removed",
        "alter table public.trip_person_command_gate drop constraint trip_person_gate_generation",
      ],
      [
        "generation bound weakened",
        "alter table public.trip_person_command_gate drop constraint trip_person_gate_generation; alter table public.trip_person_command_gate add constraint trip_person_gate_generation check(generation>=0)",
      ],
      [
        "singleton weakened",
        "alter table public.trip_person_command_gate drop constraint trip_person_command_gate_singleton_check; alter table public.trip_person_command_gate add constraint trip_person_command_gate_singleton_check check(true)",
      ],
      [
        "close capacity removed",
        "alter table public.trip_person_command_gate drop constraint trip_person_gate_close_capacity",
      ],
      [
        "generation NULL permitted",
        "alter table public.trip_person_command_gate alter column generation drop not null",
      ],
      [
        "generation default changed",
        "alter table public.trip_person_command_gate alter column generation set default 1",
      ],
      [
        "gate PK removed",
        "alter table public.trip_person_command_gate drop constraint trip_person_command_gate_pkey",
      ],
      [
        "gate RLS disabled",
        "alter table public.trip_person_command_gate disable row level security",
      ],
      [
        "gate FORCE RLS removed",
        "alter table public.trip_person_command_gate no force row level security",
      ],
      [
        "Member RLS disabled",
        "alter table public.journey_members disable row level security",
      ],
      [
        "receipt RLS disabled",
        "alter table public.trip_person_participation_receipts disable row level security",
      ],
      [
        "reviewer broad writer UPDATE policy",
        "alter policy trip_person_activation_writer_update on public.journey_members using(true) with check(true)",
      ],
      [
        "writer policy role broadened",
        "alter policy trip_person_activation_writer_update on public.journey_members to public",
      ],
      [
        "writer USING altered",
        "alter policy trip_person_activation_writer_update on public.journey_members using(true)",
      ],
      [
        "writer WITH CHECK altered",
        "alter policy trip_person_activation_writer_update on public.journey_members with check(true)",
      ],
      [
        "writer SELECT policy altered",
        "alter policy trip_person_activation_writer_read on public.journey_members using(true)",
      ],
      [
        "reader gate policy altered",
        "alter policy trip_person_activation_reader_gate on public.trip_person_command_gate using(false)",
      ],
      [
        "extra permissive writer policy",
        "create policy hostile_writer on public.journey_members for update to otr_trip_person_lifecycle_writer using(true) with check(true)",
      ],
      [
        "receipt policy weakened",
        "alter policy trip_person_receipt_writer_insert on public.trip_person_participation_receipts with check(false)",
      ],
      [
        "writer extra UPDATE column",
        "grant update(display_name) on public.journey_members to otr_trip_person_lifecycle_writer",
      ],
      [
        "writer full UPDATE",
        "grant update on public.journey_members to otr_trip_person_lifecycle_writer",
      ],
      [
        "gateway positive EXECUTE removed",
        "revoke execute on function public.trip_person_runtime_state() from otr_trip_person_command_gateway",
      ],
      [
        "reader positive EXECUTE removed",
        "revoke execute on function public.trip_person_activation_security_check(boolean,boolean) from otr_trip_person_receipt_reader",
      ],
    ];
    for (const [label, fixture, directDiscovery = true] of probes)
      await t.test(label, () => {
        // Session-local rollback keeps the hostile DBA fixture intact after every
        // failed check/OPEN. A replaced entrypoint can execute arbitrary DBA SQL;
        // its canary is never admitted as reviewed state by the fixed inventory.
        const result = sql(`begin; ${fixture};
          create temporary table drift_before as
            select pg_get_functiondef('public.trip_person_runtime_state()'::regprocedure) runtime,
              (select jsonb_agg(row_to_json(p)::jsonb order by polname) from pg_policy p
               where polrelid='public.journey_members'::regclass) policies;
          ${negative} ${openRejected} ${directDiscovery ? discoveryRejected : ""}
          select not enabled from public.trip_person_command_gate;
          do $probe$ begin
            if (select runtime from drift_before)<>pg_get_functiondef('public.trip_person_runtime_state()'::regprocedure)
              or (select policies from drift_before) is distinct from
                 (select jsonb_agg(row_to_json(p)::jsonb order by polname) from pg_policy p where polrelid='public.journey_members'::regclass)
              then raise exception 'probe hostile fixture sanitized'; end if;
          end $probe$;
          rollback; select public.trip_person_activation_security_check(true,false);`);
        assert.equal(result, "t\nt");
      });
    await t.test(
      "checker replacement cannot bypass OPEN/discovery and CLOSE remains available",
      () => {
        assert.equal(
          sql(`begin; set session authorization postgres;
        select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),true) is not null;
        reset session authorization;
        create or replace function public.trip_person_activation_security_check(activated boolean,expected_login boolean) returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$begin return true; end$$;
        ${discoveryRejected}
        set session authorization postgres;
        select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),false) is not null;
        reset session authorization;
        ${openRejected}
        rollback; select public.trip_person_activation_security_check(true,false);`),
          "t\nt\nt",
        );
      },
    );
    await t.test("mutual inventory payload/root pin cannot be edited invisibly", () => {
      const original = sql(
        "select pg_get_functiondef('public.trip_person_activation_security_check(boolean,boolean)'::regprocedure)",
      );
      const altered = original.replace(
        '"owner":"otr_trip_person_receipt_reader"',
        '"owner":"postgres"',
      );
      assert.notEqual(original, altered);
      assert.equal(
        sql(
          `begin; ${altered}; ${openRejected} ${discoveryRejected} rollback; select public.trip_person_activation_security_check(true,false);`,
        ),
        "t",
      );
    });
    await t.test(
      "positive restored inventory OPEN/CLOSE without runtime activation",
      () => {
        assert.equal(
          sql(`begin; select public.trip_person_activation_security_check(true,false);
        set session authorization postgres;
        select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),true) is not null;
        select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),false) is not null;
        reset session authorization;
        select not enabled from public.trip_person_command_gate;
        rollback;`),
          "t\nt\nt\nt",
        );
      },
    );
  });

if (mode === "root")
  test("independent reviewed anchor rejects jointly forged graph", async (t) => {
    const quote = (v) => `'${v.replaceAll("'", "''")}'`;
    const definition = (sig) =>
      sql(
        `set search_path=pg_catalog;select pg_get_functiondef(${quote(sig)}::regprocedure)`,
      );
    const checker = definition(
      "public.trip_person_activation_security_check(boolean,boolean)",
    );
    const setter = definition("public.trip_person_set_command_gate(bigint,boolean)");
    const runtime = definition("public.trip_person_runtime_state()");
    const anchor = definition("public.trip_person_activation_reviewed_root()");
    const reviewedRoot = checker.match(/\/\*activation-root\*\/'([0-9a-f]{64})'/)[1];
    const normalize = (v) =>
      v
        .replace(/\$inventory\$[\s\S]*?\$inventory\$/g, "$inventory$PINNED$inventory$")
        .replace(
          /(\/\*activation-(?:root|checker|anchor)\*\/)\'[0-9a-f]{64}\'/g,
          "$1'PINNED'",
        );
    const rejected = (statement, pattern = "UNSAFE_PARTICIPATION_ACTIVATION") =>
      `do $reject$ declare denied boolean:=false; begin
        begin ${statement}; exception when others then
          if SQLERRM not like ${quote(`%${pattern}%`)} then raise; end if; denied:=true;
        end; if not denied then raise exception 'probe forged graph accepted'; end if;
      end $reject$;`;
    const check = rejected(
      "perform public.trip_person_activation_security_check(true,false)",
    );
    const open = `set session authorization postgres;${rejected("perform public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),true)")}reset session authorization;`;
    const discover = `set session authorization otr_trip_person_command_gateway;${rejected("perform public.trip_person_runtime_state()")}reset session authorization;`;
    const audit = readFileSync(
      "scripts/supabase/trip-person-gateway-security-inventory.sql",
      "utf8",
    ).match(/do \$audit\$[\s\S]*?end \$audit\$;/)[0];
    sql(`begin read only;${audit}rollback;`);
    for (const kind of ["disabled trigger", "broadened writer policy", "indirect helper"])
      await t.test(`${kind} + payload + all normalized roots`, () => {
        const inventory = JSON.parse(
          checker.match(/\$inventory\$([\s\S]*?)\$inventory\$/)[1],
        );
        let fixture, intact;
        if (kind === "disabled trigger") {
          inventory.tables["public.trip_person_command_gate"].triggers[0][1] = "D";
          fixture =
            "alter table public.trip_person_command_gate disable trigger trip_person_command_gate_transition";
          intact =
            "(select tgenabled='D' from pg_trigger where tgrelid='public.trip_person_command_gate'::regclass and tgname='trip_person_command_gate_transition')";
        } else if (kind === "indirect helper") {
          fixture =
            "create or replace function public.trip_event_keys(j jsonb,required text[],optional text[] default '{}') returns boolean language sql immutable set search_path=pg_catalog as $$select true$$";
          const digest = sql(
            `begin;${fixture};set search_path=pg_catalog;select encode(extensions.digest(pg_get_functiondef('public.trip_event_keys(jsonb,text[],text[])'::regprocedure),'sha256'),'hex');rollback;`,
          );
          inventory.functions["public.trip_event_keys(jsonb,text[],text[])"].hash =
            digest;
          intact =
            "(select pg_get_functiondef('public.trip_event_keys(jsonb,text[],text[])'::regprocedure) like '%select true%')";
        } else {
          const policy = inventory.tables["public.journey_members"].policies.find(
            (p) => p[0] === "trip_person_activation_writer_update",
          );
          policy[4] = "true";
          policy[5] = "true";
          fixture =
            "alter policy trip_person_activation_writer_update on public.journey_members using(true) with check(true)";
          intact =
            "(select pg_get_expr(polqual,polrelid)='true' and pg_get_expr(polwithcheck,polrelid)='true' from pg_policy where polrelid='public.journey_members'::regclass and polname='trip_person_activation_writer_update')";
        }
        const payload = JSON.stringify(inventory);
        const forgedRoot = sql(
          `select encode(extensions.digest(${quote(payload)}::jsonb::text,'sha256'),'hex')`,
        );
        assert.notEqual(reviewedRoot, forgedRoot);
        const forgedChecker = checker
          .replace(
            /\$inventory\$[\s\S]*?\$inventory\$/,
            () => `$inventory$${payload}$inventory$`,
          )
          .replaceAll(reviewedRoot, forgedRoot);
        const forgedSetter = setter.replaceAll(reviewedRoot, forgedRoot),
          forgedRuntime = runtime.replaceAll(reviewedRoot, forgedRoot);
        for (const [original, forged] of [
          [checker, forgedChecker],
          [setter, forgedSetter],
          [runtime, forgedRuntime],
        ])
          assert.equal(normalize(original), normalize(forged));
        const output =
          sql(`begin;create temporary table initial_gate as select * from public.trip_person_command_gate;
          ${fixture};${forgedChecker};${forgedSetter};${forgedRuntime};
          ${check}${open}${discover}
          ${rejected(`execute ${quote(audit)}`)}
          select not enabled and generation=(select generation from initial_gate) from public.trip_person_command_gate;
          select ${intact};
          select btrim(pg_get_functiondef('public.trip_person_activation_reviewed_root()'::regprocedure),chr(10)||chr(13)||' ')=${quote(anchor)};
          rollback;select public.trip_person_activation_security_check(true,false);`);
        assert.equal(output, "t\nt\nt\nt");
      });
    const hostile = [
      [
        "anchor value/body",
        "create or replace function public.trip_person_activation_reviewed_root() returns text language sql immutable set search_path=pg_catalog as $$select repeat('0',64)$$",
      ],
      [
        "anchor owner",
        "alter function public.trip_person_activation_reviewed_root() owner to supabase_admin",
      ],
      [
        "anchor PUBLIC EXECUTE",
        "grant execute on function public.trip_person_activation_reviewed_root() to public",
      ],
      [
        "anchor authenticated EXECUTE",
        "grant execute on function public.trip_person_activation_reviewed_root() to authenticated",
      ],
      [
        "anchor service EXECUTE",
        "grant execute on function public.trip_person_activation_reviewed_root() to service_role",
      ],
      [
        "anchor gateway EXECUTE",
        "grant execute on function public.trip_person_activation_reviewed_root() to otr_trip_person_command_gateway",
      ],
      [
        "anchor reader membership path",
        "grant otr_trip_person_receipt_reader to authenticated with inherit false,set true",
      ],
      [
        "anchor SECURITY DEFINER",
        "alter function public.trip_person_activation_reviewed_root() security definer",
      ],
      [
        "anchor config",
        "alter function public.trip_person_activation_reviewed_root() set search_path=public",
      ],
      [
        "anchor overload",
        "create function public.trip_person_activation_reviewed_root(text) returns text language sql as $$select 'hostile'::text$$",
      ],
      [
        "anchor wrong-schema alias",
        "create function extensions.trip_person_activation_reviewed_root() returns text language sql as $$select 'hostile'::text$$",
      ],
    ];
    for (const [label, fixture] of hostile)
      await t.test(label, () =>
        assert.equal(
          sql(
            `begin;${fixture};${check}${open}${discover}rollback;select public.trip_person_activation_security_check(true,false);`,
          ),
          "t",
        ),
      );
    await t.test("anchor corruption leaves trusted CLOSE usable", () => {
      assert.equal(
        sql(`begin;set session authorization postgres;
        select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),true) is not null;
        reset session authorization;
        alter function public.trip_person_activation_reviewed_root() owner to supabase_admin;
        set session authorization postgres;
        select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),false) is not null;
        reset session authorization;
        select not enabled from public.trip_person_command_gate;
        ${check}${open}${discover}rollback;select public.trip_person_activation_security_check(true,false);`),
        "t\nt\nt\nt",
      );
    });
    assert.doesNotMatch(anchor, /activation-(?:root|checker|anchor)|\$inventory\$/);
  });

if (mode === "scope")
  test("generic isolated principals and recursive application capability paths", async (t) => {
    const beforeRoot = sql("select public.trip_person_activation_reviewed_root()");
    const init =
      "create role as_scope_candidate nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls noreplication;create role as_scope_bridge nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls noreplication;";
    const reject = (statement) =>
      `do $scope$ declare denied boolean:=false;begin begin ${statement};exception when others then denied:=true;end;if not denied then raise exception 'scope probe accepted unsafe principal';end if;end $scope$;`;
    await t.test(
      "two opaque isolated roles leave reviewed root stable and OPEN/CLOSE usable",
      () => {
        assert.equal(
          sql(`begin;${init}select public.trip_person_activation_security_check(true,false);
        set session authorization postgres;
        select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),true) is not null;
        select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),false) is not null;
        reset session authorization;rollback;select public.trip_person_activation_security_check(true,false);`),
          "t\nt\nt\nt",
        );
      },
    );
    const probes = [
      ["LOGIN", "alter role as_scope_candidate login"],
      ["INHERIT flag", "alter role as_scope_candidate inherit"],
      ["BYPASSRLS", "alter role as_scope_candidate bypassrls"],
      ["CREATEROLE", "alter role as_scope_candidate createrole"],
      ["CREATEDB", "alter role as_scope_candidate createdb"],
      ["SUPERUSER", "alter role as_scope_candidate superuser"],
      ["REPLICATION", "alter role as_scope_candidate replication"],
      [
        "application INHERIT",
        "grant as_scope_candidate to authenticated with inherit true,set false",
      ],
      [
        "service SET ROLE",
        "grant as_scope_candidate to service_role with inherit false,set true",
      ],
      [
        "application ADMIN",
        "grant as_scope_candidate to authenticated with admin true,inherit false,set false",
      ],
      [
        "ambiguous inactive membership",
        "grant as_scope_candidate to authenticated with admin false,inherit false,set false",
      ],
      [
        "recursive SET path",
        "grant as_scope_bridge to authenticated with inherit false,set true;grant as_scope_candidate to as_scope_bridge with inherit false,set true",
      ],
      [
        "recursive INHERIT path",
        "grant as_scope_bridge to authenticated with inherit true,set false;grant as_scope_candidate to as_scope_bridge with inherit true,set false",
      ],
      [
        "recursive mixed path",
        "grant as_scope_bridge to service_role with inherit false,set true;grant as_scope_candidate to as_scope_bridge with inherit true,set false",
      ],
      [
        "recursive ADMIN path",
        "grant as_scope_bridge to authenticated with admin true,inherit false,set false;grant as_scope_candidate to as_scope_bridge with admin true,inherit false,set false",
      ],
      [
        "outgoing protected bridge",
        "grant otr_trip_person_receipt_reader to as_scope_candidate with inherit false,set true",
      ],
      [
        "outgoing reverse bridge",
        "grant as_scope_bridge to as_scope_candidate with inherit false,set true;grant otr_trip_person_lifecycle_writer to as_scope_bridge with inherit true,set false",
      ],
      [
        "direct private EXECUTE",
        "grant execute on function public.trip_person_runtime_state() to as_scope_candidate",
      ],
      [
        "direct checker EXECUTE",
        "grant execute on function public.trip_person_activation_security_check(boolean,boolean) to as_scope_candidate",
      ],
      [
        "direct anchor EXECUTE",
        "grant execute on function public.trip_person_activation_reviewed_root() to as_scope_candidate",
      ],
      [
        "A gate SELECT",
        "grant select on public.trip_person_command_gate to as_scope_candidate",
      ],
      ["A Member UPDATE", "grant update on public.journey_members to as_scope_candidate"],
      [
        "A column UPDATE",
        "grant update(participation_active) on public.journey_members to as_scope_candidate",
      ],
      [
        "A receipt SELECT",
        "grant select on public.trip_person_participation_receipts to as_scope_candidate",
      ],
      [
        "A object ownership",
        "alter function public.trip_person_runtime_state() owner to as_scope_candidate",
      ],
      ["schema CREATE", "grant create on schema public to as_scope_candidate"],
      ["database CREATE", "grant create on database postgres to as_scope_candidate"],
      [
        "shared PUBLIC ACL revoked",
        "revoke execute on function public.touch_updated_at() from public",
      ],
      [
        "other shared PUBLIC ACL revoked",
        "revoke execute on function auth.role() from public",
      ],
      [
        "private PUBLIC EXECUTE",
        "grant execute on function public.trip_person_runtime_state() to public",
      ],
      [
        "shared definition drift",
        "create or replace function public.trip_event_keys(j jsonb,required text[],optional text[] default '{}') returns boolean language sql immutable set search_path=pg_catalog as $$select true$$",
      ],
      [
        "SECURITY DEFINER ownership privilege path",
        "create function public.as_scope_authority() returns boolean language sql security definer as $$select true$$;revoke all on function public.as_scope_authority() from public,anon,authenticated,service_role;alter function public.as_scope_authority() owner to as_scope_candidate;grant execute on function public.as_scope_authority() to authenticated",
      ],
      [
        "same naming pattern but reachable",
        "alter role as_scope_candidate rename to as_internal_execution_gateway;grant as_internal_execution_gateway to authenticated with set true,inherit false",
      ],
    ];
    for (const [label, fixture] of probes)
      await t.test(label, () => {
        assert.equal(
          sql(`begin;${init}create temporary table scope_gate as select * from public.trip_person_command_gate;${fixture};
        ${reject("perform public.trip_person_activation_security_check(true,false)")}
        set session authorization postgres;${reject("perform public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),true)")}reset session authorization;
        set session authorization otr_trip_person_command_gateway;${reject("perform public.trip_person_runtime_state()")}reset session authorization;
        select not enabled and generation=(select generation from scope_gate) from public.trip_person_command_gate;
        rollback;select public.trip_person_activation_security_check(true,false);`),
          "t\nt",
        );
      });
    assert.equal(sql("select public.trip_person_activation_reviewed_root()"), beforeRoot);
  });

if (mode === "compatibility")
  test("unchanged module journal principals cannot expand A application root", () => {
    assert.equal(
      sql("select public.trip_person_activation_security_check(true,false)"),
      "t",
    );
    // Integration fixture assertions only: no C-name exception exists in A SQL.
    assert.doesNotMatch(migration, /otr_trip_source_execution_(?:gateway|writer)/);
    assert.equal(
      sql(
        "select bool_and(not rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls and not rolcreatedb and not rolcreaterole and not rolreplication) from pg_roles where rolname in ('otr_trip_source_execution_gateway','otr_trip_source_execution_writer')",
      ),
      "t",
    );
    assert.equal(
      sql(
        "select count(*) from pg_auth_members where member in ('otr_trip_source_execution_gateway'::regrole,'otr_trip_source_execution_writer'::regrole) or roleid in ('otr_trip_source_execution_gateway'::regrole,'otr_trip_source_execution_writer'::regrole) and (member<>'postgres'::regrole or inherit_option or set_option)",
      ),
      "0",
    );
    assert.equal(
      sql(
        "select bool_and(not has_function_privilege(rolname,'public.trip_person_runtime_state()','EXECUTE') and not has_table_privilege(rolname,'public.trip_person_command_gate','SELECT,UPDATE')) from pg_roles where rolname in ('otr_trip_source_execution_gateway','otr_trip_source_execution_writer')",
      ),
      "t",
    );
    const counts = sql(
      "select rolname,count(*) from pg_roles r cross join pg_proc p join pg_namespace n on n.oid=p.pronamespace where r.rolname in ('otr_trip_source_execution_gateway','otr_trip_source_execution_writer') and n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') and exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') and has_function_privilege(r.oid,p.oid,'EXECUTE') group by rolname order by rolname",
    );
    console.log(`Integrated shared PUBLIC execution: ${counts}`);
    sql(
      "begin;set session authorization otr_trip_source_execution_gateway;select public.trip_source_execution_inventory();reset session authorization;rollback;",
    );
    const output = sql(
      "begin;set session authorization postgres;select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),true) is not null;select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate),false) is not null;reset session authorization;rollback;",
    );
    assert.equal(output, "t\nt");
  });

if (mode === "integrated")
  test("full unchanged A SQL plus external accepted module SQL on 74-version replay", async (t) => {
    sql("create extension if not exists pgtap with schema extensions");
    let total = 0;
    const files = readdirSync("supabase/tests")
      .filter((n) => n.endsWith(".sql"))
      .sort()
      .map((n) => [
        [
          "rls_matrix.test.sql",
          "trip_source_command_foundation.test.sql",
          "trip_source_protected_foundation.test.sql",
        ].includes(n)
          ? `/private/tmp/otr-ai2c5/integrated-tests/${n}`
          : `supabase/tests/${n}`,
        n,
      ]);
    files.push([
      "/private/tmp/otr-ai2c5/C00300.test.sql",
      "external accepted module journal",
    ]);
    for (const [path, label] of files)
      await t.test(label, () => {
        const output = sql(
          "set search_path=public,extensions;\n" + readFileSync(path, "utf8"),
          label === "trip_event_collection.test.sql" ? "supabase_admin" : "postgres",
        );
        assert.doesNotMatch(output, /(?:^|\n)\s*not ok\b/);
        const plan = [...output.matchAll(/(?:^|\n)\s*1\.\.(\d+)/g)].at(-1);
        assert.ok(plan, label);
        assert.equal(
          [...output.matchAll(/(?:^|\n)\s*ok\s+\d+\b/g)].length,
          Number(plan[1]),
        );
        total += Number(plan[1]);
      });
    assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "74");
    assert.equal(
      sql("select not enabled and generation=0 from public.trip_person_command_gate"),
      "t",
    );
    assert.equal(
      sql("select public.trip_person_activation_security_check(true,false)"),
      "t",
    );
    console.log(`Integrated SQL ${files.length} files / ${total} assertions`);
  });
