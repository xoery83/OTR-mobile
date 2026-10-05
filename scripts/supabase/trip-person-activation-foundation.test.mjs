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
if (!["reuse", "sql", "fence", "forward", "p2", "root"].includes(mode))
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
    for (const kind of ["disabled trigger", "broadened writer policy"])
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
