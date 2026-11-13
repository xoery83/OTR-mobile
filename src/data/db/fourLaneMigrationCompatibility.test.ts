import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { migrations } from "./migrations";
import { runMigrations, type MigrationDatabase } from "./migrationRunner";
import { serverParentMetadataConfirmationsSql } from "./migrations/serverParentMetadataConfirmations.candidate";

it.each(["fresh", "import78", "auth76"])("preserves both lane stores across %s upgrade and cold reopen", async (baseline) => {
  const dir = mkdtempSync(join(tmpdir(), "otr-four-lane-"));
  const path = join(dir, "app.sqlite");
  let db = new DatabaseSync(path);
  const adapter = (): MigrationDatabase => ({
    async execAsync(sql) { db.exec(sql); },
    async getFirstAsync<T>(sql: string, ...args: unknown[]) { return (db.prepare(sql).get(...args as never[]) ?? null) as T | null; },
    async runAsync(sql, ...args) { return db.prepare(sql).run(...args as never[]); },
    async withTransactionAsync(task) { db.exec("BEGIN"); try { await task(); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; } },
  });
  try {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)");
    if (baseline !== "fresh") {
      for (const m of migrations.filter(m => m.id <= (baseline === "auth76" ? 75 : 78))) {
        db.exec("PRAGMA foreign_keys=OFF");
        db.exec(m.sql);
        db.prepare("INSERT INTO schema_migrations VALUES(?,?,'original')").run(m.id, m.name);
      }
      if (baseline === "auth76") {
        db.exec(serverParentMetadataConfirmationsSql);
        db.exec("INSERT INTO schema_migrations VALUES(76,'server_parent_metadata_confirmations','original')");
      }
    } else await runMigrations(adapter());
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(`INSERT INTO local_trip_containers(account_id,id,create_operation_id,name,created_at,updated_at) VALUES('A','trip','create','Existing Trip','time','time');
      INSERT INTO local_trip_metadata_confirmations VALUES('A','trip','receipt','SNAPSHOT',1,'{}','{}');
      INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,attempt_count,created_at,updated_at,owner_user_id)
      VALUES('original-op','trip','TRIP_CORE_V2','item','CORE_V2_COMMAND','original-op','{}','PROCESSING',1,'time','time','A');`);
    const before = db.prepare("SELECT * FROM sync_operations").all();
    const proof = db.prepare("SELECT * FROM local_trip_metadata_confirmations").all();
    await runMigrations(adapter());
    db.close(); db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON");
    await runMigrations(adapter());
    expect(db.prepare("SELECT * FROM sync_operations").all()).toEqual(before);
    expect(db.prepare("SELECT * FROM local_trip_metadata_confirmations").all()).toEqual(proof);
    expect(db.prepare("SELECT MAX(id) AS id FROM schema_migrations").get()).toEqual({id:79});
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('trip_core_trip_operational_documents','capture_photo_import_decisions','local_trip_metadata_confirmations')").all()).toHaveLength(3);
    expect(db.prepare("SELECT sql FROM sqlite_schema WHERE name='capture_photo_decision_scope_insert'").get()?.sql).toContain("image/gif");
    // Parent proof can now be server-only, without manufacturing a local Create.
    db.exec("INSERT INTO local_trip_metadata_confirmations VALUES('A','server-trip','remote-proof','SNAPSHOT',2,'{}','{}')");
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() => db.exec("UPDATE local_trip_containers SET id='other'")).toThrow("TRIP_METADATA_PARENT_IDENTITY_IMMUTABLE");
  } finally { db.close(); rmSync(dir,{recursive:true,force:true}); }
});
