import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { migrations } from "./migrations";
import {
  getSchemaVersion,
  runMigrations,
  type MigrationDatabase,
} from "./migrationRunner";

it("normal67→68 upgrade and replay preserve every existing table and journal row", async () => {
  const sql = new DatabaseSync(":memory:");
  const database: MigrationDatabase = {
    async execAsync(query) {
      sql.exec(query);
    },
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
    },
    async runAsync(query, ...args) {
      return sql.prepare(query).run(...(args as never[]));
    },
    async withTransactionAsync(task) {
      sql.exec("BEGIN");
      try {
        await task();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  try {
    sql.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
    );
    for (const migration of migrations.filter(({ id }) => id <= 67)) {
      sql.exec(migration.sql);
      sql
        .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
        .run(migration.id, migration.name, "retained67");
    }
    const tables = sql
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => String(row.name))
      .filter((name) => name !== "schema_migrations");
    const existing = () =>
      tables.map((name) => [name, sql.prepare(`SELECT * FROM "${name}"`).all()]);
    const before = existing();
    const journal = sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
    await runMigrations(database);
    expect(await getSchemaVersion(database)).toBe(68);
    expect(existing()).toEqual(before);
    expect(
      sql.prepare("SELECT * FROM schema_migrations WHERE id<=67 ORDER BY id").all(),
    ).toEqual(journal);
    expect(sql.prepare("SELECT * FROM local_trip_ledger_bindings").all()).toEqual([]);
    const complete = sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
    await runMigrations(database);
    expect(sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all()).toEqual(
      complete,
    );
    expect(existing()).toEqual(before);
  } finally {
    sql.close();
  }
});
