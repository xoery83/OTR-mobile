import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { once } from "node:events";

const root = "/Users/xoery/Project/otr-mobile-import";
assert.equal(process.cwd(), root);
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  "55a35bc2174e2abacc5c1a1bb6206b9918209e3b",
);
const container = "supabase_db_otr-trip-ci3h";
const migration = readFileSync(
  "supabase/migrations/20261005000300_trip_source_execution_journal.sql",
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
    { cwd: root, input, encoding: "utf8", stdio: "pipe", maxBuffer: 128 * 1024 * 1024 },
  ).trim();
const absent = () =>
  assert.equal(
    sql("select to_regclass('public.trip_source_execution_attempts') is null"),
    "t",
  );
const mode = process.argv[2];
if (mode === "reuse")
  test("hostile reuse rejects atomically and preserves fixtures", async (t) => {
    absent();
    for (const role of [
      "otr_trip_source_execution_writer",
      "otr_trip_source_execution_gateway",
    ])
      sql(
        `create role ${role} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
        "postgres",
      );
    sql(
      "create schema ci3h_hostile;create role ci3h_donor nologin;create table ci3h_hostile.data(id integer);create sequence ci3h_hostile.seq;create function ci3h_hostile.authority() returns void language sql as 'select';revoke all on function ci3h_hostile.authority() from public;grant usage on schema ci3h_hostile to public",
    );
    const probe = async (name, change, restore, evidence) =>
      t.test(name, () => {
        sql(change);
        try {
          assert.equal(sql(evidence), "t");
          assert.throws(
            () => sql(migration),
            (e) => e.stderr.includes("UNSAFE_TRIP_SOURCE_EXECUTION"),
          );
          absent();
          assert.equal(sql(evidence), "t", "no sanitation or ownership transfer");
        } finally {
          sql(restore);
        }
      });
    try {
      for (const role of [
        "otr_trip_source_execution_writer",
        "otr_trip_source_execution_gateway",
      ]) {
        for (const [attr, column] of [
          ["login", "rolcanlogin"],
          ["superuser", "rolsuper"],
          ["createdb", "rolcreatedb"],
          ["createrole", "rolcreaterole"],
          ["inherit", "rolinherit"],
          ["bypassrls", "rolbypassrls"],
          ["replication", "rolreplication"],
        ])
          await probe(
            role + " " + attr,
            `alter role ${role} ${attr}`,
            `alter role ${role} no${attr}`,
            `select ${column} from pg_roles where rolname='${role}'`,
          );
        await probe(
          role + " schema CREATE",
          `grant create on schema ci3h_hostile to ${role}`,
          `revoke create on schema ci3h_hostile from ${role}`,
          `select has_schema_privilege('${role}','ci3h_hostile','CREATE')`,
        );
        await probe(
          role + " table SELECT",
          `grant select on ci3h_hostile.data to ${role}`,
          `revoke select on ci3h_hostile.data from ${role}`,
          `select has_table_privilege('${role}','ci3h_hostile.data','SELECT')`,
        );
        await probe(
          role + " live column UPDATE",
          `grant update(id) on ci3h_hostile.data to ${role}`,
          `revoke update(id) on ci3h_hostile.data from ${role}`,
          `select has_column_privilege('${role}','ci3h_hostile.data','id','UPDATE')`,
        );
        await probe(
          role + " sequence",
          `grant usage on ci3h_hostile.seq to ${role}`,
          `revoke usage on ci3h_hostile.seq from ${role}`,
          `select has_sequence_privilege('${role}','ci3h_hostile.seq','USAGE')`,
        );
        await probe(
          role + " direct EXECUTE",
          `grant execute on function ci3h_hostile.authority() to ${role}`,
          `revoke execute on function ci3h_hostile.authority() from ${role}`,
          `select has_function_privilege('${role}','ci3h_hostile.authority()','EXECUTE')`,
        );
        await probe(
          role + " inherited EXECUTE",
          `grant execute on function ci3h_hostile.authority() to ci3h_donor;grant ci3h_donor to ${role} with inherit true,set true`,
          `revoke ci3h_donor from ${role};revoke execute on function ci3h_hostile.authority() from ci3h_donor`,
          `select pg_has_role('${role}','ci3h_donor','MEMBER')`,
        );
        await probe(
          role + " incoming SET ROLE",
          `grant ${role} to service_role with inherit false,set true`,
          `revoke ${role} from service_role`,
          `select pg_has_role('service_role','${role}','SET')`,
        );
        await probe(
          role + " default ACL",
          `alter default privileges in schema ci3h_hostile grant select on tables to ${role}`,
          `alter default privileges in schema ci3h_hostile revoke select on tables from ${role}`,
          `select exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where a.grantee='${role}'::regrole)`,
        );
        for (const [kind, create, drop, catalog, object] of [
          [
            "domain",
            "create domain ci3h_hostile.owned as integer",
            "drop domain ci3h_hostile.owned",
            "pg_type",
            "ci3h_hostile.owned",
          ],
          [
            "collation",
            "create collation ci3h_hostile.owned (provider=icu,locale='und')",
            "drop collation ci3h_hostile.owned",
            "pg_collation",
            "ci3h_hostile.owned",
          ],
        ]) {
          const oid =
            catalog === "pg_type" ? `'${object}'::regtype` : `'${object}'::regcollation`;
          await probe(
            role + " owns " + kind,
            `${create};grant create on schema ci3h_hostile to ${role};alter ${kind} ${object} owner to ${role};revoke create on schema ci3h_hostile from ${role}`,
            drop,
            `select exists(select 1 from pg_shdepend where classid='${catalog}'::regclass and objid=${oid} and refobjid='${role}'::regrole and deptype='o')`,
          );
        }
        for (const [name, signature] of [
          ["public.trip_source_execution_claim", "text"],
          ["ci3h_hostile.trip_source_execution_inventory", ""],
        ])
          await probe(
            role + " unexpected overload/schema " + name,
            `create function ${name}(${signature}) returns void language sql as 'select';grant create on schema ${name.split(".")[0]} to ${role};alter function ${name}(${signature}) owner to ${role};revoke create on schema ${name.split(".")[0]} from ${role}`,
            `drop function ${name}(${signature})`,
            `select proowner='${role}'::regrole from pg_proc where oid='${name}(${signature})'::regprocedure`,
          );
      }
      for (const [objectType, privilege] of [
        ["tables", "select"],
        ["functions", "execute"],
      ])
        await probe(
          "foreign materialized default " + objectType,
          `alter default privileges in schema public grant ${privilege} on ${objectType} to ci3h_donor`,
          `alter default privileges in schema public revoke ${privilege} on ${objectType} from ci3h_donor`,
          "select exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where a.grantee='ci3h_donor'::regrole)",
        );
      await probe(
        "PUBLIC EXECUTE",
        "grant execute on function ci3h_hostile.authority() to public",
        "revoke execute on function ci3h_hostile.authority() from public",
        "select has_function_privilege('otr_trip_source_execution_gateway','ci3h_hostile.authority()','EXECUTE')",
      );
      await probe(
        "PUBLIC CREATE",
        "grant create on schema ci3h_hostile to public",
        "revoke create on schema ci3h_hostile from public",
        "select has_schema_privilege('otr_trip_source_execution_gateway','ci3h_hostile','CREATE')",
      );
    } finally {
      sql("drop schema ci3h_hostile cascade;drop role ci3h_donor");
    }
  });
else if (mode === "install")
  test("populated additive install preserves all historical public/storage rows", () => {
    absent();
    const before = sql(
      "select coalesce(jsonb_object_agg(n,rows),'{}') from (select c.relname n,(xpath('/row/rows/text()',query_to_xml(format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) rows from public.%I t','[]',c.relname),false,true,'')))[1]::text rows from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') x",
    );
    const buckets = sql(
      "select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b",
    );
    sql(migration, "postgres");
    const after = sql(
      "select coalesce(jsonb_object_agg(n,rows),'{}') from (select c.relname n,(xpath('/row/rows/text()',query_to_xml(format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) rows from public.%I t','[]',c.relname),false,true,'')))[1]::text rows from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname not in ('trip_source_execution_attempts','trip_source_staged_resources')) x",
    );
    assert.equal(after, before);
    assert.equal(
      sql("select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b"),
      buckets,
    );
    assert.equal(sql("select enabled from public.trip_source_command_gate"), "f");
  });
else if (mode === "recovery")
  test("fresh-process durable responsibility and concurrent CAS", async (t) => {
    const id = (n) => "cd000000-0000-4000-8000-" + String(n).padStart(12, "0");
    const owner =
      "set session authorization otr_trip_source_command_gateway;set role otr_trip_source_execution_gateway;";
    const q = (text) => owner + text;
    const source = readFileSync(
      "supabase/tests/trip_source_execution_journal.test.sql",
      "utf8",
    );
    const setup = source.slice(0, source.indexOf("select no_plan();"));
    const register = (n, op, token) =>
      `select public.trip_source_execution_register('${id(op)}','${id(n)}',1,'${id(500)}','${id(600)}',repeat('b',64),'${id(token)}','PNG_STATIC_RGB8_RGBA8_V1','526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5');`;
    sql(
      setup +
        "reset role;grant otr_trip_source_execution_gateway to otr_trip_source_command_gateway with inherit false,set true;" +
        owner +
        register(231, 23, 701) +
        register(331, 33, 702) +
        "commit;",
    );
    const inventoryQuery = q("select public.trip_source_execution_inventory()");
    // Each reader is a genuinely fresh Node process and database connection: no
    // object/map/cache from the writer survives or supplies recovery responsibility.
    const inventory = () =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `import {execFileSync} from 'node:child_process';process.stdout.write(execFileSync('docker',${JSON.stringify(["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres"])},{cwd:${JSON.stringify(root)},input:${JSON.stringify(inventoryQuery)},encoding:'utf8'}));`,
          ],
          { cwd: root, encoding: "utf8", stdio: "pipe" },
        ),
      );
    const phase = (p) =>
      sql(
        q(
          `select public.trip_source_execution_advance('${id(231)}','${id(901)}',1,'${p}')`,
        ),
      );
    const claim = (n, f, o) =>
      q(`select public.trip_source_execution_claim('${id(n)}',${f},'${id(o)}')`);
    const concurrent = (input) =>
      new Promise((resolve) => {
        const child = spawn(
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
          { cwd: root, stdio: ["pipe", "pipe", "pipe"] },
        );
        let out = "",
          error = "";
        child.stdout.on("data", (c) => (out += c));
        child.stderr.on("data", (c) => (error += c));
        child.on("close", (code) => resolve({ code, out, error }));
        child.stdin.end(input);
      });
    await t.test(
      "STARTING without identity and UNKNOWN survive actual writer/reader process loss",
      () => {
        const rows = inventory();
        assert.equal(rows.length, 2);
        assert.equal(rows[0].phase, "STARTING");
        assert.equal(rows[0].container_id, null);
        assert.equal(rows[1].phase, "UNKNOWN");
        assert.ok(rows.every((x) => x.termination_outstanding));
      },
    );
    await t.test("concurrent first claims admit only one exact owner", async () => {
      const results = await Promise.all([
        concurrent(claim(231, 0, 901)),
        concurrent(claim(231, 0, 901)),
      ]);
      assert.equal(results.filter((x) => x.code === 0).length, 1);
      assert.equal(inventory()[0].owner_fence, 1);
    });
    const attach = (n, o, f, token, c) =>
      q(
        `select public.trip_source_execution_attach('${id(n)}','${id(o)}',${f},'${id(600)}','${id(token)}',repeat('${c}',64))`,
      );
    sql(attach(231, 901, 1, 701, "a"));
    await t.test("STARTING with exact identity survives", () =>
      assert.equal(inventory()[0].container_id, "a".repeat(64)),
    );
    await t.test(
      "committed RUNNING responsibility survives SIGKILL of the writer process",
      async () => {
        const input = q(
          `select public.trip_source_execution_advance('${id(231)}','${id(901)}',1,'RUNNING')`,
        );
        const child = spawn(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `import {execFileSync} from 'node:child_process';execFileSync('docker',${JSON.stringify(["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres"])},{cwd:${JSON.stringify(root)},input:${JSON.stringify(input)},stdio:['pipe','pipe','pipe']});process.stdout.write('COMMITTED');setInterval(()=>{},1000);`,
          ],
          { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
        );
        try {
          const [chunk] = await once(child.stdout, "data");
          assert.equal(chunk.toString(), "COMMITTED");
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
          assert.equal(inventory()[0].phase, "RUNNING");
          assert.equal(inventory()[0].termination_outstanding, true);
        } finally {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }
      },
    );
    for (const p of ["RUNNING", "TERMINATION_REQUIRED", "UNKNOWN"])
      await t.test(p + " survives fresh Backend process and no-memory recovery", () => {
        if (p !== "RUNNING") phase(p);
        assert.equal(inventory()[0].phase, p);
      });
    await t.test(
      "two concurrent takeover claims serialize on the resource/attempt fence",
      async () => {
        const results = await Promise.all([
          concurrent(claim(231, 1, 902)),
          concurrent(claim(231, 1, 903)),
        ]);
        assert.equal(results.filter((x) => x.code === 0).length, 1);
        assert.ok(
          results
            .filter((x) => x.code !== 0)
            .every((x) => x.error.includes("SOURCE_EXECUTION_FENCE_CONFLICT")),
        );
        assert.equal(inventory()[0].owner_fence, 2);
      },
    );
    await t.test("reconnect cannot restore stale owner authority", () =>
      assert.throws(
        () =>
          sql(
            q(
              `select public.trip_source_execution_advance('${id(231)}','${id(901)}',1,'UNKNOWN')`,
            ),
          ),
        (e) => e.stderr.includes("SOURCE_EXECUTION_FENCE_CONFLICT"),
      ),
    );
    await t.test("rollback after takeover retains previous durable owner", () => {
      const before = inventory()[0];
      sql("begin;" + claim(231, 2, 904) + ";rollback;");
      assert.deepEqual(inventory()[0], before);
    });
    await t.test("ABA returning owner epoch does not restore generation 1", () => {
      sql(claim(231, 2, 901));
      assert.equal(inventory()[0].owner_fence, 3);
      assert.throws(
        () =>
          sql(
            q(`select public.trip_source_execution_release('${id(231)}','${id(901)}',1)`),
          ),
        (e) => e.stderr.includes("SOURCE_EXECUTION_FENCE_CONFLICT"),
      );
    });
    await t.test(
      "different authenticated principal sees no obligations and cannot claim",
      () => {
        sql(
          "create role ci3h_other nologin;grant otr_trip_source_execution_gateway to ci3h_other with inherit false,set true;",
        );
        try {
          const other =
            "set session authorization ci3h_other;set role otr_trip_source_execution_gateway;";
          assert.equal(
            sql(other + "select public.trip_source_execution_inventory()"),
            "[]",
          );
          assert.throws(
            () =>
              sql(
                other +
                  `select public.trip_source_execution_claim('${id(231)}',3,'${id(905)}')`,
              ),
            (e) => e.stderr.includes("SOURCE_EXECUTION_FENCE_CONFLICT"),
          );
        } finally {
          sql(
            "revoke otr_trip_source_execution_gateway from ci3h_other;drop role ci3h_other",
          );
        }
      },
    );
    const terminal = (n, o, f, token, c) =>
      q(
        `select public.trip_source_execution_terminal('${id(n)}','${id(o)}',${f},'${id(600)}','${id(token)}',repeat('${c}',64),clock_timestamp(),repeat('d',64),'PARSER_TIMEOUT')`,
      );
    await t.test(
      "UNKNOWN reference blocks release even after another attempt is terminal",
      () => {
        sql(terminal(231, 901, 3, 701, "a"));
        const rows = inventory();
        assert.equal(rows[0].phase, "TERMINAL");
        assert.throws(
          () =>
            sql(
              q(
                `select public.trip_source_execution_release('${id(231)}','${id(901)}',3)`,
              ),
            ),
          (e) => e.stderr.includes("SOURCE_STAGE_PROTECTED"),
        );
      },
    );
    await t.test(
      "missing identity cannot seal terminal; retained current owner can later reconcile exact identity",
      () => {
        sql(claim(331, 0, 902));
        assert.throws(
          () => sql(terminal(331, 902, 1, 702, "b")),
          (e) => e.stderr.includes("SOURCE_EXECUTION_PROOF_CONFLICT"),
        );
        sql(attach(331, 902, 1, 702, "b"));
        sql(terminal(331, 902, 1, 702, "b"));
      },
    );
    await t.test(
      "parser proofs cannot release provider-UNKNOWN staging; separately observed quiescence permits cleanup",
      () => {
        assert.equal(
          sql(`select phase from public.trip_source_operations where id='${id(33)}'`),
          "IO_UNKNOWN",
        );
        assert.throws(
          () =>
            sql(
              q(
                `select public.trip_source_execution_release('${id(231)}','${id(901)}',3)`,
              ),
            ),
          (e) => e.stderr.includes("SOURCE_STAGE_PROTECTED"),
        );
        // Separate synthetic trusted C-I3D definitive observations, never inferred
        // from parser death. All local gate/grant changes restore before commit.
        sql(`begin;alter table public.trip_source_command_gate drop constraint trip_source_gate_closed;update public.trip_source_command_gate set enabled=true;
          grant select,update on public.trip_source_operations to otr_trip_source_writer;
          create policy ci3h_quiescence_fixture on public.trip_source_operations to otr_trip_source_writer using(true) with check(true);
          grant otr_trip_source_writer to otr_trip_source_command_gateway with inherit false,set true;
          set session authorization otr_trip_source_command_gateway;set role otr_trip_source_writer;
          select public.trip_source_attempt_observe(id,operation_sha256,phase,attempt_generation,attempt_id,'DEFINITIVE_COMPLETION') from public.trip_source_operations where id in ('${id(23)}','${id(33)}');
          reset session authorization;reset role;
          update public.trip_source_command_gate set enabled=false;alter table public.trip_source_command_gate add constraint trip_source_gate_closed check(not enabled);
          revoke select,update on public.trip_source_operations from otr_trip_source_writer;drop policy ci3h_quiescence_fixture on public.trip_source_operations;
          revoke otr_trip_source_writer from otr_trip_source_command_gateway;commit;`);
        sql(
          q(`select public.trip_source_execution_release('${id(231)}','${id(901)}',3)`),
        );
        assert.equal(
          inventory().length,
          2,
          "authorization retains cleanup-pending across process loss",
        );
        const prior = inventory()[0];
        sql(claim(231, 3, 906));
        const next = inventory()[0];
        assert.equal(next.phase, "TERMINAL");
        assert.equal(next.owner_fence, 4);
        assert.equal(next.terminal_evidence_sha256, prior.terminal_evidence_sha256);
        assert.throws(
          () =>
            sql(
              q(
                `select public.trip_source_execution_cleaned('${id(231)}','${id(901)}',3,'${id(600)}',repeat('b',64),repeat('e',64))`,
              ),
            ),
          (e) => e.stderr.includes("SOURCE_EXECUTION_FENCE_CONFLICT"),
        );
        sql(
          q(
            `select public.trip_source_execution_cleaned('${id(231)}','${id(906)}',4,'${id(600)}',repeat('b',64),repeat('e',64))`,
          ),
        );
        assert.deepEqual(inventory(), []);
        assert.equal(
          sql(`select phase from public.trip_source_operations where id='${id(33)}'`),
          "IO_QUIESCENT",
        );
        assert.equal(sql("select enabled from public.trip_source_command_gate"), "f");
      },
    );
    sql("revoke otr_trip_source_execution_gateway from otr_trip_source_command_gateway");
  });
else if (mode === "historic")
  test("previously committed IO_ACTIVE cannot regain fresh dispatch authority", async (t) => {
    const id = (n) => "cf100000-0000-4000-8000-" + String(n).padStart(12, "0");
    const source = readFileSync(
      "supabase/tests/trip_source_execution_journal.test.sql",
      "utf8",
    );
    const setup = source
      .slice(0, source.indexOf("select no_plan();"))
      .replaceAll("cd000000", "cf100000")
      .replaceAll("'op-'", "'historic-'");
    sql(setup + "commit;");
    sql(
      "grant otr_trip_source_execution_gateway to otr_trip_source_command_gateway with inherit false,set true;",
    );
    const q = (text) =>
      "set session authorization otr_trip_source_command_gateway;set role otr_trip_source_execution_gateway;" +
      text;
    try {
      await t.test(
        "old IO_ACTIVE registers UNKNOWN after process/transaction loss",
        () => {
          const row = JSON.parse(
            sql(
              q(
                `select public.trip_source_execution_register('${id(23)}','${id(231)}',1,'${id(500)}','${id(600)}',repeat('b',64),'${id(701)}','PNG_STATIC_RGB8_RGBA8_V1','526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5')`,
              ),
            ),
          );
          assert.equal(row.phase, "UNKNOWN");
          assert.equal(row.termination_outstanding, true);
        },
      );
      await t.test("first recovery claim retains UNKNOWN", () =>
        assert.equal(
          JSON.parse(
            sql(
              q(`select public.trip_source_execution_claim('${id(231)}',0,'${id(901)}')`),
            ),
          ).phase,
          "UNKNOWN",
        ),
      );
      await t.test("recovery claim cannot allocate parallel RUNNING dispatch", () =>
        assert.throws(
          () =>
            sql(
              q(
                `select public.trip_source_execution_advance('${id(231)}','${id(901)}',1,'RUNNING')`,
              ),
            ),
          (e) => e.stderr.includes("SOURCE_EXECUTION_PHASE_CONFLICT"),
        ),
      );
      await t.test("missing identity and unknown work remain protected", () => {
        assert.throws(
          () =>
            sql(
              q(
                `select public.trip_source_execution_release('${id(231)}','${id(901)}',1)`,
              ),
            ),
          (e) => e.stderr.includes("SOURCE_STAGE_PROTECTED"),
        );
        assert.equal(
          sql(`select phase from public.trip_source_operations where id='${id(23)}'`),
          "IO_ACTIVE",
        );
        assert.equal(sql("select enabled from public.trip_source_command_gate"), "f");
      });
    } finally {
      sql(
        "revoke otr_trip_source_execution_gateway from otr_trip_source_command_gateway",
      );
    }
  });
else throw Error("Choose reuse/install/recovery/historic; fixed local fixture only");
