import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
const container = "supabase_db_otr-trip-bt3h";
const migration = readFileSync(
  "supabase/migrations/20261005000100_trip_event_collection_foundation.sql",
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
    { input, encoding: "utf8", stdio: "pipe", maxBuffer: 128 * 1024 * 1024 },
  ).trim();
const absent = () =>
  assert.equal(
    sql("select to_regclass('public.trip_event_collection_state') is null"),
    "t",
  );
const mode = process.argv[2];
if (!["reuse", "sql", "integration", "float"].includes(mode))
  throw new Error(
    "Choose reuse/sql/integration/float; fixed disposable local container only",
  );
if (mode === "sql")
  test("complete SQL suite", async (t) => {
    sql("create extension if not exists pgtap with schema extensions");
    let total = 0;
    for (const name of readdirSync("supabase/tests")
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await t.test(name, () => {
        const result = sql(
          "set search_path=public,extensions;\n" +
            readFileSync(`supabase/tests/${name}`, "utf8"),
          name === "trip_event_collection.test.sql" ? "supabase_admin" : "postgres",
        );
        assert.doesNotMatch(result, /(?:^|\n)\s*not ok\b/);
        const plan = [...result.matchAll(/(?:^|\n)\s*1\.\.(\d+)/g)].at(-1);
        assert.ok(plan, `no plan ${name}`);
        assert.equal(
          [...result.matchAll(/(?:^|\n)\s*ok\s+\d+\b/g)].length,
          Number(plan[1]),
        );
        total += Number(plan[1]);
      });
    console.log(`SQL total ${total} assertions`);
  });
if (mode === "reuse")
  test("hostile reserved identity/capability reuse is rejected atomically", async (t) => {
    absent();
    const roles = [
      "otr_trip_event_collection_gateway",
      "otr_trip_event_collection_reader",
      "otr_trip_event_collection_maintainer",
    ];
    for (const role of roles)
      sql(
        `do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;end if;end$$`,
        "postgres",
      );
    const probe = async (
      label,
      grant,
      revoke,
      query,
      reason = "UNSAFE_TRIP_EVENT_COLLECTION",
    ) =>
      t.test(label, () => {
        sql(grant);
        try {
          assert.equal(sql(query), "t");
          assert.throws(
            () => sql(migration, "postgres"),
            (e) => e.stderr.includes(reason),
          );
          absent();
          assert.equal(sql(query), "t", "migration did not sanitize hostile fixture");
        } finally {
          sql(revoke);
        }
      });
    sql(
      "create schema bt3h_hostile;create role bt3h_donor nologin;create function bt3h_hostile.authority() returns void language plpgsql security definer set search_path=pg_catalog as $$begin execute 'update public.trip_event_command_gate set enabled=true';end$$;revoke all on function bt3h_hostile.authority() from public;grant usage on schema bt3h_hostile to public",
    );
    try {
      for (const role of roles) {
        await probe(
          `${role} LOGIN`,
          `alter role ${role} login`,
          `alter role ${role} nologin`,
          `select rolcanlogin from pg_roles where rolname='${role}'`,
        );
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"])
          await probe(
            `${role} column ${privilege}`,
            `grant ${privilege}(title) on public.itinerary_events to ${role}`,
            `revoke ${privilege}(title) on public.itinerary_events from ${role}`,
            `select has_column_privilege('${role}','public.itinerary_events','title','${privilege}')`,
          );
        for (const privilege of ["DELETE", "TRUNCATE", "TRIGGER"])
          await probe(
            `${role} table ${privilege}`,
            `grant ${privilege} on public.itinerary_events to ${role}`,
            `revoke ${privilege} on public.itinerary_events from ${role}`,
            `select has_table_privilege('${role}','public.itinerary_events','${privilege}')`,
          );
        await probe(
          `${role} direct hostile EXECUTE`,
          `grant execute on function bt3h_hostile.authority() to ${role}`,
          `revoke execute on function bt3h_hostile.authority() from ${role}`,
          `select has_function_privilege('${role}','bt3h_hostile.authority()','EXECUTE')`,
        );
        await probe(
          `${role} PUBLIC hostile EXECUTE`,
          `grant execute on function bt3h_hostile.authority() to public`,
          `revoke execute on function bt3h_hostile.authority() from public`,
          `select has_function_privilege('${role}','bt3h_hostile.authority()','EXECUTE')`,
        );
        await probe(
          `${role} inherited hostile EXECUTE`,
          `grant execute on function bt3h_hostile.authority() to bt3h_donor;grant bt3h_donor to ${role} with inherit true,set false`,
          `revoke bt3h_donor from ${role};revoke execute on function bt3h_hostile.authority() from bt3h_donor`,
          `select has_function_privilege('${role}','bt3h_hostile.authority()','EXECUTE')`,
        );
        await probe(
          `${role} schema CREATE`,
          `grant create on schema bt3h_hostile to ${role}`,
          `revoke create on schema bt3h_hostile from ${role}`,
          `select has_schema_privilege('${role}','bt3h_hostile','CREATE')`,
        );
        await probe(
          `${role} foreign schema ownership`,
          `alter schema bt3h_hostile owner to ${role}`,
          "alter schema bt3h_hostile owner to supabase_admin",
          `select nspowner='${role}'::regrole from pg_namespace where nspname='bt3h_hostile'`,
          "UNSAFE_TRIP_EVENT_COLLECTION_OWNERSHIP",
        );
      }
      await probe(
        "PUBLIC column grant",
        "grant update(title) on public.itinerary_events to public",
        "revoke update(title) on public.itinerary_events from public",
        "select has_column_privilege('otr_trip_event_collection_reader','public.itinerary_events','title','UPDATE')",
      );
      await probe(
        "PUBLIC table default grant",
        "alter default privileges for role postgres in schema public grant select on tables to public",
        "alter default privileges for role postgres in schema public revoke select on tables from public",
        "select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclrole='postgres'::regrole and a.grantee=0 and a.privilege_type='SELECT')",
      );
      await probe(
        "same-signature hostile observation EXECUTE",
        "create function public.trip_event_collection_observe(actor uuid,trip uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$select '{}'::jsonb$$;revoke all on function public.trip_event_collection_observe(uuid,uuid) from public;grant execute on function public.trip_event_collection_observe(uuid,uuid) to otr_trip_event_collection_gateway",
        "drop function public.trip_event_collection_observe(uuid,uuid)",
        "select has_function_privilege('otr_trip_event_collection_gateway','public.trip_event_collection_observe(uuid,uuid)','EXECUTE')",
      );
      await t.test("same-signature admission substitution", () => {
        const original = sql(
          "select pg_get_functiondef('public.trip_event_admission(uuid,uuid,boolean)'::regprocedure)",
        );
        sql(
          "create or replace function public.trip_event_admission(actor uuid,trip uuid,writing boolean) returns boolean language sql stable security definer set search_path=pg_catalog as $$select true$$",
        );
        try {
          assert.throws(
            () => sql(migration, "postgres"),
            (e) => e.stderr.includes("UNSAFE_TRIP_EVENT_COLLECTION_DEPENDENCY"),
          );
          absent();
          assert.equal(sql("select public.trip_event_admission(null,null,false)"), "t");
        } finally {
          sql(original);
        }
      });
    } finally {
      sql("drop schema bt3h_hostile cascade;drop role bt3h_donor");
    }
    sql(
      "begin;\nset role service_role;\n\ninsert into public.journey_members (\n  id, trip_id, user_id, display_name, role, status, linked_at\n) values (\n  '12000000-0000-4000-8000-000000000001',\n  '10000000-0000-4000-8000-000000000001',\n  '00000000-0000-4000-8000-000000000001',\n  'Synthetic Owner',\n  'owner',\n  'linked',\n  '2026-01-01 00:00:00+00'\n) on conflict (trip_id, user_id) do nothing;\n\ninsert into public.expenses (\n  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,\n  payer_member_id, title, occurred_at, original_amount_minor,\n  original_currency, original_currency_scale, business_status\n) values (\n  '41000000-0000-4000-8000-000000000001',\n  '10000000-0000-4000-8000-000000000001',\n  '12000000-0000-4000-8000-000000000002',\n  '00000000-0000-4000-8000-000000000002',\n  '00000000-0000-4000-8000-000000000002',\n  '12000000-0000-4000-8000-000000000002',\n  '4B seed dinner',\n  '2026-01-10 18:00:00+00',\n  1200,\n  'NZD',\n  2,\n  'ACCEPTED'\n);\n\ninsert into public.expense_participants (\n  expense_id, journey_id, member_id, display_name_snapshot, display_order\n) values (\n  '41000000-0000-4000-8000-000000000001',\n  '10000000-0000-4000-8000-000000000001',\n  '12000000-0000-4000-8000-000000000002',\n  'Synthetic Member',\n  0\n);\n\ninsert into public.expense_splits (\n  expense_id, journey_id, member_id, split_method, original_amount_minor,\n  settlement_amount_minor\n) values (\n  '41000000-0000-4000-8000-000000000001',\n  '10000000-0000-4000-8000-000000000001',\n  '12000000-0000-4000-8000-000000000002',\n  'EQUAL_PERSON',\n  1200,\n  1200\n);\n\ninsert into public.settlement_valuation_snapshots (\n  id, expense_id, journey_id, expense_revision, policy,\n  original_amount_minor, original_currency, original_scale,\n  settlement_amount_minor, settlement_currency, settlement_scale, is_active\n) values (\n  '42000000-0000-4000-8000-000000000001',\n  '41000000-0000-4000-8000-000000000001',\n  '10000000-0000-4000-8000-000000000001',\n  1,\n  'SAME_CURRENCY',\n  1200,\n  'NZD',\n  2,\n  1200,\n  'NZD',\n  2,\n  true\n);\n\n\nRESET ROLE;\nINSERT INTO public.ledger_settings(journey_id,settlement_currency,settlement_scale,valuation_policy) VALUES ('10000000-0000-4000-8000-000000000001','NZD',2,'REFERENCE_RATE');\nINSERT INTO public.personal_settlement_payment_records (\n id, journey_id, owner_user_id, owner_member_id, counterparty_member_id,\n direction, amount_minor, currency, scale, occurred_at, created_by_user_id,\n updated_by_user_id, last_operation_id, economic_date\n) VALUES ('99000000-0000-4000-8000-000000000001',\n '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',\n (select id from public.journey_members where trip_id='10000000-0000-4000-8000-000000000001' and user_id='00000000-0000-4000-8000-000000000001'),'12000000-0000-4000-8000-000000000002',\n 'PAID',100,'NZD',2,'2026-01-10','00000000-0000-4000-8000-000000000001',\n '00000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000002','2026-01-10');\ndo $$begin perform public.ledger_validate_expense('41000000-0000-4000-8000-000000000001'); end$$;\n\ncommit;",
    );
    // Non-empty forward preservation: all historic table rows before/after installation.
    const oldTables = sql(
      "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name",
    ).split("\n");
    const snapshot = () =>
      sql(
        oldTables
          .map(
            (name) =>
              `select jsonb_build_object('table','${name}','rows',coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'))::text value from public.${name} t`,
          )
          .join(" union all ") + " order by value",
      );
    const before = snapshot();
    sql(migration, "postgres");
    assert.equal(sql("select not enabled from public.trip_event_command_gate"), "t");
    assert.equal(snapshot(), before, "all populated historical public rows retained");
  });
if (mode === "integration")
  test("real observation pagination, concurrent counters, mutation/ABA/delete and isolation", async (t) => {
    const { eventCollectionPage } =
      await import("../../backend/src/tripEventCollection.ts");
    const actor = "00000000-0000-4000-8000-000000000001",
      trip = "10000000-0000-4000-8000-000000000001";
    const observe = () =>
      JSON.parse(
        sql(
          `begin read only;set session authorization otr_trip_event_collection_gateway;select public.trip_event_collection_observe('${actor}','${trip}');commit;`,
        ),
      );
    const insert = (i) =>
      `insert into public.itinerary_events(id,trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision) values('be100000-0000-4000-8000-${String(i).padStart(12, "0")}','${trip}','Integration','${actor}',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1)`;
    const parallel = (statement) =>
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
        child.on("close", (code) => (code ? reject(new Error(err)) : resolve(out)));
        child.stdin.end(statement);
      });
    sql(
      "alter table public.itinerary_events disable trigger itinerary_event_semantic_guard",
    );
    try {
      const start = observe();
      await Promise.all([parallel(insert(1)), parallel(insert(2))]);
      assert.equal(
        BigInt(observe().snapshot.collectionRevision),
        BigInt(start.snapshot.collectionRevision) + 2n,
      );
      sql(
        "begin;" +
          Array.from({ length: 1201 }, (_, i) => insert(i + 3)).join(";") +
          ";commit;",
      );
      let token = null,
        seen = 0,
        pages = 0;
      do {
        const page = eventCollectionPage(observe(), actor, trip, token);
        assert.deepEqual(page, eventCollectionPage(observe(), actor, trip, token));
        seen += page.events.length;
        pages++;
        token = page.nextCursor;
      } while (token);
      assert.equal(seen, 1203);
      assert.equal(pages, 13);
      await t.test("live semantic ABA rejects old page", () => {
        const first = eventCollectionPage(observe(), actor, trip, null);
        sql(
          "update public.itinerary_events set title='Changed',semantic_revision=2 where id='be100000-0000-4000-8000-000000000001';update public.itinerary_events set title='Integration',semantic_revision=3 where id='be100000-0000-4000-8000-000000000001'",
        );
        assert.throws(
          () => eventCollectionPage(observe(), actor, trip, first.nextCursor),
          /INVALID_EVENT_COLLECTION_CURSOR/,
        );
      });
      await t.test(
        "real Place SET NULL changes fingerprint/revision and invalidates continuation",
        () => {
          sql(
            "insert into public.places(id,normalized_name) values('be200000-0000-4000-8000-000000000001','Synthetic cache');update public.itinerary_events set accepted_place_id='be200000-0000-4000-8000-000000000001' where id='be100000-0000-4000-8000-000000000002'",
          );
          const before = observe(),
            first = eventCollectionPage(before, actor, trip, null);
          sql(
            "delete from public.places where id='be200000-0000-4000-8000-000000000001'",
          );
          const after = observe(),
            next = eventCollectionPage(after, actor, trip, null);
          assert.notEqual(next.fingerprint, first.fingerprint);
          assert.equal(
            BigInt(after.snapshot.collectionRevision),
            BigInt(before.snapshot.collectionRevision) + 1n,
          );
          assert.equal(
            after.events[1].event.semantic_revision,
            before.events[1].event.semantic_revision,
          );
          assert.equal(after.events[1].event.accepted_place_id, null);
          assert.throws(
            () => eventCollectionPage(after, actor, trip, first.nextCursor),
            /INVALID_EVENT_COLLECTION_CURSOR/,
          );
        },
      );
      await t.test("set ABA changes counter even with identical content hash", () => {
        const before = observe();
        const first = eventCollectionPage(before, actor, trip, null);
        sql(
          "begin;" +
            insert(2000) +
            ";delete from public.itinerary_events where id='be100000-0000-4000-8000-000000002000';commit;",
        );
        const after = observe();
        assert.equal(
          eventCollectionPage(after, actor, trip, null).fingerprint,
          first.fingerprint,
        );
        assert.equal(
          BigInt(after.snapshot.collectionRevision),
          BigInt(before.snapshot.collectionRevision) + 2n,
        );
        assert.throws(
          () => eventCollectionPage(after, actor, trip, first.nextCursor),
          /INVALID_EVENT_COLLECTION_CURSOR/,
        );
      });
      await t.test(
        "live delete invalidates and later complete observation excludes",
        () => {
          const first = eventCollectionPage(observe(), actor, trip, null);
          sql(
            "delete from public.itinerary_events where id='be100000-0000-4000-8000-000000000001'",
          );
          assert.throws(
            () => eventCollectionPage(observe(), actor, trip, first.nextCursor),
            /INVALID_EVENT_COLLECTION_CURSOR/,
          );
          assert.equal(observe().events.length, 1202);
        },
      );
      await t.test("rolled-back write cannot advance namespace", () => {
        const before = observe();
        sql(
          "begin;update public.itinerary_events set title='Rollback' where id='be100000-0000-4000-8000-000000000002';rollback",
        );
        assert.deepEqual(observe(), before);
      });
      await t.test("historic transaction cannot certify", () => {
        assert.throws(
          () =>
            sql(
              `begin isolation level repeatable read;set session authorization otr_trip_event_collection_gateway;select public.trip_event_collection_observe('${actor}','${trip}')`,
            ),
          (e) => e.stderr.includes("COLLECTION_CERTIFICATION_UNAVAILABLE"),
        );
      });
    } finally {
      sql(
        "delete from public.itinerary_events where id::text like 'be100000-%';alter table public.itinerary_events enable trigger itinerary_event_semantic_guard",
      );
    }
  });

if (mode === "float")
  test("float8 observation is independent of caller settings across separate connections", async (t) => {
    const { eventCollectionPage, canonicalReadBytes } =
      await import("../../backend/src/tripEventCollection.ts");
    const actor = "00000000-0000-4000-8000-000000000001";
    const trip = "10000000-0000-4000-8000-000000000001";
    const root = "be300000-0000-4000-8000-000000000001";
    const transport = "be300001-0000-4000-8000-000000000001";
    const observe = (digits) => {
      // Every sql() invocation creates a separate PostgreSQL connection.
      const result = JSON.parse(
        sql(`begin read only;set local extra_float_digits=${digits};
        set session authorization otr_trip_event_collection_gateway;
        select jsonb_build_object('observation',public.trip_event_collection_observe('${actor}','${trip}'),
          'callerSetting',current_setting('extra_float_digits'));commit;`),
      );
      assert.equal(
        result.callerSetting,
        String(digits),
        "function restores caller setting",
      );
      return result.observation;
    };
    sql(`begin;set local extra_float_digits=3;
      alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
      alter table public.itinerary_transport_endpoints disable trigger itinerary_transport_endpoint_guard;
      insert into public.itinerary_events(id,trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,accepted_latitude,accepted_longitude,spatial_provenance_refs)
      select ('be300000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${trip}','Precision probe','${actor}',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,1.2345678901234567,-179.99999999999997,'{"accepted_coordinates":"otr-event/confirmation/coords"}' from generate_series(1,101) i;
      insert into public.itinerary_events(id,trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time)
      values('${transport}','${trip}','Precision transport','${actor}',1,'TRANSPORT',1,'UNASSIGNED',false);
      insert into public.itinerary_transport_endpoints(event_id,role,quality,basis,civil_resolution,provenance_refs,location_input_revision,accepted_latitude,accepted_longitude,spatial_provenance_refs)
      values('${transport}','ORIGIN','UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,-1.2345678901234567,180,'{"accepted_coordinates":"otr-event/confirmation/coords"}'),
      ('${transport}','DESTINATION','UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,90,-1.2345678901234567,'{"accepted_coordinates":"otr-event/confirmation/coords"}');commit;`);
    try {
      const observations = [3, 0, -15].map(observe);
      const baseline = observations[0];
      const pages = observations.map((o) => eventCollectionPage(o, actor, trip, null));
      await t.test(
        "fixed function configuration and precision-sensitive reviewer vector",
        () => {
          const config = JSON.parse(
            sql(
              "select to_json(proconfig) from pg_proc where oid='public.trip_event_collection_observe(uuid,uuid)'::regprocedure",
            ),
          );
          assert.deepEqual(config, [
            "search_path=pg_catalog",
            "TimeZone=UTC",
            "DateStyle=ISO, YMD",
            "extra_float_digits=3",
          ]);
          assert.notEqual(
            sql("set extra_float_digits=3;select '1.2345678901234567'::float8"),
            sql("set extra_float_digits=0;select '1.2345678901234567'::float8"),
          );
        },
      );
      for (const [label, id, role, latitude, longitude] of [
        ["root", root, null, 1.2345678901234567, -179.99999999999997],
        ["ORIGIN", transport, "ORIGIN", -1.2345678901234567, 180],
        ["DESTINATION", transport, "DESTINATION", 90, -1.2345678901234567],
      ])
        await t.test(
          `${label} accepted latitude/longitude stable at EFD 3, 0, -15`,
          () => {
            for (const observation of observations) {
              const event = observation.events.find((r) => r.event.id === id).event;
              const spatial = role
                ? event.itinerary_transport_endpoints.find((e) => e.role === role)
                : event;
              assert.equal(spatial.accepted_latitude, latitude);
              assert.equal(spatial.accepted_longitude, longitude);
            }
          },
        );
      await t.test(
        "same epoch/revision, count/order, leaf bytes and fingerprint across sessions",
        () => {
          for (const observation of observations) {
            assert.deepEqual(observation, baseline);
            assert.deepEqual(
              observation.events.map(canonicalReadBytes),
              baseline.events.map(canonicalReadBytes),
            );
          }
          assert.equal(pages[0].eventCount, 102);
          assert.ok(pages.every((p) => p.fingerprint === pages[0].fingerprint));
        },
      );
      for (const [from, to] of [
        [3, 0],
        [0, 3],
        [3, -15],
      ])
        await t.test(`cursor EFD ${from} continues at EFD ${to} without writes`, () => {
          const first = eventCollectionPage(observe(from), actor, trip, null);
          const final = eventCollectionPage(observe(to), actor, trip, first.nextCursor);
          assert.equal(final.complete, true);
          assert.equal(final.startOrdinal, 100);
          assert.equal(final.events.length, 2);
          assert.equal(final.fingerprint, first.fingerprint);
          assert.deepEqual(final.snapshot, first.snapshot);
        });
      await t.test(
        "genuine contradictory coordinates at equal identity fail closed",
        () => {
          const corrupt = structuredClone(baseline);
          corrupt.events[0].event.accepted_latitude = 2.2345678901234567;
          assert.throws(
            () => eventCollectionPage(corrupt, actor, trip, pages[0].nextCursor),
            /CANONICAL_EVENT_SNAPSHOT_INVALID/,
          );
        },
      );
      await t.test(
        "business coordinate change advances collection revision and fingerprint",
        () => {
          sql(
            `set extra_float_digits=3;update public.itinerary_events set accepted_latitude=2.2345678901234567,semantic_revision=semantic_revision+1 where id='${root}'`,
          );
          const changed = observe(0);
          assert.equal(
            BigInt(changed.snapshot.collectionRevision),
            BigInt(baseline.snapshot.collectionRevision) + 1n,
          );
          assert.notEqual(
            eventCollectionPage(changed, actor, trip, null).fingerprint,
            pages[0].fingerprint,
          );
          assert.throws(
            () => eventCollectionPage(changed, actor, trip, pages[0].nextCursor),
            /INVALID_EVENT_COLLECTION_CURSOR/,
          );
        },
      );
    } finally {
      sql(
        "begin;delete from public.itinerary_events where id::text like 'be30000%';set constraints all immediate;alter table public.itinerary_events enable trigger itinerary_event_semantic_guard;alter table public.itinerary_transport_endpoints enable trigger itinerary_transport_endpoint_guard;commit;",
      );
    }
  });
