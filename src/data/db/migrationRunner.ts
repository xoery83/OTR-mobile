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

    await database.withTransactionAsync(async () => {
      await database.execAsync(migration.sql);
      await database.runAsync(
        "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
        migration.id,
        migration.name,
        new Date().toISOString(),
      );
    });
  }
}

export async function getSchemaVersion(database: MigrationDatabase) {
  const migration = await database.getFirstAsync<{ id: number }>(
    "SELECT MAX(id) AS id FROM schema_migrations",
  );

  return migration?.id ?? 0;
}
