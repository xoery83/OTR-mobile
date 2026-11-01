import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
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
it.each([false, true])(
  "preserves75 rows/queue and private77 through normal or late76 startup (late=%s)",
  async (late) => {
    const sql = new DatabaseSync(":memory:");
    try {
      sql.exec(
        "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
      );
      for (const m of migrations.filter((m) => m.id <= 75)) {
        sql.exec(m.sql);
        sql
          .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
          .run(m.id, m.name, "before");
      }
      sql.exec(
        "INSERT INTO sync_operations(id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at) VALUES('preserved-op','QA','preserved-item','QA','preserved-key','{}','PENDING','before','before')",
      );
      const preserved = sql.prepare("SELECT * FROM sync_operations").all();
      const before = sql.prepare("SELECT * FROM schema_migrations").all();
      const profile = migrations.find((m) => m.id === 77)!;
      if (late) {
        sql.exec(profile.sql);
        sql
          .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
          .run(77, profile.name, "before");
        sql.exec(
          `INSERT INTO account_private_profile_local VALUES('A',NULL,'{"displayName":"林 é"}','before')`,
        );
      }
      await runMigrations(adapter(sql));
      expect(migrations.slice(-3).map((m) => m.id)).toEqual([75, 76, 77]);
      expect(sql.prepare("SELECT * FROM sync_operations").all()).toEqual(preserved);
      expect(sql.prepare("SELECT * FROM schema_migrations WHERE id<=75").all()).toEqual(
        before,
      );
      expect(
        sql
          .prepare("SELECT id FROM schema_migrations WHERE id>=76 ORDER BY id")
          .all()
          .map((r) => r.id),
      ).toEqual([76, 77]);
      const trigger = sql
        .prepare(
          "SELECT sql FROM sqlite_master WHERE name='capture_photo_decision_scope_insert'",
        )
        .get()!.sql as string;
      expect(trigger).toContain("i.declared_content_type='image/png'");
      if (late)
        expect(
          sql
            .prepare(
              "SELECT draft_json FROM account_private_profile_local WHERE account_id='A'",
            )
            .get()!.draft_json,
        ).toContain("林 é");
      const history = sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
      await runMigrations(adapter(sql));
      expect(sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all()).toEqual(
        history,
      );
      expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      sql.close();
    }
  },
);
