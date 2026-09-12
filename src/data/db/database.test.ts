import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

    const stage7Finalization = migrations.find((migration) => migration.id === 12)!;
    expect(stage7Finalization.sql).toContain("CREATE TABLE ledger_settlements");
    expect(stage7Finalization.sql).toContain("CREATE TABLE ledger_settlement_inputs");
    expect(stage7Finalization.sql).not.toContain("ledger_settlement_payments");

    const latest = migrations.at(-1)!;
    expect(latest.id).toBe(14);
    expect(latest.sql).toContain("settlement_kind");
    expect(latest.sql).toContain("CREATE TABLE ledger_settlement_adjustment_deltas");
  });

  it("migrates a v13 Settlement through a cold v14 restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "otr-v14-"));
    const path = join(directory, "ledger.db");
    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(path);
      for (const migration of migrations.filter(({ id }) => id <= 13))
        database.exec(migration.sql);
      database.exec(`INSERT INTO ledger_settlements (
        id, journey_id, status, through_timestamp, settlement_currency,
        settlement_scale, settings_revision, algorithm_version, input_digest,
        revision, finalized_by, finalized_at
      ) VALUES (
        'root', 'journey', 'FINALIZED', '2026-09-12T00:00:00Z', 'NZD',
        2, 1, 'ledger-settlement-greedy-v1', '${"a".repeat(64)}',
        1, 'organizer', '2026-09-12T00:00:00Z'
      )`);
      database.close();
      database = new DatabaseSync(path);
      database.exec(migrations.find(({ id }) => id === 14)!.sql);
      database.close();
      database = new DatabaseSync(path);

      expect(
        database
          .prepare(
            "SELECT settlement_kind AS kind FROM ledger_settlements WHERE id = 'root'",
          )
          .get(),
      ).toEqual({ kind: "ROOT" });
      expect(
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'ledger_settlement_adjustment_deltas'",
          )
          .get(),
      ).toEqual({ count: 1 });
    } finally {
      database?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
