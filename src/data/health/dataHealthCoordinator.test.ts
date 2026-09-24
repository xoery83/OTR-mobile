import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { migrations } from "@/data/db/migrations";

import {
  createDataHealthCoordinator,
  DataHealthScopeChangedError,
  type DataHealthDependencies,
} from "./dataHealthCoordinator";

const openDatabases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of openDatabases.splice(0)) database.close();
});

describe("Data Health Phase B read-only scanner", () => {
  it("returns a deterministic healthy report and writes only health metadata", async () => {
    const fixture = createFixture();
    const before = domainFingerprint(fixture.sqlite);

    const first = await fixture.coordinator.run("MANUAL");
    const second = await fixture.coordinator.run("MANUAL");

    expect(first).toMatchObject({ outcome: "HEALTHY", findings: [] });
    expect(second.reportDigest).toBe(first.reportDigest);
    expect(domainFingerprint(fixture.sqlite)).toBe(before);
    expect(
      fixture.sqlite
        .prepare("SELECT count(*) AS count FROM data_health_repair_events")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("provides throttling and suspicious-state priority without scheduling scans", async () => {
    const fixture = createFixture();
    expect(await fixture.coordinator.shouldRunCheapScan()).toBe(true);
    await fixture.coordinator.run("CHEAP");
    expect(await fixture.coordinator.shouldRunCheapScan()).toBe(false);

    insertOperation(fixture.sqlite, {
      id: "waiting",
      entityId: "expense-waiting",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
    });
    expect(await fixture.coordinator.shouldRunCheapScan()).toBe(true);
    expect(await fixture.coordinator.getScopePlan()).toEqual(["journey-a"]);
  });

  it("protects local-only and historical failed causal intent", async () => {
    const fixture = createFixture();
    insertExpense(fixture.sqlite, {
      id: "expense-local",
      syncStatus: "FAILED",
      serverRevision: 0,
    });
    insertOperation(fixture.sqlite, {
      id: "create-failed",
      entityId: "expense-local",
      operationType: "CREATE_LEDGER_EXPENSE",
      status: "FAILED",
      failureCategory: "UNKNOWN",
      errorCode: "SYNC_FAILED",
    });
    insertOperation(fixture.sqlite, {
      id: "edit-blocked",
      entityId: "expense-local",
      operationType: "UPDATE_LEDGER_EXPENSE",
      status: "DEPENDENCY_BLOCKED",
      failureCategory: "DEPENDENCY",
      dependencyOperationId: "create-failed",
    });
    insertOperation(fixture.sqlite, {
      id: "validation",
      entityId: "expense-validation",
      status: "FAILED",
      failureCategory: "VALIDATION",
      errorCode: "INVALID_PAYLOAD",
    });
    insertOperation(fixture.sqlite, {
      id: "auth",
      entityId: "expense-auth",
      status: "PENDING",
      failureCategory: "AUTH",
      errorCode: "AUTH_PAUSED",
    });
    insertOperation(fixture.sqlite, {
      id: "conflict",
      entityId: "expense-conflict",
      status: "CONFLICT",
      failureCategory: "CONFLICT",
      errorCode: "REVISION_CONFLICT",
    });
    fixture.sqlite.exec(`
      INSERT INTO ledger_personal_payment_records (
        id, projection_user_id, journey_id, owner_user_id, owner_member_id,
        counterparty_member_id, direction, amount_minor, currency, scale,
        occurred_at, server_revision, created_at, updated_at, sync_status
      ) VALUES ('payment-local', 'user-a', 'journey-a', 'user-a', 'member-a',
        'member-b', 'PAID', 100, 'NZD', 2, '2026-09-24T00:00:00Z', 0,
        '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z', 'PENDING_CREATE');
    `);

    const before = domainFingerprint(fixture.sqlite);
    const report = await fixture.coordinator.run("MANUAL");

    expect(categories(report)).toEqual(
      expect.arrayContaining([
        "PROTECTED_LOCAL",
        "DEPENDENCY_BLOCKED",
        "ACTIONABLE_INPUT",
        "AUTH_PAUSED",
        "CONFLICT",
      ]),
    );
    expect(report.protectedIntentCount).toBeGreaterThanOrEqual(6);
    expect(
      report.findings.find((finding) => finding.targetId === "create-failed"),
    ).toMatchObject({ category: "PROTECTED_LOCAL" });
    expect(domainFingerprint(fixture.sqlite)).toBe(before);
  });

  it("detects locally provable receipt, cursor, deferred, FX, and Review states", async () => {
    const fixture = createFixture({ fileExists: async () => false });
    insertExpense(fixture.sqlite, { id: "expense-fx", revision: 2, serverRevision: 2 });
    fixture.sqlite.exec(`
      INSERT INTO ledger_valuation_snapshots (
        id, expense_id, expense_revision, policy, original_amount_minor,
        original_currency, original_scale, settlement_amount_minor,
        settlement_currency, settlement_scale, is_active, created_at
      ) VALUES ('valuation-stale', 'expense-fx', 1, 'REFERENCE', 100,
        'USD', 2, 160, 'NZD', 2, 1, '2026-09-24T00:00:00Z');
      INSERT INTO ledger_receipt_assets (
        id, journey_id, local_uri, mime_type, size_bytes, sha256,
        upload_status, ocr_status, created_at, updated_at, local_owner_user_id
      ) VALUES ('receipt-missing', 'journey-a', 'file:///missing.jpg', 'image/jpeg',
        10, '${"a".repeat(64)}', 'PENDING', 'PENDING',
        '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z', 'user-a');
      INSERT INTO ledger_sync_cursors (user_id, journey_id, cursor, updated_at)
      VALUES ('user-a', 'journey-a', '', '2026-09-24T00:00:00Z');
      INSERT INTO ledger_deferred_server_changes (
        journey_id, entity_type, entity_id, revision, payload_json, created_at
      ) VALUES ('journey-a', 'EXPENSE', 'expense-fx', 3, '{}',
        '2026-09-24T00:00:00Z');
      INSERT INTO ledger_review_findings (
        id, journey_id, expense_id, layer, finding_type, severity,
        evidence_codes_json, status, ruleset_version, entity_revision, revision,
        created_at, updated_at, lifecycle, target_source_revision, origin
      ) VALUES ('finding-stale', 'journey-a', 'expense-fx', 'HEURISTIC',
        'AMOUNT_OUTLIER', 'WARNING', '[]', 'OPEN', 'v2', 1, 1,
        '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z', 'ACTIVE', 1, 'SYSTEM');
      INSERT INTO ledger_review_visibility (user_id, finding_id, journey_id)
      VALUES ('user-a', 'finding-stale', 'journey-a');
      INSERT INTO ledger_personal_settlement_review_state (
        user_id, journey_id, statement_json, statement_fingerprint,
        sync_status, pending_operation_id, updated_at
      ) VALUES ('user-a', 'journey-a', '{}', 'fingerprint', 'PENDING',
        'review-operation', '2026-09-24T00:00:00Z');
    `);

    const report = await fixture.coordinator.run("MANUAL");
    expect(categories(report)).toEqual(
      expect.arrayContaining([
        "UNRECOVERABLE_INPUT",
        "MIRROR_STALE",
        "ORPHAN_REBUILDABLE",
        "PROTECTED_LOCAL",
      ]),
    );
    expect(ruleIds(report)).toEqual(
      expect.arrayContaining([
        "DH_RECEIPT_ORIGINAL_V1",
        "DH_CURSOR_SCOPE_V1",
        "DH_DEFERRED_CHANGE_V1",
        "DH_EXPENSE_FX_BINDING_V1",
        "DH_REVIEW_DERIVED_STATE_V1",
      ]),
    );
  });

  it("detects Personal Payment projection drift without changing canonical Settlement", async () => {
    const fixture = createFixture();
    fixture.sqlite.exec(`
      INSERT INTO ledger_personal_payment_records (
        id, projection_user_id, journey_id, owner_user_id, owner_member_id,
        counterparty_member_id, direction, amount_minor, currency, scale,
        occurred_at, economic_date, server_revision, created_at, updated_at, sync_status
      ) VALUES ('payment', 'user-a', 'journey-a', 'user-a', 'member-a', 'member-b',
        'PAID', 200, 'USD', 2, '2026-09-24T00:00:00Z', '2026-09-24', 2,
        '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z', 'SYNCED');
      INSERT INTO ledger_personal_payment_fx_projections (
        projection_user_id, id, payment_id, journey_id, target_currency,
        target_scale, policy_version, source_payment_revision, input_digest,
        economic_date, original_amount_minor, original_currency, original_scale,
        state, revision, created_at, updated_at
      ) VALUES ('user-a', 'projection', 'payment', 'journey-a', 'NZD', 2, 'v1',
        1, 'digest', '2026-09-24', 100, 'USD', 2, 'CONFIRMED', 1,
        '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');
      INSERT INTO ledger_settlements (
        id, journey_id, status, through_timestamp, settlement_currency,
        settlement_scale, settings_revision, algorithm_version, input_digest,
        revision, finalized_by, finalized_at
      ) VALUES ('settlement', 'journey-a', 'FINALIZED', '2026-09-24T00:00:00Z',
        'NZD', 2, 1, 'v1', 'settlement-digest', 1, 'member-a',
        '2026-09-24T00:00:00Z');
    `);
    const settlementBefore = rows(fixture.sqlite, "ledger_settlements");

    const report = await fixture.coordinator.run("MANUAL");

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "DH_PERSONAL_PAYMENT_FX_BINDING_V1",
        category: "ORPHAN_REBUILDABLE",
      }),
    );
    expect(rows(fixture.sqlite, "ledger_settlements")).toEqual(settlementBefore);
  });

  it("keeps account and Journey scopes isolated", async () => {
    const fixture = createFixture();
    insertOperation(fixture.sqlite, {
      id: "wrong-journey",
      journeyId: "journey-b",
      entityId: "expense-b",
      status: "FAILED",
      failureCategory: "UNKNOWN",
    });
    fixture.sqlite.exec(`
      INSERT INTO ledger_actor_context (
        user_id, journey_id, member_id, role, capabilities_json, updated_at
      ) VALUES ('user-b', 'journey-b', 'member-b', 'member', '{}',
        '2026-09-24T00:00:00Z');
    `);

    const report = await fixture.coordinator.run("MANUAL");
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "DH_ACCOUNT_JOURNEY_ISOLATION_V1",
        category: "ISOLATION_VIOLATION",
        journeyId: "journey-b",
      }),
    );
    expect(report.findings.some((finding) => finding.targetId === "user-b")).toBe(false);
  });

  it("aborts stale results when the account generation changes during a scan", async () => {
    let generation = 1;
    let accountId = "user-a";
    const fixture = createFixture({
      getActiveAccountId: async () => accountId,
      getAccountGeneration: () => generation,
      fileExists: async () => {
        generation += 1;
        accountId = "user-b";
        return true;
      },
    });
    fixture.sqlite.exec(`
      INSERT INTO ledger_receipt_assets (
        id, journey_id, local_uri, mime_type, size_bytes, sha256,
        upload_status, ocr_status, created_at, updated_at, local_owner_user_id
      ) VALUES ('receipt', 'journey-a', 'file:///receipt.jpg', 'image/jpeg', 10,
        '${"b".repeat(64)}', 'PENDING', 'PENDING', '2026-09-24T00:00:00Z',
        '2026-09-24T00:00:00Z', 'user-a');
    `);

    await expect(fixture.coordinator.run("MANUAL")).rejects.toBeInstanceOf(
      DataHealthScopeChangedError,
    );
    expect(
      fixture.sqlite
        .prepare(
          "SELECT run_state AS runState, last_aggregate_outcome AS outcome FROM data_health_state WHERE account_id = 'user-a'",
        )
        .get(),
    ).toEqual({ runState: "RUNNING", outcome: null });
  });
});

function createFixture(overrides: Partial<DataHealthDependencies> = {}) {
  const sqlite = new DatabaseSync(":memory:");
  openDatabases.push(sqlite);
  for (const migration of migrations) sqlite.exec(migration.sql);
  sqlite.exec(`
    INSERT INTO ledger_journeys (
      journey_id, settlement_currency, settlement_scale, valuation_policy,
      updated_at, title
    ) VALUES ('journey-a', 'NZD', 2, 'REFERENCE', '2026-09-24T00:00:00Z', 'A');
    INSERT INTO ledger_actor_context (
      user_id, journey_id, member_id, role, capabilities_json, updated_at
    ) VALUES ('user-a', 'journey-a', 'member-a', 'owner', '{}',
      '2026-09-24T00:00:00Z');
  `);
  const database = adapter(sqlite);
  const dependencies: DataHealthDependencies = {
    database,
    getActiveAccountId: async () => "user-a",
    getAccountGeneration: () => 1,
    fileExists: async () => true,
    now: () => new Date("2026-09-24T01:00:00Z"),
    ...overrides,
  };
  return { sqlite, coordinator: createDataHealthCoordinator(dependencies) };
}

function adapter(sqlite: DatabaseSync) {
  return {
    async getAllAsync<T>(sql: string, ...params: unknown[]) {
      return sqlite.prepare(sql).all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, ...params: unknown[]) {
      return (sqlite.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
    },
    async runAsync(sql: string, ...params: unknown[]) {
      return sqlite.prepare(sql).run(...(params as never[])) as never;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function insertExpense(
  sqlite: DatabaseSync,
  input: {
    id: string;
    revision?: number;
    serverRevision?: number;
    syncStatus?: string;
  },
) {
  sqlite
    .prepare(
      `INSERT INTO ledger_expenses (
        id, journey_id, payer_member_id, title, category, occurred_at,
        original_amount_minor, original_currency, original_scale, business_status,
        revision, server_revision, sync_status, created_at, updated_at,
        local_owner_user_id
      ) VALUES (?, 'journey-a', 'member-a', 'Expense', 'other',
        '2026-09-24T00:00:00Z', 100, 'USD', 2, 'ACCEPTED', ?, ?, ?,
        '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z', 'user-a')`,
    )
    .run(
      input.id,
      input.revision ?? 1,
      input.serverRevision ?? 0,
      input.syncStatus ?? "PENDING_CREATE",
    );
}

function insertOperation(
  sqlite: DatabaseSync,
  input: {
    id: string;
    journeyId?: string;
    entityId: string;
    operationType?: string;
    status: string;
    failureCategory?: string;
    errorCode?: string;
    dependencyOperationId?: string;
  },
) {
  sqlite
    .prepare(
      `INSERT INTO sync_operations (
        id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
        payload_json, status, owner_user_id, failure_category, last_error_code,
        dependency_operation_id, created_at, updated_at
      ) VALUES (?, ?, 'ledger_expense', ?, ?, ?, '{}', ?, 'user-a', ?, ?, ?,
        '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')`,
    )
    .run(
      input.id,
      input.journeyId ?? "journey-a",
      input.entityId,
      input.operationType ?? "UPDATE_LEDGER_EXPENSE",
      `${input.id}-key`,
      input.status,
      input.failureCategory ?? null,
      input.errorCode ?? null,
      input.dependencyOperationId ?? null,
    );
}

function domainFingerprint(sqlite: DatabaseSync) {
  return JSON.stringify(
    [
      "sync_operations",
      "ledger_expenses",
      "ledger_personal_payment_records",
      "ledger_asset_operations",
      "ledger_receipt_assets",
      "ledger_sync_cursors",
      "ledger_personal_payment_sync_cursors",
      "ledger_deferred_server_changes",
      "ledger_valuation_snapshots",
      "ledger_personal_payment_fx_projections",
      "ledger_review_findings",
      "ledger_review_finding_actions",
      "ledger_personal_settlement_review_state",
      "ledger_settlements",
    ].map((table) => [table, rows(sqlite, table)]),
  );
}

function rows(sqlite: DatabaseSync, table: string) {
  return sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
}

function categories(
  report: Awaited<ReturnType<ReturnType<typeof createDataHealthCoordinator>["run"]>>,
) {
  return report.findings.map((finding) => finding.category);
}

function ruleIds(
  report: Awaited<ReturnType<ReturnType<typeof createDataHealthCoordinator>["run"]>>,
) {
  return report.findings.map((finding) => finding.ruleId);
}
