import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { migrations } from "./migrations";
import {
  runMigrations,
  getSchemaVersion,
  type MigrationDatabase,
} from "./migrationRunner";

it("normal registry upgrades64→65 without changing old payload/history and reopens65 idempotently", async () => {
  const sql = new DatabaseSync(":memory:");
  const db: MigrationDatabase = {
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
  try {
    sql.exec(
      "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
    );
    for (const m of migrations.filter((m) => m.id <= 64)) {
      sql.exec(m.sql);
      sql
        .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
        .run(m.id, m.name, "retained64");
    }
    expect(await getSchemaVersion(db)).toBe(64);
    sql
      .prepare(
        "INSERT INTO local_capture_payloads(account_id,id,byte_count,sha256,bytes) VALUES(?,?,?,?,?)",
      )
      .run(
        "synthetic-account",
        "synthetic-original",
        3n,
        "0".repeat(64),
        new Uint8Array([0, 128, 255]),
      );
    const history = sql
      .prepare("SELECT * FROM schema_migrations ORDER BY id")
      .all();
    const payload = sql.prepare("SELECT * FROM local_capture_payloads").get();
    await runMigrations(db);
    expect(await getSchemaVersion(db)).toBe(65);
    expect(
      sql
        .prepare("SELECT * FROM schema_migrations WHERE id<=64 ORDER BY id")
        .all(),
    ).toEqual(history);
    expect(sql.prepare("SELECT * FROM local_capture_payloads").get()).toEqual(
      payload,
    );
    expect(
      sql.prepare("SELECT count(*) n FROM source_required_date_decisions").get()
        ?.n,
    ).toBe(0);
    sql
      .prepare(
        "INSERT INTO source_required_date_decisions VALUES(?,?,?,?,?,'ORIGIN.local_date',?,1,'USER_ENTERED',?,'{}','{}',?)",
      )
      .run(
        "synthetic-account",
        "synthetic-trip",
        "synthetic-batch",
        "synthetic-job",
        "synthetic-candidate",
        "synthetic-decision",
        "2026-12-17",
        "2026-10-15T00:00:00Z",
      );
    expect(() =>
      sql.exec(
        "UPDATE source_required_date_decisions SET local_date='2026-12-18'",
      ),
    ).toThrow("REQUIRED_DATE_IMMUTABLE");
    expect(() =>
      sql.exec("DELETE FROM source_required_date_decisions"),
    ).toThrow("REQUIRED_DATE_RETAINED");
    const after = sql
      .prepare("SELECT * FROM schema_migrations ORDER BY id")
      .all();
    await runMigrations(db);
    expect(
      sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all(),
    ).toEqual(after);
    expect(
      sql.prepare("SELECT count(*) n FROM source_required_date_decisions").get()
        ?.n,
    ).toBe(1);
  } finally {
    sql.close();
  }
});
