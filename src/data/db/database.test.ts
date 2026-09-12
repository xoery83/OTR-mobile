import { describe, expect, it } from "vitest";

import { migrations } from "./migrations";
import { runMigrations, type MigrationDatabase } from "./migrationRunner";

function createMigrationDatabase(initialMigrationIds: number[] = []) {
  const appliedMigrationIds = new Set<number>(initialMigrationIds);
  const executedSql: string[] = [];

  const database: MigrationDatabase = {
    async execAsync(sql) {
      executedSql.push(sql);
    },
    async getFirstAsync<T>(_sql: string, id: unknown) {
      return (appliedMigrationIds.has(id as number) ? { id } : null) as T | null;
    },
    async runAsync(_sql, id) {
      appliedMigrationIds.add(id as number);
      return {} as never;
    },
    async withTransactionAsync(task) {
      await task();
    },
  };

  return { appliedMigrationIds, database, executedSql };
}

describe("SQLite migrations", () => {
  it("creates the migration ledger and applies each migration once", async () => {
    const { appliedMigrationIds, database, executedSql } = createMigrationDatabase();

    await runMigrations(database);
    await runMigrations(database);

    expect(executedSql).toHaveLength(migrations.length + 2);
    expect(appliedMigrationIds).toEqual(
      new Set(migrations.map((migration) => migration.id)),
    );
  });

  it("repairs a database that recorded migration 3 without creating the itinerary table", async () => {
    const { appliedMigrationIds, database, executedSql } = createMigrationDatabase([
      1, 2, 3,
    ]);

    await runMigrations(database);

    expect(executedSql).toHaveLength(migrations.length - 2);
    expect(executedSql[1]).toContain("CREATE TABLE IF NOT EXISTS itinerary_items");
    expect(appliedMigrationIds).toContain(4);
    expect(appliedMigrationIds).toContain(6);
  });

  it("adds Stage 5.2 assets before the Stage 6 reporting cache", () => {
    const stage5 = migrations.find((migration) => migration.id === 10)!;
    expect(stage5.sql).toContain("CREATE TABLE ledger_receipt_assets");
    expect(stage5.sql).toContain("CREATE TABLE ledger_asset_operations");
    expect(stage5.sql).not.toContain("payload_json");

    const latest = migrations.at(-1)!;
    expect(latest.id).toBe(12);
    expect(latest.sql).toContain("CREATE TABLE ledger_settlements");
    expect(latest.sql).toContain("CREATE TABLE ledger_settlement_inputs");
    expect(latest.sql).not.toContain("ledger_settlement_payments");
  });
});
