import { migrations } from "./migrations";

export type MigrationDatabase = {
  execAsync(sql: string): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

export async function runMigrations(database: MigrationDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  for (const migration of migrations) {
    const existing = await database.getFirstAsync<{ id: number }>(
      "SELECT id FROM schema_migrations WHERE id = ?",
      migration.id,
    );

    if (existing) continue;

    const rebuild = migration.id === 73;
    const priorForeignKeys = rebuild
      ? await database.getFirstAsync<{ foreign_keys: number }>("PRAGMA foreign_keys")
      : null;
    if (rebuild) await database.execAsync("PRAGMA foreign_keys=OFF");
    try {
      await database.withTransactionAsync(async () => {
        await database.execAsync(migration.sql);
        if (rebuild && (await database.getFirstAsync("PRAGMA foreign_key_check")))
          throw new Error("CAPTURE_MIXED_MIGRATION_INTEGRITY");
        await database.runAsync(
          "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
          migration.id,
          migration.name,
          new Date().toISOString(),
        );
      });
    } finally {
      if (rebuild)
        await database.execAsync(
          `PRAGMA foreign_keys=${priorForeignKeys?.foreign_keys === 1 ? "ON" : "OFF"}`,
        );
    }
  }
}

export async function getSchemaVersion(database: MigrationDatabase) {
  const migration = await database.getFirstAsync<{ id: number }>(
    "SELECT MAX(id) AS id FROM schema_migrations",
  );

  return migration?.id ?? 0;
}
