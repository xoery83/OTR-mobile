import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

// Run only against the disposable prior baseline; never a saved project/remote DB.
const container = "supabase_db_otr-trip-bt3b";
const writer = "otr_trip_event_semantic_writer";
const migration = readFileSync(
  "supabase/migrations/20261004000100_trip_temporal_protected_foundation.sql",
  "utf8",
);
const roleValidation = migration.slice(
  migration.indexOf("do $$"),
  migration.indexOf("-- Pure validators"),
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
const absentFoundation = () =>
  assert.equal(
    sql(`select to_regclass('public.itinerary_transport_endpoints') is null
      and not exists(select 1 from pg_attribute where attrelid='public.itinerary_events'::regclass
        and attname='temporal_contract_version' and not attisdropped)`),
    "t",
  );
const rejects = (source, error) =>
  assert.throws(
    () => sql(source),
    (e) => e.stderr.includes(error),
  );

// This test deliberately commits fixture grants before the failing migration.
// Their survival proves atomic rejection, rather than a silent repair/revoke.
test("disabled foundation rejects compromised reserved-writer reuse", async (t) => {
  absentFoundation();
  sql(
    `create role ${writer} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
  );
  assert.equal(
    sql(`select not rolcanlogin and not rolsuper and not rolcreatedb
    and not rolcreaterole and not rolinherit and not rolbypassrls
    from pg_roles where rolname='${writer}'`),
    "t",
  );

  const columnCase = async (table, column, privilege, grantee = writer) => {
    await t.test(`${grantee}: ${privilege}(${column}) on ${table}`, () => {
      sql(`grant ${privilege}(${column}) on public.${table} to ${grantee}`);
      try {
        const query = `select has_table_privilege('${writer}','public.${table}','${privilege}'),
          has_column_privilege('${writer}','public.${table}','${column}','${privilege}')`;
        assert.equal(
          sql(query),
          "f|t",
          "effective column capability escapes table-only checks",
        );
        rejects(migration, "UNSAFE_TRIP_EVENT_WRITER_COLUMN_GRANTS");
        absentFoundation();
        assert.equal(
          sql(query),
          "f|t",
          "failed migration retains the incompatible fixture grant",
        );
      } finally {
        sql(`revoke ${privilege}(${column}) on public.${table} from ${grantee}`);
      }
    });
  };
  for (const [table, column] of [
    ["itinerary_events", "title"],
    ["itinerary_event_participants", "participation_status"],
  ]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"])
      await columnCase(table, column, privilege);
  }
  await columnCase("trip_days", "title", "UPDATE");
  await columnCase("itinerary_reservations", "title", "UPDATE");
  await columnCase("itinerary_events", "title", "UPDATE", "public");
  await columnCase(
    "itinerary_event_participants",
    "participation_status",
    "SELECT",
    "public",
  );

  await t.test(
    "inherited column capability and membership are rejected unchanged",
    () => {
      sql(`create role otr_bt3b_review_column_donor nologin;
      grant update(title) on public.itinerary_events to otr_bt3b_review_column_donor;
      grant otr_bt3b_review_column_donor to ${writer} with inherit true, set false`);
      try {
        assert.equal(
          sql(
            `select has_column_privilege('${writer}','public.itinerary_events','title','UPDATE')`,
          ),
          "t",
        );
        rejects(migration, "UNSAFE_TRIP_EVENT_WRITER_ROLE");
        absentFoundation();
        assert.equal(
          sql(
            `select has_column_privilege('${writer}','public.itinerary_events','title','UPDATE')`,
          ),
          "t",
        );
      } finally {
        sql(`revoke otr_bt3b_review_column_donor from ${writer};
        revoke update(title) on public.itinerary_events from otr_bt3b_review_column_donor;
        drop role otr_bt3b_review_column_donor`);
      }
    },
  );

  for (const privilege of ["DELETE", "TRUNCATE", "TRIGGER"]) {
    await t.test(`existing table ${privilege} check retained`, () => {
      sql(`grant ${privilege} on public.itinerary_events to ${writer}`);
      try {
        rejects(migration, "UNSAFE_TRIP_EVENT_WRITER_GRANTS");
        absentFoundation();
        assert.equal(
          sql(
            `select has_table_privilege('${writer}','public.itinerary_events','${privilege}')`,
          ),
          "t",
        );
      } finally {
        sql(`revoke ${privilege} on public.itinerary_events from ${writer}`);
      }
    });
  }

  await t.test("new endpoint table effective PUBLIC default SELECT is rejected", () => {
    sql("alter default privileges in schema public grant select on tables to public");
    try {
      rejects(migration, "UNSAFE_TRIP_EVENT_WRITER_COLUMN_GRANTS");
      absentFoundation();
      assert.equal(
        sql(`select exists(select 1 from pg_default_acl d,
        lateral aclexplode(d.defaclacl) a where d.defaclrole=current_user::regrole
        and d.defaclnamespace='public'::regnamespace and a.grantee=0 and a.privilege_type='SELECT')`),
        "t",
      );
    } finally {
      sql(
        "alter default privileges in schema public revoke select on tables from public",
      );
    }
  });

  await t.test("clean pre-created reserved role succeeds normally", () => {
    sql(migration);
    assert.equal(sql("select count(*) from public.itinerary_transport_endpoints"), "0");
  });

  // The endpoint does not exist on the prior baseline. Exercise the exact same
  // migration validation block against column grants on the installed endpoint.
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
    await t.test(`endpoint ${privilege}(role) rejected by exact reuse validation`, () => {
      sql(
        `grant ${privilege}(role) on public.itinerary_transport_endpoints to ${writer}`,
      );
      try {
        assert.equal(
          sql(`select has_table_privilege('${writer}','public.itinerary_transport_endpoints','${privilege}'),
          has_column_privilege('${writer}','public.itinerary_transport_endpoints','role','${privilege}')`),
          "f|t",
        );
        rejects(roleValidation, "UNSAFE_TRIP_EVENT_WRITER_COLUMN_GRANTS");
        assert.equal(
          sql(
            `select has_column_privilege('${writer}','public.itinerary_transport_endpoints','role','${privilege}')`,
          ),
          "t",
        );
      } finally {
        sql(
          `revoke ${privilege}(role) on public.itinerary_transport_endpoints from ${writer}`,
        );
      }
    });
  }
});
