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

    const review = migrations.find((migration) => migration.id === 16)!;
    expect(review.sql).toContain("CREATE TABLE ledger_review_findings");
    expect(review.sql).toContain("CREATE TABLE ledger_review_finding_actions");

    const latest = migrations.at(-1)!;
    expect(latest.id).toBe(18);
    expect(latest.sql).toContain("default_currency");
    expect(latest.sql).toContain("debug_mode");
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

  it("adds only local export metadata in v15", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations) database.exec(migration.sql);
      expect(
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'ledger_settlement_exports'",
          )
          .get(),
      ).toEqual({ count: 1 });
      expect(
        database
          .prepare(
            "SELECT count(*) AS count FROM pragma_table_info('ledger_settlement_exports') WHERE name = 'file_sha256'",
          )
          .get(),
      ).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it("defaults existing v16 expenses to INCLUDED in v17", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations.filter(({ id }) => id <= 16))
        database.exec(migration.sql);
      database.exec(`INSERT INTO ledger_expenses (
        id, journey_id, payer_member_id, title, category, occurred_at,
        original_amount_minor, original_currency, original_scale,
        business_status, revision, sync_status, created_at, updated_at
      ) VALUES (
        'expense', 'journey', 'member', 'Lunch', 'food', '2026-09-12T00:00:00Z',
        100, 'NZD', 2, 'ACCEPTED', 1, 'SYNCED',
        '2026-09-12T00:00:00Z', '2026-09-12T00:00:00Z'
      )`);
      database.exec(migrations.find(({ id }) => id === 17)!.sql);

      expect(
        database
          .prepare(
            "SELECT settlement_participation AS participation FROM ledger_expenses WHERE id = 'expense'",
          )
          .get(),
      ).toEqual({ participation: "INCLUDED" });
      expect(() =>
        database.exec(
          "UPDATE ledger_expenses SET settlement_participation = 'INVALID' WHERE id = 'expense'",
        ),
      ).toThrow();
    } finally {
      database.close();
    }
  });

  it("adds persisted UI preferences in v18", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations.filter(({ id }) => id <= 17))
        database.exec(migration.sql);
      database.exec(
        "INSERT INTO ledger_preferences (id, selected_journey_id, updated_at) VALUES (1, 'journey', '2026-09-16T00:00:00Z')",
      );
      database.exec(migrations.find(({ id }) => id === 18)!.sql);

      expect(
        database
          .prepare(
            "SELECT default_currency AS currency, debug_mode AS debugMode FROM ledger_preferences WHERE id = 1",
          )
          .get(),
      ).toEqual({ currency: "NZD", debugMode: 0 });
    } finally {
      database.close();
    }
  });
});
