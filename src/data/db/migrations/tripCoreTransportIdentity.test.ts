import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { migrations } from "../migrations";
import { tripCoreTransportIdentityMigration as migration } from "./tripCoreTransportIdentity";
import { applyCoreCommand, emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { coreDefaults, corePlaceSchema } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const m of migrations.filter((m) => m.id <= 80)) sql.exec(m.sql);
  const accountId = randomUUID(),
    tripId = randomUUID(),
    itemId = randomUUID();
  const actor = {
    accountId,
    tripId,
    personId: null,
    personIds: [],
    active: true,
    canManageShared: false,
  };
  const endpoint = {
    time: coreDateBoundary("2026-12-02"),
    place: corePlaceSchema.parse(
      Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
    ),
  };
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId,
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id: itemId },
    baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family: "P5",
      core: { title: "Synthetic retained service" },
      ...coreDefaults("member"),
      endpoints: { origin: endpoint, destination: endpoint },
      service: {
        service_key: "main",
        transport_subtype: "TRAIN",
        attribution: "UNSPECIFIED",
        operator_namespace: "NAME",
        operator_issuer: "Authored",
        operator_value: "Rail",
        operator_literal: "Rail",
        service_number: "12",
        service_literal: "12",
        codeshare_operating_key: null,
      },
    },
  };
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    command,
    actor,
    "2026-11-21T00:00:00Z",
  ).graph;
  for (const [table, rows] of Object.entries(graph))
    for (const row of rows) {
      const keys = Object.keys(row);
      sql
        .prepare(
          `INSERT INTO trip_core_${table}(cache_account_id,mirror_key,${keys.map((k) => '"' + k + '"').join(",")}) VALUES(${Array(
            keys.length + 2,
          )
            .fill("?")
            .join(",")})`,
        )
        .run(
          accountId,
          randomUUID(),
          ...keys.map((k) =>
            row[k] === null
              ? null
              : typeof row[k] === "object"
                ? JSON.stringify(row[k])
                : typeof row[k] === "boolean"
                  ? Number(row[k])
                  : (row[k] as string),
          ),
        );
    }
  // Old legal blanks remain exact bytes, not new facts.
  sql.exec(
    "UPDATE trip_core_itinerary_transport_services SET operator_issuer='',operator_value='',operator_literal='',service_number='',service_literal=''",
  );
  return sql;
}
it("upgrades 80 to 81 transactionally without changing old bytes or mirror constraints", () => {
  const sql = fixture();
  try {
    const before = sql
      .prepare("SELECT * FROM trip_core_itinerary_transport_services")
      .get()!;
    const foreignKeys = sql
      .prepare("PRAGMA foreign_key_list(trip_core_itinerary_transport_services)")
      .all();
    const triggers = sql
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='trip_core_itinerary_transport_services'",
      )
      .all();
    sql.exec("BEGIN");
    sql.exec(migration.sql);
    sql.exec("COMMIT");
    const after = sql
      .prepare("SELECT * FROM trip_core_itinerary_transport_services")
      .get()!;
    expect(after.identity_state).toBeNull();
    delete after.identity_state;
    expect(after).toEqual(before);
    expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      sql
        .prepare("PRAGMA foreign_key_list(trip_core_itinerary_transport_services)")
        .all(),
    ).toEqual(foreignKeys);
    expect(
      sql
        .prepare(
          "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='trip_core_itinerary_transport_services'",
        )
        .all(),
    ).toEqual(triggers);
    expect(
      sql
        .prepare("PRAGMA index_list(trip_core_itinerary_transport_services)")
        .all()
        .map((i) => i.name),
    ).toContain("trip_core_itinerary_transport_services_scope");
    expect(() =>
      sql.exec(
        "INSERT INTO trip_core_itinerary_transport_services SELECT * FROM trip_core_itinerary_transport_services",
      ),
    ).toThrow();
    sql.exec("UPDATE trip_core_itinerary_transport_services SET operator_issuer=NULL");
    expect(() =>
      sql.exec(
        "UPDATE trip_core_itinerary_transport_services SET identity_state='invalid'",
      ),
    ).toThrow();
  } finally {
    sql.close();
  }
});
it("rolls the migration and retained data back if a later migration step fails", () => {
  const sql = fixture();
  try {
    const before = sql
      .prepare("SELECT * FROM trip_core_itinerary_transport_services")
      .all();
    sql.exec("BEGIN");
    try {
      sql.exec(migration.sql);
      sql.exec("SELECT * FROM missing_migration_step");
    } catch {
      sql.exec("ROLLBACK");
    }
    expect(
      sql.prepare("SELECT * FROM trip_core_itinerary_transport_services").all(),
    ).toEqual(before);
    expect(
      sql
        .prepare("PRAGMA table_info(trip_core_itinerary_transport_services)")
        .all()
        .some((c) => c.name === "identity_state"),
    ).toBe(false);
    expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    sql.close();
  }
});

it("recognizes only registered native 81 and rejects changed descriptor type or identity nullability", async () => {
  const { isKnownGuestSqliteSchema } = await import("../../auth/guestSqliteSchema");
  const sql = fixture();
  try {
    sql.exec(
      "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
    );
    for (const m of migrations.filter((m) => m.id <= 80))
      sql
        .prepare("INSERT INTO schema_migrations VALUES(?,?,'synthetic')")
        .run(m.id, m.name);
    sql.exec(migration.sql);
    const db = {
      getFirstAsync: async <T>(query: string, ...args: unknown[]) =>
        (sql.prepare(query).get(...(args as never[])) ?? null) as T | null,
    };
    expect(await isKnownGuestSqliteSchema(db, 81)).toBe(false);
    sql
      .prepare("INSERT INTO schema_migrations VALUES(81,?,'synthetic')")
      .run(migration.name);
    expect(await isKnownGuestSqliteSchema(db, 81)).toBe(true);
    for (const definition of ["identity_state BLOB", "operator_literal TEXT NOT NULL"]) {
      const original = sql
        .prepare(
          "SELECT sql FROM sqlite_master WHERE name='trip_core_itinerary_transport_services'",
        )
        .get()!.sql as string;
      const changed = definition.startsWith("identity")
        ? original.replace('"identity_state" TEXT', definition)
        : original.replace('"operator_literal" TEXT', definition);
      expect(changed).not.toBe(original);
      // A fresh table isolates a malformed shape without changing the legitimate registry.
      sql.exec("BEGIN");
      sql.exec("DROP TABLE trip_core_itinerary_transport_services");
      sql.exec(changed);
      expect(await isKnownGuestSqliteSchema(db, 81)).toBe(false);
      sql.exec("ROLLBACK");
    }
    expect(await isKnownGuestSqliteSchema(db, 81)).toBe(true);
  } finally {
    sql.close();
  }
});
