import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

// Only this disposable local prior-baseline container; never a project/remote DB.
const container = "supabase_db_otr-trip-ci3b";
const writer = "otr_trip_source_writer";
const migration = readFileSync(
  "supabase/migrations/20261004000300_trip_source_protected_foundation.sql",
  "utf8",
);
const validation = migration.slice(
  migration.indexOf("-- Validate reuse"),
  migration.indexOf("-- Runtime DML"),
);
const sql = (input) =>
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
      "postgres",
      "-d",
      "postgres",
    ],
    { input, encoding: "utf8", stdio: "pipe" },
  ).trim();
const absent = () =>
  assert.equal(
    sql(
      "select to_regclass('public.trip_sources') is null and not exists(select 1 from storage.buckets where id='trip-source-material')",
    ),
    "t",
  );
const rejects = (input, reason) =>
  assert.throws(
    () => sql(input),
    (e) => e.stderr.includes(reason),
  );

test("Source writer reuse fails atomically without repairing incompatible identity", async (t) => {
  absent();
  sql(
    `drop role if exists ${writer}; create role ${writer} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
  );
  const probe = async (grant, revoke, effective, reason, label, input = migration) => {
    await t.test(label, () => {
      sql(grant);
      try {
        assert.equal(sql(effective), "t");
        rejects(input, reason);
        if (input === migration) absent();
        assert.equal(
          sql(effective),
          "t",
          "incompatible capability preserved after atomic rejection",
        );
      } finally {
        sql(revoke);
      }
    });
  };
  for (const privilege of [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
  ]) {
    await probe(
      `grant ${privilege} on public.receipt_assets to ${writer}`,
      `revoke ${privilege} on public.receipt_assets from ${writer}`,
      `select has_table_privilege('${writer}','public.receipt_assets','${privilege}')`,
      "UNSAFE_TRIP_SOURCE_WRITER_GRANTS",
      `direct table ${privilege}`,
    );
  }
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
    for (const grantee of [writer, "public"]) {
      await probe(
        `grant ${privilege}(title) on public.itinerary_events to ${grantee}`,
        `revoke ${privilege}(title) on public.itinerary_events from ${grantee}`,
        `select not has_table_privilege('${writer}','public.itinerary_events','${privilege}') and has_column_privilege('${writer}','public.itinerary_events','title','${privilege}')`,
        "UNSAFE_TRIP_SOURCE_WRITER_COLUMN_GRANTS",
        `${grantee} effective column ${privilege}`,
      );
    }
  }
  sql(
    "create role otr_ci3b_column_donor nologin; grant update(title) on public.itinerary_events to otr_ci3b_column_donor",
  );
  try {
    await probe(
      `grant otr_ci3b_column_donor to ${writer} with inherit true, set false`,
      `revoke otr_ci3b_column_donor from ${writer}`,
      `select has_column_privilege('${writer}','public.itinerary_events','title','UPDATE')`,
      "UNSAFE_TRIP_SOURCE_WRITER_ROLE",
      "inherited effective column capability and membership",
    );
  } finally {
    sql(
      "revoke update(title) on public.itinerary_events from otr_ci3b_column_donor;drop role otr_ci3b_column_donor",
    );
  }
  await probe(
    `grant ${writer} to authenticated`,
    `revoke ${writer} from authenticated`,
    `select pg_has_role('authenticated','${writer}','SET')`,
    "UNSAFE_TRIP_SOURCE_WRITER_ROLE",
    "API SET ROLE path",
  );
  await probe(
    `alter role ${writer} login`,
    `alter role ${writer} nologin`,
    `select rolcanlogin from pg_roles where rolname='${writer}'`,
    "UNSAFE_TRIP_SOURCE_WRITER_ROLE",
    "LOGIN identity preserved",
  );
  await probe(
    `grant insert on storage.objects to ${writer}`,
    `revoke insert on storage.objects from ${writer}`,
    `select has_table_privilege('${writer}','storage.objects','INSERT')`,
    "UNSAFE_TRIP_SOURCE_WRITER_GRANTS",
    "direct storage mutation capability",
  );
  await probe(
    "alter default privileges in schema public grant select on tables to public",
    "alter default privileges in schema public revoke select on tables from public",
    "select exists(select 1 from pg_default_acl d,lateral aclexplode(d.defaclacl) a where d.defaclrole=current_user::regrole and d.defaclnamespace='public'::regnamespace and a.grantee=0 and a.privilege_type='SELECT')",
    "UNSAFE_TRIP_SOURCE_WRITER_GRANTS",
    "effective PUBLIC default privileges on newly created tables",
  );
  await t.test("clean pre-created reserved role succeeds", () => {
    sql(migration);
    assert.equal(sql("select count(*) from public.trip_sources"), "0");
    assert.equal(
      sql(
        `select not rolcanlogin and not rolsuper and not rolinherit and not rolbypassrls from pg_roles where rolname='${writer}'`,
      ),
      "t",
    );
  });
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
    await probe(
      `grant ${privilege}(acquisition_key) on public.trip_sources to ${writer}`,
      `revoke ${privilege}(acquisition_key) on public.trip_sources from ${writer}`,
      `select has_column_privilege('${writer}','public.trip_sources','acquisition_key','${privilege}')`,
      "UNSAFE_TRIP_SOURCE_WRITER_COLUMN_GRANTS",
      `new Source table column ${privilege}`,
      validation,
    );
  }
});
