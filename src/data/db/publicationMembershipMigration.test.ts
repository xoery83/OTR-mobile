import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrations } from "./migrations";
import { runMigrations, type MigrationDatabase } from "./migrationRunner";

function adapter(sql: DatabaseSync): MigrationDatabase {
  return {
    async execAsync(q) {
      sql.exec(q);
    },
    async getFirstAsync<T>(q: string, ...args: unknown[]) {
      return (sql.prepare(q).get(...(args as never[])) ?? null) as T | null;
    },
    async runAsync(q, ...args) {
      return sql.prepare(q).run(...(args as never[]));
    },
    async withTransactionAsync(work) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
const migration = migrations.find((m) => m.id === 53)!;
const guardNames = [
  "local_publication_membership_insert",
  "local_publication_membership_immutable",
  "local_publication_membership_install",
  "local_publication_membership_retained",
].sort();
describe("SQLite53 additive migration", () => {
  it.each([true, false])(
    "fresh1–53 exact column/guards/no backfill FK=%s",
    async (fk) => {
      const sql = new DatabaseSync(":memory:");
      try {
        sql.exec(`PRAGMA foreign_keys=${fk ? "ON" : "OFF"}`);
        const db = adapter(sql);
        await runMigrations(db);
        const before = sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
        await runMigrations(db);
        expect(before.map((r) => r.id)).toEqual(
          Array.from({ length: 53 }, (_, i) => i + 1),
        );
        expect(sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all()).toEqual(
          before,
        );
        expect(
          sql.prepare("PRAGMA table_info(trip_source_runs)").all().at(-1),
        ).toMatchObject({
          name: "publication_membership",
          type: "TEXT",
          notnull: 0,
          dflt_value: null,
        });
        expect(
          sql
            .prepare(
              "SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'local_publication_membership_%' ORDER BY name",
            )
            .all()
            .map((r) => r.name),
        ).toEqual(guardNames);
        expect(sql.prepare("SELECT count(*) n FROM trip_source_runs").get()?.n).toBe(0);
        expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      } finally {
        sql.close();
      }
    },
  );
  it.each(
    [true, false].flatMap((fk) => [0, 1, 2, 3, 4, 5, 6].map((stage) => ({ fk, stage }))),
  )(
    "failure after53 step $stage FK=$fk rolls back ALTER/guards/history and retries atomically",
    async ({ fk, stage }) => {
      const sql = new DatabaseSync(":memory:");
      try {
        sql.exec(`PRAGMA foreign_keys=${fk ? "ON" : "OFF"}`);
        for (const m of migrations.filter((m) => m.id <= 52)) sql.exec(m.sql);
        sql.exec(
          "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
        );
        for (const m of migrations.filter((m) => m.id <= 52))
          sql
            .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
            .run(m.id, m.name, "original52");
        // Preserve an original byte/storage-class sentinel across every failure point.
        sql
          .prepare(
            "INSERT INTO local_capture_payloads(account_id,id,byte_count,sha256,bytes) VALUES(?,?,?,?,?)",
          )
          .run(
            "test-account",
            "test-payload",
            3n,
            "0".repeat(64),
            new Uint8Array([0, 128, 255]),
          );
        const priorSchema = sql
          .prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name")
          .all();
        const history = sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
        const rows = () =>
          sql
            .prepare(
              "SELECT *,typeof(byte_count) count_storage,typeof(bytes) byte_storage FROM local_capture_payloads",
            )
            .all();
        const priorRows = rows();
        const db = adapter(sql),
          exec = db.execAsync,
          run = db.runAsync;
        db.execAsync = async (q) => {
          if (q !== migration.sql) {
            await exec(q);
            return;
          }
          for (const [index, chunk] of q.split(/(?=CREATE TRIGGER)/).entries()) {
            await exec(chunk);
            if (stage === index) throw new Error("TEST_DDL_FAILURE");
          }
        };
        db.runAsync = async (q, ...args) => {
          if (q.includes("INSERT INTO schema_migrations") && args[0] === 53) {
            if (stage === 5) throw new Error("TEST_HISTORY_BEFORE_INSERT");
            const r = await run(q, ...args);
            if (stage === 6) throw new Error("TEST_HISTORY_AFTER_INSERT");
            return r;
          }
          return run(q, ...args);
        };
        await expect(runMigrations(db)).rejects.toThrow("TEST_");
        expect(
          sql
            .prepare(
              "SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name",
            )
            .all(),
        ).toEqual(priorSchema);
        expect(sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all()).toEqual(
          history,
        );
        expect(rows()).toEqual(priorRows);
        db.execAsync = exec;
        db.runAsync = run;
        await runMigrations(db);
        await runMigrations(db);
        expect(
          sql.prepare("SELECT id,name FROM schema_migrations WHERE id=53").all(),
        ).toEqual([{ id: 53, name: "trip_source_publication_membership" }]);
        expect(
          sql.prepare("SELECT * FROM schema_migrations WHERE id<=52 ORDER BY id").all(),
        ).toEqual(history);
        expect(rows()).toEqual(priorRows);
        expect(
          sql
            .prepare(
              "SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'local_publication_membership_%' ORDER BY name",
            )
            .all()
            .map((r) => r.name),
        ).toEqual(guardNames);
        expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      } finally {
        sql.close();
      }
    },
  );
});
