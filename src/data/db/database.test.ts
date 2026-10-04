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

  it("reserves A migration 45 after integration-owned B-T3F version 44", async () => {
    const prior = migrations.filter(({ id }) => id < 45).map(({ id }) => id);
    const { appliedMigrationIds, database, executedSql } = createMigrationDatabase([
      ...prior,
      44,
    ]);
    const participation = migrations.find(
      ({ name }) => name === "trip_person_participation_results",
    )!;
    expect(participation.id).toBe(45);
    // Both accepted registrations are present in the combined chain.
    expect(migrations.find(({ id }) => id === 44)?.name).toBe(
      "trip_canonical_event_read_only_mirror",
    );
    expect(migrations.map(({ id }) => id)).toEqual(
      Array.from({ length: 45 }, (_, i) => i + 1),
    );
    await runMigrations(database);
    await runMigrations(database);
    expect(executedSql).toEqual([
      expect.stringContaining("schema_migrations"),
      participation.sql,
      expect.stringContaining("schema_migrations"),
    ]);
    expect(appliedMigrationIds).toEqual(new Set([...prior, 44, 45]));
  });

  it("upgrades v43 through B44 then A45 and preserves both mirrors and existing data on restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otr-a45-restart-"));
    const path = join(directory, "upgrade.sqlite");
    let sqlite = new DatabaseSync(path);
    const applied: number[] = [];
    let mirrorBefore: string;
    const mirror = () =>
      JSON.stringify([
        sqlite.prepare("SELECT * FROM trip_canonical_events").all(),
        sqlite
          .prepare("SELECT * FROM trip_canonical_transport_endpoints ORDER BY role")
          .all(),
      ]);
    const adapter = (): MigrationDatabase => ({
      async execAsync(sql) {
        const migration = migrations.find((m) => m.sql === sql);
        if (migration?.id === 45) expect(mirror()).toBe(mirrorBefore);
        sqlite.exec(sql);
        if (migration) applied.push(migration.id);
        if (migration?.id === 44) {
          sqlite.exec(`INSERT INTO trip_canonical_events
            (account_id,trip_id,event_id,read_version,read_disposition,legacy_compatible,
             observation_sequence,observed_generation,temporal_contract_version,temporal_shape,
             semantic_revision,is_estimated_time,title,event_type,status,participant_scope)
            VALUES('account','trip','event',1,'READ_ONLY',0,1,0,1,'TRANSPORT',9,0,'Transport','transport','active','ALL');
            INSERT INTO trip_canonical_transport_endpoints
            (account_id,trip_id,event_id,role,instant,local_date,local_time)
            VALUES('account','trip','event','ORIGIN','2026-10-04T01:00:00.123456Z','2026-10-04','01:00'),
                  ('account','trip','event','DESTINATION','2026-10-04T03:00:00.654321Z','2026-10-04','03:00');`);
          mirrorBefore = mirror();
        }
      },
      async getFirstAsync<T>(sql: string, ...args: unknown[]) {
        return (sqlite.prepare(sql).get(...(args as never[])) ?? null) as T | null;
      },
      async runAsync(sql, ...args) {
        return sqlite.prepare(sql).run(...(args as never[]));
      },
      async withTransactionAsync(task) {
        sqlite.exec("BEGIN");
        try {
          await task();
          sqlite.exec("COMMIT");
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    });
    try {
      // Upgrade the real reviewed 1–43 schema; the runner installs both real 44/45.
      sqlite.exec(
        "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
      );
      for (const migration of migrations.filter(({ id }) => id < 44)) {
        sqlite.exec(migration.sql);
        sqlite
          .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
          .run(migration.id, migration.name, "2026-10-04");
      }
      sqlite.exec(`INSERT INTO expenses(id,trip_id,title,amount_minor,currency_code,created_at,updated_at,sync_status)
        VALUES('expense','trip','Legacy expense',123,'USD','time','time','SYNCED');
        INSERT INTO itinerary_items(id,trip_id,title,scheduled_date,created_at,updated_at,sync_status)
        VALUES('itinerary','trip','Legacy Event','2026-10-04','time','time','SYNCED');
        INSERT INTO ledger_members(id,journey_id,display_name,role,status,updated_at,participation_active,participation_revision)
        VALUES('person','trip','Owner','owner','linked','time',1,7);
        INSERT INTO ledger_sync_cursors(user_id,journey_id,cursor,server_time,updated_at)
        VALUES('account','trip','financial','time','time');
        INSERT INTO ledger_personal_payment_sync_cursors(user_id,journey_id,cursor,server_time,updated_at)
        VALUES('account','trip','private','time','time');
        INSERT INTO ledger_personal_payment_records(id,projection_user_id,journey_id,owner_user_id,owner_member_id,counterparty_member_id,direction,amount_minor,currency,scale,occurred_at,server_revision,created_at,updated_at,sync_status)
        VALUES('payment','account','trip','account','person','other','PAID',100,'USD',2,'2026-10-04T00:00:00Z',1,'time','time','SYNCED');`);
      const oldTables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name<>'schema_migrations' ORDER BY name",
        )
        .all()
        .map((row) => String(row.name));
      const existing = () =>
        JSON.stringify(
          oldTables.map((table) => [
            table,
            sqlite.prepare(`SELECT * FROM "${table}"`).all(),
            sqlite
              .prepare(
                "SELECT type,name,sql FROM sqlite_master WHERE tbl_name=? ORDER BY type,name",
              )
              .all(table),
          ]),
        );
      const priorData = existing();
      sqlite.exec("PRAGMA foreign_keys=ON");
      await runMigrations(adapter());
      expect(applied).toEqual([44, 45]);
      expect(existing()).toBe(priorData);
      expect(mirror()).toBe(mirrorBefore!);
      expect(() =>
        sqlite.exec(
          "INSERT INTO trip_canonical_transport_endpoints(account_id,trip_id,event_id,role) VALUES('account','trip','missing','ORIGIN')",
        ),
      ).toThrow(/FOREIGN KEY/);
      expect(() =>
        sqlite.exec(
          "INSERT INTO trip_canonical_transport_endpoints(account_id,trip_id,event_id,role) VALUES('account','trip','event','OTHER')",
        ),
      ).toThrow(/CHECK/);
      sqlite
        .prepare("INSERT INTO trip_person_participation_results VALUES(?,?,?,?,?,?,?)")
        .run("account", "trip", "person", "operation", "receipt", "digest", "{}");
      const before = sqlite.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
      expect(before.at(-1)).toMatchObject({
        id: 45,
        name: "trip_person_participation_results",
      });
      expect(before.map((row) => row.id)).toEqual(
        Array.from({ length: 45 }, (_, i) => i + 1),
      );
      sqlite.close();
      sqlite = new DatabaseSync(path);
      await runMigrations(adapter());
      expect(applied).toEqual([44, 45]);
      expect(existing()).toBe(priorData);
      expect(mirror()).toBe(mirrorBefore!);
      expect(sqlite.prepare("SELECT * FROM schema_migrations ORDER BY id").all()).toEqual(
        before,
      );
      expect(
        sqlite.prepare("SELECT receipt_id FROM trip_person_participation_results").get(),
      ).toEqual({ receipt_id: "receipt" });
      expect(() =>
        sqlite.exec("UPDATE trip_person_participation_results SET receipt_json='{}'"),
      ).toThrow("PARTICIPATION_RECEIPT_IMMUTABLE");
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    }
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

    const account = migrations.find(({ id }) => id === 19)!;
    expect(account.sql).toContain("owner_user_id");
    expect(account.sql).toContain("local_owner_user_id");
    expect(migrations.find(({ id }) => id === 37)!.sql).toContain(
      "ledger_my_spending_facts",
    );
    const latest = migrations.at(-1)!;
    expect(latest.id).toBe(45);
    expect(migrations.find((migration) => migration.id === 39)?.sql).toContain(
      "original_mime_type",
    );
    expect(migrations.find((m) => m.id === 40)!.sql).toContain("ledger_expense_commands");
    expect(migrations.find(({ id }) => id === 41)!.sql).toContain(
      "ledger_expense_resolution_receipts",
    );
    expect(migrations[28].sql).toContain("coverage_json");
    expect(migrations[29].sql).toContain("correction_source_expense_id");
    expect(migrations[30].sql).toContain("pending_review_state");
    expect(migrations[31].sql).toContain("ledger_fx_reference_snapshots");
    expect(migrations[32].sql).toContain("ledger_personal_payment_fx_projections");
    expect(migrations[33].sql).toContain("economic_date_source");
    expect(migrations[34].sql).toContain("dependency_operation_id");
    expect(migrations[35].sql).toContain("CREATE TABLE data_health_state");
    expect(migrations[35].sql).toContain("CREATE TABLE data_health_repair_events");
    expect(migrations[22].sql).toContain("reference_date");
    expect(migrations[23].sql).toContain("reference_evidence_json");
    expect(migrations[24].sql).toContain("ledger_personal_payment_records");
    expect(migrations[26].sql).toContain("personal_payment_id");
    expect(migrations[20].sql).toContain("ledger_review_visibility");
    expect(migrations[19].sql).toContain("observation_context_json");
  });

  it("upgrades existing scoped and null-user cursors without certifying them", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations.filter(({ id }) => id < 43))
        database.exec(migration.sql);
      database.exec(
        "INSERT INTO ledger_sync_cursors(user_id,journey_id,cursor,server_time,updated_at) VALUES ('account','trip','v1','time','time'),(NULL,'legacy','old','time','time')",
      );
      const before = database
        .prepare("SELECT * FROM ledger_sync_cursors ORDER BY journey_id")
        .all();
      database.exec(migrations.find(({ id }) => id === 43)!.sql);
      const metadata = Object.fromEntries(
        [
          "snapshot_contract_version",
          "fingerprint_version",
          "fingerprint",
          "person_ids_json",
          "observed_at",
          "verified_at",
          "bound_cursor",
        ].map((name) => [`participation_${name}`, null]),
      );
      expect(
        database.prepare("SELECT * FROM ledger_sync_cursors ORDER BY journey_id").all(),
      ).toEqual(before.map((row) => ({ ...row, ...metadata })));
    } finally {
      database.close();
    }
  });

  it("upgrades cached Members to an unobserved pair and enforces both-column invariants", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations.filter(({ id }) => id < 42))
        database.exec(migration.sql);
      database.exec(`INSERT INTO ledger_members(id,journey_id,display_name,role,status,updated_at)
        VALUES ('person','trip','Name','owner','linked','2026-10-03')`);
      const before = database.prepare("SELECT * FROM ledger_members").get();
      database.exec(migrations.find(({ id }) => id === 42)!.sql);
      expect(database.prepare("SELECT * FROM ledger_members").get()).toEqual({
        ...before,
        participation_active: null,
        participation_revision: null,
      });
      const update = database.prepare(
        "UPDATE ledger_members SET participation_active=?,participation_revision=?",
      );
      for (const [active, revision] of [
        [null, 0],
        [1, null],
        [2, 0],
        [0, -1],
        [1, 0.5],
        [1, "bad"],
        [1, Number.MAX_SAFE_INTEGER + 1],
        ["bad", 0],
      ])
        expect(() => update.run(active!, revision!)).toThrow(/CHECK/);
      update.run(0, 7);
      expect(() =>
        database.exec("UPDATE ledger_members SET participation_active=NULL"),
      ).toThrow(/CHECK/);
      update.run(1, Number.MAX_SAFE_INTEGER);
      update.run(null, null);
    } finally {
      database.close();
    }
  });

  it("backfills old Personal Payment economic dates in UTC", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations.filter(({ id }) => id <= 32))
        database.exec(migration.sql);
      database.exec(`INSERT INTO ledger_personal_payment_records (
        id, projection_user_id, journey_id, owner_user_id, owner_member_id,
        counterparty_member_id, direction, amount_minor, currency, scale,
        occurred_at, server_revision, created_at, updated_at, sync_status
      ) VALUES ('payment', 'user', 'journey', 'user', 'owner', 'other', 'PAID',
        100, 'USD', 2, '2026-09-23T23:30:00-04:00', 1,
        '2026-09-24T03:30:00Z', '2026-09-24T03:30:00Z', 'SYNCED')`);
      database.exec(migrations.find(({ id }) => id === 33)!.sql);
      expect(
        database
          .prepare(
            "SELECT economic_date AS economicDate FROM ledger_personal_payment_records",
          )
          .get(),
      ).toEqual({ economicDate: "2026-09-24" });
    } finally {
      database.close();
    }
  });

  it("adds nullable Review v2 evidence without rewriting v1 history", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations.filter(({ id }) => id <= 19))
        database.exec(migration.sql);
      database.exec(`INSERT INTO ledger_review_findings (
        id, journey_id, expense_id, layer, finding_type, severity, confidence,
        evidence_codes_json, status, ruleset_version, entity_revision, revision,
        created_at, updated_at
      ) VALUES ('legacy', 'journey', 'expense', 'HEURISTIC', 'AMOUNT_OUTLIER',
        'WARNING', 0.75, '["TEN_TIMES_JOURNEY_MEDIAN"]', 'ACKNOWLEDGED',
        'ledger-review-v1', 1, 2, '2026-09-16', '2026-09-16')`);
      database.exec(`INSERT INTO ledger_review_finding_actions (
        id, finding_id, action, actor_user_id, actor_member_id, actor_role,
        reason, finding_revision, entity_revision, ruleset_version,
        operation_id, sync_status, created_at
      ) VALUES ('action', 'legacy', 'ACKNOWLEDGED', 'user', 'member', 'owner',
        'valid', 1, 1, 'ledger-review-v1', 'operation', 'SYNCED', '2026-09-16')`);
      database.exec(migrations.find(({ id }) => id === 20)!.sql);
      expect(
        database
          .prepare(
            `SELECT status, rule_id AS ruleId,
        observation_context_json AS context FROM ledger_review_findings WHERE id = 'legacy'`,
          )
          .get(),
      ).toEqual({ status: "ACKNOWLEDGED", ruleId: null, context: null });
      expect(
        database.prepare("SELECT count(*) AS n FROM ledger_review_finding_actions").get(),
      ).toEqual({ n: 1 });
    } finally {
      database.close();
    }
  });

  it("leaves ambiguous legacy Expense dates unknown in migration 22", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations.filter(({ id }) => id <= 21))
        database.exec(migration.sql);
      database.exec(`INSERT INTO ledger_expenses (
        id, journey_id, payer_member_id, title, category, occurred_at,
        original_amount_minor, original_currency, original_scale, business_status,
        revision, sync_status, created_at, updated_at
      ) VALUES ('legacy', 'journey', 'member', 'Old', 'other',
        '2026-07-15T00:30:00Z', 100, 'EUR', 2, 'RATE_REQUIRED', 1,
        'SYNCED', '2026-07-15T00:30:00Z', '2026-07-15T00:30:00Z')`);
      database.exec(migrations.find(({ id }) => id === 22)!.sql);
      expect(
        database.prepare("SELECT occurred_at, economic_date FROM ledger_expenses").get(),
      ).toEqual({ occurred_at: "2026-07-15T00:30:00Z", economic_date: null });
      database.exec(
        "UPDATE ledger_expenses SET economic_date = '2026-07-14' WHERE id = 'legacy'",
      );
      expect(database.prepare("SELECT economic_date FROM ledger_expenses").get()).toEqual(
        { economic_date: "2026-07-14" },
      );
    } finally {
      database.close();
    }
  });

  it("keeps B2 candidate request and reference dates through a cold SQLite restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "otr-b2-"));
    const path = join(directory, "ledger.db");
    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(path);
      for (const migration of migrations) database.exec(migration.sql);
      database.exec(`INSERT INTO ledger_rate_quotes (
        id, journey_id, quote_currency, base_currency, decimal_rate,
        effective_date, economic_date, reference_date, policy_version,
        observed_at, provider, provider_reference, expires_at, updated_at
      ) VALUES ('quote', 'journey', 'EUR', 'NZD', '1.9808',
        '2026-07-10', '2026-07-12', '2026-07-10', 'ECB_DAILY_V1',
        '2026-09-17T00:00:00Z', 'ECB', 'source', '2026-10-17T00:00:00Z',
        '2026-09-17T00:00:00Z')`);
      database.close();
      database = new DatabaseSync(path);
      expect(
        database
          .prepare(
            `SELECT economic_date, reference_date, decimal_rate
        FROM ledger_rate_quotes WHERE id = 'quote'`,
          )
          .get(),
      ).toEqual({
        economic_date: "2026-07-12",
        reference_date: "2026-07-10",
        decimal_rate: "1.9808",
      });
    } finally {
      database?.close();
      rmSync(directory, { recursive: true, force: true });
    }
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

  it("adds device-local account isolation in v19 without deleting domain data", () => {
    const database = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations.filter(({ id }) => id <= 18))
        database.exec(migration.sql);
      database.exec(`
        INSERT INTO ledger_actor_context (
          journey_id, member_id, role, capabilities_json, updated_at, user_id
        ) VALUES ('journey', 'member-a', 'owner', '{}', '2026-09-16T00:00:00Z', 'user-a');
        INSERT INTO ledger_my_journey_summaries (
          journey_id, period_key, title, currency, scale, my_spend_minor,
          paid_minor, position_minor, unvalued_count, conflict_count, updated_at
        ) VALUES (
          'journey', 'YEAR', 'Journey', 'NZD', 2, 100, 100, 0, 0, 0,
          '2026-09-16T00:00:00Z'
        );
        INSERT INTO ledger_sync_cursors (journey_id, cursor, server_time, updated_at)
        VALUES ('journey', 'cursor-a', '2026-09-16T00:00:00Z', '2026-09-16T00:00:00Z');
        INSERT INTO sync_operations (
          id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
          payload_json, status, attempt_count, created_at, updated_at
        ) VALUES (
          'operation', 'journey', 'ledger_expense', 'expense',
          'LEDGER_CREATE_EXPENSE', 'key', '{}', 'PENDING', 0,
          '2026-09-16T00:00:00Z', '2026-09-16T00:00:00Z'
        );
        INSERT INTO ledger_asset_operations (
          id, journey_id, asset_id, operation_type, idempotency_key, status,
          created_at, updated_at
        ) VALUES (
          'asset-operation', 'journey', 'asset', 'UPLOAD_RECEIPT', 'asset-key',
          'PENDING', '2026-09-16T00:00:00Z', '2026-09-16T00:00:00Z'
        );
        INSERT INTO ledger_expenses (
          id, journey_id, payer_member_id, title, category, occurred_at,
          original_amount_minor, original_currency, original_scale,
          business_status, revision, sync_status, created_at, updated_at
        ) VALUES (
          'expense', 'journey', 'member-a', 'Lunch', 'food',
          '2026-09-16T00:00:00Z', 100, 'NZD', 2, 'ACCEPTED', 1, 'PENDING_CREATE',
          '2026-09-16T00:00:00Z', '2026-09-16T00:00:00Z'
        );
      `);

      database.exec(migrations.find(({ id }) => id === 19)!.sql);
      database.exec(`
        INSERT INTO ledger_actor_context (
          user_id, journey_id, member_id, role, capabilities_json, updated_at
        ) VALUES ('user-b', 'journey', 'member-b', 'group_member', '{}', '2026-09-16T00:00:00Z');
      `);

      expect(
        database
          .prepare(
            "SELECT count(*) AS count FROM ledger_actor_context WHERE journey_id = 'journey'",
          )
          .get(),
      ).toEqual({ count: 2 });
      expect(
        database
          .prepare(
            "SELECT user_id AS userId FROM ledger_actor_context WHERE member_id = 'member-a'",
          )
          .get(),
      ).toEqual({ userId: "user-a" });
      expect(
        database
          .prepare(
            "SELECT user_id AS userId FROM ledger_my_journey_summaries WHERE journey_id = 'journey'",
          )
          .get(),
      ).toEqual({ userId: null });
      expect(
        database
          .prepare(
            "SELECT owner_user_id AS owner FROM sync_operations WHERE id = 'operation'",
          )
          .get(),
      ).toEqual({ owner: null });
      expect(
        database
          .prepare(
            "SELECT owner_user_id AS owner FROM ledger_asset_operations WHERE id = 'asset-operation'",
          )
          .get(),
      ).toEqual({ owner: null });
      expect(
        database
          .prepare(
            "SELECT local_owner_user_id AS owner FROM ledger_expenses WHERE id = 'expense'",
          )
          .get(),
      ).toEqual({ owner: null });
      expect(
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'account_local_state'",
          )
          .get(),
      ).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });
});
