import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { ApiClientError } from "@/data/api/client";
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

    expect(first).toMatchObject({
      generation: 1,
      outcome: "HEALTHY",
      findings: [],
      repairPlans: [],
    });
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
    const report = await fixture.coordinator.repair("MANUAL");

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
    expect(
      report.repairPlans.find((plan) => plan.targetId === "create-failed"),
    ).toMatchObject({
      disposition: "PROTECTED",
      eligibility: "INELIGIBLE",
      actionId: null,
    });
    expect(domainFingerprint(fixture.sqlite)).toBe(before);
    expect(repairEvents(fixture.sqlite)).toEqual([]);
  });

  it("keeps the guard 915 causal chain protected and byte-stable across repeated planning", async () => {
    const fixture = createFixture();
    insertExpense(fixture.sqlite, {
      id: "guard-915-expense",
      revision: 6,
      serverRevision: 0,
      syncStatus: "FAILED",
    });
    insertOperation(fixture.sqlite, {
      id: "guard-915-create",
      entityId: "guard-915-expense",
      operationType: "CREATE_LEDGER_EXPENSE",
      status: "FAILED",
      failureCategory: "UNKNOWN",
    });
    for (let index = 1; index <= 5; index += 1)
      insertOperation(fixture.sqlite, {
        id: `guard-915-update-${index}`,
        entityId: "guard-915-expense",
        status: "FAILED",
        failureCategory: "UNKNOWN",
        dependencyOperationId: "guard-915-create",
      });
    const domainBefore = domainFingerprint(fixture.sqlite);
    const queueBefore = queueFingerprint(fixture.sqlite);

    const first = await fixture.coordinator.repair("MANUAL");
    const second = await fixture.coordinator.repair("MANUAL");

    expect(first.findings).toHaveLength(7);
    expect(
      first.findings.every((finding) => finding.category === "PROTECTED_LOCAL"),
    ).toBe(true);
    expect(first.repairPlans).toHaveLength(7);
    expect(
      first.repairPlans.every(
        (plan) =>
          plan.disposition === "PROTECTED" &&
          plan.eligibility === "INELIGIBLE" &&
          plan.actionId === null,
      ),
    ).toBe(true);
    expect(second.reportDigest).toBe(first.reportDigest);
    expect(second.findings).toEqual(first.findings);
    expect(second.repairPlans).toEqual(first.repairPlans);
    expect(domainFingerprint(fixture.sqlite)).toBe(domainBefore);
    expect(queueFingerprint(fixture.sqlite)).toBe(queueBefore);
    expect(
      fixture.sqlite
        .prepare("SELECT count(*) AS count FROM data_health_repair_events")
        .get(),
    ).toEqual({ count: 0 });
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
    expect(
      report.repairPlans.find((plan) => plan.targetId === "wrong-journey"),
    ).toMatchObject({
      accountId: "user-a",
      generation: 1,
      journeyId: "journey-b",
      disposition: "PROTECTED",
      eligibility: "INELIGIBLE",
    });
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

describe("Data Health Phase C1 safe queue repair", () => {
  it("recovers an expired lease exactly once and verifies without changing domain facts", async () => {
    const fixture = createFixture();
    insertOperation(fixture.sqlite, {
      id: "expired-lease",
      entityId: "expense-lease",
      status: "PROCESSING",
      failureCategory: "NETWORK",
      leaseExpiresAt: "2026-09-24T00:59:00Z",
      claimOwner: "dead-worker",
      attemptCount: 3,
    });
    fixture.sqlite.exec(`
      INSERT INTO ledger_settlements (
        id, journey_id, status, through_timestamp, settlement_currency,
        settlement_scale, settings_revision, algorithm_version, input_digest,
        revision, finalized_by, finalized_at
      ) VALUES ('settlement-c1', 'journey-a', 'FINALIZED',
        '2026-09-24T00:00:00Z', 'NZD', 2, 1, 'v1', 'stable', 1, 'member-a',
        '2026-09-24T00:00:00Z');
    `);
    const domainBefore = userDomainFingerprint(fixture.sqlite);

    await fixture.coordinator.repair("MANUAL");

    expect(operationState(fixture.sqlite, "expired-lease")).toMatchObject({
      status: "RETRYABLE",
      attempt_count: 3,
      next_attempt_at: "2026-09-24T01:00:00.000Z",
      claim_owner: null,
      lease_expires_at: null,
    });
    expect(repairEvents(fixture.sqlite)).toEqual([
      expect.objectContaining({
        action: "RECOVER_EXPIRED_OPERATION_LEASE_V1",
        status: "VERIFIED",
        affected_count: 1,
      }),
    ]);
    const queueAfterFirst = queueFingerprint(fixture.sqlite);
    await fixture.coordinator.repair("MANUAL");
    expect(queueFingerprint(fixture.sqlite)).toBe(queueAfterFirst);
    expect(repairEvents(fixture.sqlite)).toHaveLength(1);
    expect(userDomainFingerprint(fixture.sqlite)).toBe(domainBefore);
  });

  it("never steals a live processing lease", async () => {
    const fixture = createFixture();
    insertOperation(fixture.sqlite, {
      id: "live-lease",
      entityId: "expense-live",
      status: "PROCESSING",
      failureCategory: "NETWORK",
      leaseExpiresAt: "2026-09-24T01:05:00Z",
      claimOwner: "live-worker",
    });
    const before = queueFingerprint(fixture.sqlite);

    await fixture.coordinator.repair("MANUAL");

    expect(queueFingerprint(fixture.sqlite)).toBe(before);
    expect(repairEvents(fixture.sqlite)).toEqual([]);
  });

  it("wakes only a completed dependency with proven server identity, exactly once", async () => {
    const fixture = createFixture();
    insertExpense(fixture.sqlite, {
      id: "expense-mapped",
      serverId: "server-expense-mapped",
      serverRevision: 1,
      syncStatus: "PENDING_UPDATE",
    });
    insertOperation(fixture.sqlite, {
      id: "create-completed",
      entityId: "expense-mapped",
      operationType: "CREATE_LEDGER_EXPENSE",
      status: "COMPLETED",
    });
    insertOperation(fixture.sqlite, {
      id: "dependent-ready",
      entityId: "expense-mapped",
      status: "DEPENDENCY_BLOCKED",
      failureCategory: "DEPENDENCY",
      dependencyOperationId: "create-completed",
    });
    insertExpense(fixture.sqlite, {
      id: "expense-unmapped",
      serverRevision: 0,
      syncStatus: "PENDING_UPDATE",
    });
    insertOperation(fixture.sqlite, {
      id: "create-unmapped",
      entityId: "expense-unmapped",
      operationType: "CREATE_LEDGER_EXPENSE",
      status: "COMPLETED",
    });
    insertOperation(fixture.sqlite, {
      id: "dependent-unmapped",
      entityId: "expense-unmapped",
      status: "DEPENDENCY_BLOCKED",
      failureCategory: "DEPENDENCY",
      dependencyOperationId: "create-unmapped",
    });
    insertOperation(fixture.sqlite, {
      id: "create-incomplete",
      entityId: "expense-mapped",
      operationType: "CREATE_LEDGER_EXPENSE",
      status: "PENDING",
    });
    insertOperation(fixture.sqlite, {
      id: "dependent-incomplete",
      entityId: "expense-mapped",
      status: "DEPENDENCY_BLOCKED",
      failureCategory: "DEPENDENCY",
      dependencyOperationId: "create-incomplete",
    });

    await fixture.coordinator.repair("MANUAL");

    expect(operationState(fixture.sqlite, "dependent-ready")).toMatchObject({
      status: "PENDING",
      attempt_count: 0,
      dependency_operation_id: "create-completed",
    });
    expect(operationState(fixture.sqlite, "dependent-unmapped")).toMatchObject({
      status: "DEPENDENCY_BLOCKED",
      attempt_count: 0,
    });
    expect(operationState(fixture.sqlite, "dependent-incomplete")).toMatchObject({
      status: "DEPENDENCY_BLOCKED",
      attempt_count: 0,
    });
    expect(repairEvents(fixture.sqlite)).toEqual([
      expect.objectContaining({
        action: "WAKE_COMPLETED_OPERATION_DEPENDENCY_V1",
        status: "VERIFIED",
      }),
    ]);
    const after = queueFingerprint(fixture.sqlite);
    await fixture.coordinator.repair("MANUAL");
    expect(queueFingerprint(fixture.sqlite)).toBe(after);
    expect(repairEvents(fixture.sqlite)).toHaveLength(1);
  });

  it("reactivates only a future sparse retry while preserving due and auth work", async () => {
    const fixture = createFixture();
    insertOperation(fixture.sqlite, {
      id: "sparse-retry",
      entityId: "expense-sparse",
      status: "RETRYABLE",
      failureCategory: "UNKNOWN",
      nextAttemptAt: "2026-10-24T01:00:00Z",
      attemptCount: 9,
    });
    insertOperation(fixture.sqlite, {
      id: "already-due",
      entityId: "expense-due",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-09-24T00:59:00Z",
      attemptCount: 2,
    });
    insertOperation(fixture.sqlite, {
      id: "normal-backoff",
      entityId: "expense-backoff",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-09-24T01:05:00Z",
      attemptCount: 2,
    });
    insertOperation(fixture.sqlite, {
      id: "auth-paused",
      entityId: "expense-auth",
      status: "PENDING",
      failureCategory: "AUTH",
      nextAttemptAt: "2026-10-24T01:00:00Z",
      attemptCount: 4,
    });

    await fixture.coordinator.repair("MANUAL");

    expect(operationState(fixture.sqlite, "sparse-retry")).toMatchObject({
      status: "RETRYABLE",
      attempt_count: 9,
      next_attempt_at: null,
    });
    expect(operationState(fixture.sqlite, "already-due")).toMatchObject({
      status: "RETRYABLE",
      next_attempt_at: "2026-09-24T00:59:00Z",
    });
    expect(operationState(fixture.sqlite, "normal-backoff")).toMatchObject({
      status: "RETRYABLE",
      attempt_count: 2,
      next_attempt_at: "2026-09-24T01:05:00Z",
    });
    expect(operationState(fixture.sqlite, "auth-paused")).toMatchObject({
      status: "PENDING",
      attempt_count: 4,
      next_attempt_at: "2026-10-24T01:00:00Z",
    });
    expect(repairEvents(fixture.sqlite)).toEqual([
      expect.objectContaining({
        action: "REACTIVATE_RETRYABLE_OPERATION_V1",
        status: "VERIFIED",
      }),
    ]);
  });

  it("rejects a stale plan after operation evidence changes and rescans", async () => {
    const fixture = createFixture(
      {},
      {
        beforeTransaction: (count, sqlite) => {
          if (count === 3)
            sqlite
              .prepare(
                "UPDATE sync_operations SET next_attempt_at = ? WHERE id = 'stale-retry'",
              )
              .run("2026-11-24T01:00:00Z");
        },
      },
    );
    insertOperation(fixture.sqlite, {
      id: "stale-retry",
      entityId: "expense-stale",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-10-24T01:00:00Z",
      attemptCount: 7,
    });

    const report = await fixture.coordinator.repair("MANUAL");

    expect(operationState(fixture.sqlite, "stale-retry")).toMatchObject({
      status: "RETRYABLE",
      next_attempt_at: "2026-11-24T01:00:00Z",
    });
    expect(
      report.findings.find(({ targetId }) => targetId === "stale-retry")?.inputDigest,
    ).not.toBeUndefined();
    expect(repairEvents(fixture.sqlite)).toEqual([]);
  });

  it("aborts and rescans when the account switches before mutation", async () => {
    let generation = 1;
    let accountId = "user-a";
    const fixture = createFixture(
      {
        getActiveAccountId: async () => accountId,
        getAccountGeneration: () => generation,
      },
      {
        beforeTransaction: (count) => {
          if (count === 3) {
            generation = 2;
            accountId = "user-b";
          }
        },
      },
    );
    insertOperation(fixture.sqlite, {
      id: "generation-retry",
      entityId: "expense-generation",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-10-24T01:00:00Z",
      attemptCount: 7,
    });
    const before = queueFingerprint(fixture.sqlite);

    const report = await fixture.coordinator.repair("MANUAL");

    expect(report.accountId).toBe("user-b");
    expect(report.generation).toBe(2);
    expect(queueFingerprint(fixture.sqlite)).toBe(before);
    expect(repairEvents(fixture.sqlite)).toEqual([]);
  });

  it("rolls back an interrupted repair transaction", async () => {
    const fixture = createFixture();
    insertOperation(fixture.sqlite, {
      id: "transaction-kill",
      entityId: "expense-transaction",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-10-24T01:00:00Z",
      attemptCount: 7,
    });
    fixture.sqlite.exec(`
      CREATE TRIGGER fail_health_event BEFORE INSERT ON data_health_repair_events
      BEGIN SELECT RAISE(ABORT, 'injected process kill'); END;
    `);
    const before = queueFingerprint(fixture.sqlite);

    await expect(fixture.coordinator.repair("MANUAL")).rejects.toThrow(
      "injected process kill",
    );
    expect(queueFingerprint(fixture.sqlite)).toBe(before);
    expect(repairEvents(fixture.sqlite)).toEqual([]);
    fixture.sqlite.exec("DROP TRIGGER fail_health_event");
    await fixture.coordinator.repair("MANUAL");
    expect(operationState(fixture.sqlite, "transaction-kill").next_attempt_at).toBeNull();
  });

  it("resumes verification after a kill between APPLIED and VERIFIED", async () => {
    let fileChecks = 0;
    const fixture = createFixture({
      fileExists: async () => {
        fileChecks += 1;
        if (fileChecks === 2) throw new Error("injected post-commit kill");
        return true;
      },
    });
    fixture.sqlite.exec(`
      INSERT INTO ledger_receipt_assets (
        id, journey_id, local_uri, mime_type, size_bytes, sha256,
        upload_status, ocr_status, created_at, updated_at, local_owner_user_id
      ) VALUES ('verification-receipt', 'journey-a', 'file:///receipt.jpg',
        'image/jpeg', 10, '${"c".repeat(64)}', 'PENDING', 'PENDING',
        '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z', 'user-a');
    `);
    insertOperation(fixture.sqlite, {
      id: "post-commit-kill",
      entityId: "expense-post-commit",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-10-24T01:00:00Z",
      attemptCount: 7,
    });

    await expect(fixture.coordinator.repair("MANUAL")).rejects.toThrow(
      "injected post-commit kill",
    );
    expect(operationState(fixture.sqlite, "post-commit-kill").next_attempt_at).toBeNull();
    expect(repairEvents(fixture.sqlite)).toEqual([
      expect.objectContaining({ status: "APPLIED" }),
    ]);

    const restarted = createDataHealthCoordinator({
      database: adapter(fixture.sqlite),
      getActiveAccountId: async () => "user-a",
      getAccountGeneration: () => 1,
      fileExists: async () => true,
      now: () => new Date("2026-09-24T01:00:00Z"),
    });
    await restarted.repair("MANUAL");
    expect(repairEvents(fixture.sqlite)).toEqual([
      expect.objectContaining({ status: "VERIFIED" }),
    ]);
  });

  it("retains unresolved events while bounding verified diagnostics", async () => {
    const fixture = createFixture();
    for (let index = 0; index < 205; index += 1)
      insertRepairEvent(fixture.sqlite, {
        id: `verified-${String(index).padStart(3, "0")}`,
        targetId: `old-${index}`,
        status: "VERIFIED",
        updatedAt: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
      });
    insertOperation(fixture.sqlite, {
      id: "unresolved-operation",
      entityId: "expense-unresolved",
      status: "FAILED",
      failureCategory: "UNKNOWN",
    });
    insertRepairEvent(fixture.sqlite, {
      id: "applied-unresolved",
      targetId: "unresolved-operation",
      status: "APPLIED",
      action: "REACTIVATE_RETRYABLE_OPERATION_V1",
    });
    insertRepairEvent(fixture.sqlite, {
      id: "needs-attention",
      targetId: "attention-operation",
      status: "NEEDS_ATTENTION",
    });

    await fixture.coordinator.repair("MANUAL");

    expect(
      fixture.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM data_health_repair_events WHERE status = 'VERIFIED'",
        )
        .get(),
    ).toEqual({ count: 200 });
    expect(
      fixture.sqlite
        .prepare(
          "SELECT id, status FROM data_health_repair_events WHERE id IN ('applied-unresolved', 'needs-attention') ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: "applied-unresolved", status: "APPLIED" },
      { id: "needs-attention", status: "NEEDS_ATTENTION" },
    ]);
  });
});

describe("Data Health Phase C2 convergence orchestration", () => {
  it("repairs, runs the existing sync, pulls, and reports only verified convergence", async () => {
    let fixture!: ReturnType<typeof createFixture>;
    fixture = createFixture({
      runOperationalSync: async () => {
        fixture.sqlite
          .prepare("UPDATE sync_operations SET status = 'COMPLETED' WHERE id = ?")
          .run("c2-retry");
        fixture.sqlite
          .prepare(
            `UPDATE ledger_expenses SET server_id = 'server-c2', server_revision = 1,
               sync_status = 'SYNCED' WHERE id = 'expense-c2'`,
          )
          .run();
      },
      refreshJourneyLedger: async (journeyId) => journeyId === "journey-a",
    });
    insertExpense(fixture.sqlite, { id: "expense-c2" });
    insertOperation(fixture.sqlite, {
      id: "c2-retry",
      entityId: "expense-c2",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-10-24T01:00:00Z",
      attemptCount: 7,
    });
    fixture.sqlite.exec(`
      INSERT INTO ledger_settlements (
        id, journey_id, status, through_timestamp, settlement_currency,
        settlement_scale, settings_revision, algorithm_version, input_digest,
        revision, finalized_by, finalized_at
      ) VALUES ('settlement-c2', 'journey-a', 'FINALIZED',
        '2026-09-24T00:00:00Z', 'NZD', 2, 1, 'v1', 'stable-c2', 1,
        'member-a', '2026-09-24T00:00:00Z');
    `);
    const settlementBefore = rows(fixture.sqlite, "ledger_settlements");

    const report = await fixture.coordinator.converge("MANUAL");

    expect(report.outcome).toBe("HEALTHY");
    expect(report.convergence).toEqual({
      state: "RECOVERED",
      localRepairCount: 1,
      recoveredChangeCount: 1,
      refreshedJourneyCount: 1,
      syncAttempted: true,
    });
    expect(operationState(fixture.sqlite, "c2-retry").status).toBe("COMPLETED");
    expect(rows(fixture.sqlite, "ledger_settlements")).toEqual(settlementBefore);
  });

  it("reports a local repair as waiting when connectivity disappears before convergence", async () => {
    const fixture = createFixture({
      runOperationalSync: async () => undefined,
      refreshJourneyLedger: async () => {
        throw new ApiClientError("offline", "network");
      },
    });
    insertExpense(fixture.sqlite, { id: "expense-offline" });
    insertOperation(fixture.sqlite, {
      id: "offline-retry",
      entityId: "expense-offline",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-10-24T01:00:00Z",
      attemptCount: 7,
    });

    const report = await fixture.coordinator.converge("MANUAL");

    expect(report.convergence).toMatchObject({
      state: "LOCAL_REPAIRED_WAITING",
      localRepairCount: 1,
      recoveredChangeCount: 0,
      syncAttempted: true,
    });
    expect(operationState(fixture.sqlite, "offline-retry")).toMatchObject({
      status: "RETRYABLE",
      next_attempt_at: null,
    });
  });

  it("cold-restart pull completes after a kill between push and pull", async () => {
    let fixture!: ReturnType<typeof createFixture>;
    fixture = createFixture({
      runOperationalSync: async () => {
        fixture.sqlite
          .prepare("UPDATE sync_operations SET status = 'COMPLETED' WHERE id = ?")
          .run("restart-operation");
        fixture.sqlite
          .prepare(
            `UPDATE ledger_expenses SET server_id = 'server-restart',
               server_revision = 1, sync_status = 'SYNCED'
             WHERE id = 'expense-restart'`,
          )
          .run();
      },
      refreshJourneyLedger: async () => {
        throw new Error("injected process kill");
      },
    });
    insertExpense(fixture.sqlite, { id: "expense-restart" });
    insertOperation(fixture.sqlite, {
      id: "restart-operation",
      entityId: "expense-restart",
      status: "PENDING",
      failureCategory: "NETWORK",
    });

    await expect(fixture.coordinator.converge("MANUAL")).rejects.toThrow(
      "injected process kill",
    );
    const restarted = createDataHealthCoordinator({
      database: adapter(fixture.sqlite),
      getActiveAccountId: async () => "user-a",
      getAccountGeneration: () => 1,
      fileExists: async () => true,
      runOperationalSync: async () => {
        throw new Error("converged work must not be replayed");
      },
      refreshJourneyLedger: async () => true,
      now: () => new Date("2026-09-24T01:00:00Z"),
    });

    const report = await restarted.converge("MANUAL");
    expect(report.convergence).toMatchObject({
      state: "REFRESHED",
      syncAttempted: false,
      refreshedJourneyCount: 1,
    });
  });

  it("replays idempotently after a lost response without bypassing normal due time", async () => {
    let current = new Date("2026-09-24T01:00:00Z");
    let syncRuns = 0;
    let fixture!: ReturnType<typeof createFixture>;
    fixture = createFixture({
      now: () => current,
      runOperationalSync: async () => {
        syncRuns += 1;
        if (syncRuns === 1) {
          fixture.sqlite
            .prepare(
              `UPDATE sync_operations SET status = 'RETRYABLE', attempt_count = 1,
                 failure_category = 'NETWORK', next_attempt_at = ? WHERE id = ?`,
            )
            .run("2026-09-24T01:05:00Z", "lost-response");
          return;
        }
        fixture.sqlite
          .prepare("UPDATE sync_operations SET status = 'COMPLETED' WHERE id = ?")
          .run("lost-response");
        fixture.sqlite
          .prepare(
            `UPDATE ledger_expenses SET server_id = 'server-lost-response',
               server_revision = 1, sync_status = 'SYNCED'
             WHERE id = 'expense-lost-response'`,
          )
          .run();
      },
      refreshJourneyLedger: async () => true,
    });
    insertExpense(fixture.sqlite, { id: "expense-lost-response" });
    insertOperation(fixture.sqlite, {
      id: "lost-response",
      entityId: "expense-lost-response",
      status: "PENDING",
      failureCategory: "NETWORK",
    });

    const waiting = await fixture.coordinator.converge("MANUAL");
    expect(waiting.convergence?.state).toBe("WAITING");
    expect(operationState(fixture.sqlite, "lost-response").next_attempt_at).toBe(
      "2026-09-24T01:05:00Z",
    );

    current = new Date("2026-09-24T01:06:00Z");
    const converged = await fixture.coordinator.converge("MANUAL");
    expect(converged.convergence?.state).toBe("RECOVERED");
    expect(syncRuns).toBe(2);
    expect(operationState(fixture.sqlite, "lost-response").status).toBe("COMPLETED");
  });

  it("drains deferred server state only through the existing scoped refresh", async () => {
    let fixture!: ReturnType<typeof createFixture>;
    fixture = createFixture({
      runOperationalSync: async () => {
        throw new Error("mirror refresh must not invoke mutation sync");
      },
      refreshJourneyLedger: async () => {
        fixture.sqlite
          .prepare(
            `DELETE FROM ledger_deferred_server_changes
             WHERE journey_id = 'journey-a' AND entity_id = 'server-expense'`,
          )
          .run();
        return true;
      },
    });
    fixture.sqlite.exec(`
      INSERT INTO ledger_deferred_server_changes (
        journey_id, entity_type, entity_id, revision, payload_json, created_at
      ) VALUES ('journey-a', 'EXPENSE', 'server-expense', 2, '{}',
        '2026-09-24T00:00:00Z');
    `);

    const report = await fixture.coordinator.converge("MANUAL");

    expect(report.convergence).toMatchObject({
      state: "REFRESHED",
      refreshedJourneyCount: 1,
      syncAttempted: false,
    });
    expect(rows(fixture.sqlite, "ledger_deferred_server_changes")).toEqual([]);
  });

  it("refreshes a server-newer clean active Journey without a broad sync", async () => {
    let fixture!: ReturnType<typeof createFixture>;
    fixture = createFixture({
      runOperationalSync: async () => {
        throw new Error("clean refresh must not invoke mutation sync");
      },
      refreshJourneyLedger: async () => {
        insertExpense(fixture.sqlite, {
          id: "server-newer",
          serverId: "server-newer",
          serverRevision: 2,
          syncStatus: "SYNCED",
        });
        return true;
      },
    });

    const report = await fixture.coordinator.converge("MANUAL");

    expect(report.convergence?.state).toBe("REFRESHED");
    expect(report.findings).toEqual([]);
    expect(rows(fixture.sqlite, "ledger_expenses")).toHaveLength(1);
  });

  it("aborts remaining network work after an account generation change", async () => {
    let accountId = "user-a";
    let generation = 1;
    let pullCount = 0;
    const fixture = createFixture({
      getActiveAccountId: async () => accountId,
      getAccountGeneration: () => generation,
      runOperationalSync: async () => {
        accountId = "user-b";
        generation = 2;
      },
      refreshJourneyLedger: async () => {
        pullCount += 1;
        return true;
      },
    });
    insertOperation(fixture.sqlite, {
      id: "switch-operation",
      entityId: "expense-switch",
      status: "PENDING",
      failureCategory: "NETWORK",
    });

    const report = await fixture.coordinator.converge("MANUAL");

    expect(report.accountId).toBe("user-b");
    expect(report.generation).toBe(2);
    expect(report.convergence?.state).toBe("PROTECTED");
    expect(pullCount).toBe(0);
    expect(operationState(fixture.sqlite, "switch-operation").status).toBe("PENDING");
  });

  it("does not bypass auth pause and keeps the affected scope waiting", async () => {
    let fixture!: ReturnType<typeof createFixture>;
    let pullCount = 0;
    fixture = createFixture({
      runOperationalSync: async () => {
        fixture.sqlite
          .prepare(
            `UPDATE sync_operations SET status = 'PENDING', failure_category = 'AUTH',
               last_error_code = 'AUTH_PAUSED' WHERE id = 'auth-operation'`,
          )
          .run();
      },
      refreshJourneyLedger: async () => {
        pullCount += 1;
        return true;
      },
    });
    insertOperation(fixture.sqlite, {
      id: "auth-operation",
      entityId: "expense-auth-c2",
      status: "PENDING",
      failureCategory: "NETWORK",
    });

    const report = await fixture.coordinator.converge("MANUAL");

    expect(report.counts.AUTH_PAUSED).toBe(1);
    expect(report.convergence?.state).toBe("WAITING");
    expect(pullCount).toBe(0);
  });

  it("keeps protected historical intent unchanged during scoped refresh", async () => {
    const fixture = createFixture({
      runOperationalSync: async () => {
        throw new Error("protected work must not be executed");
      },
      refreshJourneyLedger: async () => true,
    });
    insertExpense(fixture.sqlite, {
      id: "guard-915-expense",
      revision: 6,
      syncStatus: "FAILED",
    });
    insertOperation(fixture.sqlite, {
      id: "guard-915-create",
      entityId: "guard-915-expense",
      operationType: "CREATE_LEDGER_EXPENSE",
      status: "FAILED",
      failureCategory: "UNKNOWN",
    });
    for (let index = 1; index <= 5; index += 1)
      insertOperation(fixture.sqlite, {
        id: `guard-915-update-${index}`,
        entityId: "guard-915-expense",
        status: "FAILED",
        failureCategory: "UNKNOWN",
        dependencyOperationId: "guard-915-create",
      });
    const before = domainFingerprint(fixture.sqlite);

    const report = await fixture.coordinator.converge("MANUAL");

    expect(report.convergence).toMatchObject({
      state: "PROTECTED",
      recoveredChangeCount: 0,
      syncAttempted: false,
    });
    expect(domainFingerprint(fixture.sqlite)).toBe(before);
  });

  it("repeated converged runs are stable and never invoke mutation sync", async () => {
    let syncCount = 0;
    const fixture = createFixture({
      runOperationalSync: async () => {
        syncCount += 1;
      },
      refreshJourneyLedger: async () => false,
    });
    const before = domainFingerprint(fixture.sqlite);

    const first = await fixture.coordinator.converge("MANUAL");
    const second = await fixture.coordinator.converge("MANUAL");

    expect(first.convergence?.state).toBe("UP_TO_DATE");
    expect(second.convergence).toEqual(first.convergence);
    expect(second.reportDigest).toBe(first.reportDigest);
    expect(syncCount).toBe(0);
    expect(domainFingerprint(fixture.sqlite)).toBe(before);
  });

  it("plans a healthy cold start as one cheap local scan with no scopes", async () => {
    const fixture = createFixture();

    const cold = await fixture.coordinator.planAutomaticRun({
      trigger: "COLD_START",
    });
    expect(cold).toMatchObject({
      shouldRun: true,
      trigger: "CHEAP",
      hasSuspiciousState: false,
      hasConvergenceWork: false,
      journeyIds: [],
    });

    await fixture.coordinator.run("CHEAP", { journeyIds: cold.journeyIds });
    await expect(
      fixture.coordinator.planAutomaticRun({ trigger: "FOREGROUND" }),
    ).resolves.toMatchObject({ shouldRun: false });
  });

  it("selects only suspicious scopes for automatic recovery", async () => {
    const fixture = createFixture();
    fixture.sqlite.exec(`
      INSERT INTO ledger_journeys (
        journey_id, settlement_currency, settlement_scale, valuation_policy,
        updated_at, title
      ) VALUES ('journey-b', 'NZD', 2, 'REFERENCE',
        '2026-09-23T00:00:00Z', 'B');
      INSERT INTO ledger_actor_context (
        user_id, journey_id, member_id, role, capabilities_json, updated_at
      ) VALUES ('user-a', 'journey-b', 'member-a', 'owner', '{}',
        '2026-09-23T00:00:00Z');
      INSERT INTO ledger_sync_cursors (user_id, journey_id, cursor, updated_at)
      VALUES ('user-a', 'journey-b', '', '2026-09-24T00:00:00Z');
    `);

    const plan = await fixture.coordinator.planAutomaticRun({
      trigger: "CONNECTIVITY_RESTORED",
    });
    expect(plan).toMatchObject({
      shouldRun: true,
      hasSuspiciousState: true,
      hasConvergenceWork: true,
      journeyIds: ["journey-b"],
    });

    const scoped = await fixture.coordinator.run("CHEAP", {
      journeyIds: ["journey-a"],
    });
    expect(scoped.findings).toEqual([]);
  });

  it("reconsiders due convergence work on foreground within the cheap-scan window", async () => {
    const fixture = createFixture();
    await fixture.coordinator.run("CHEAP", { journeyIds: [] });
    insertOperation(fixture.sqlite, {
      id: "due-after-offline",
      entityId: "expense-due-after-offline",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-09-24T00:59:00Z",
    });

    await expect(
      fixture.coordinator.planAutomaticRun({ trigger: "FOREGROUND" }),
    ).resolves.toMatchObject({
      shouldRun: true,
      trigger: "CHEAP",
      hasConvergenceWork: true,
      journeyIds: ["journey-a"],
    });
  });

  it("detects expired leases and completed dependencies for existing C1 actions", async () => {
    const fixture = createFixture();
    insertOperation(fixture.sqlite, {
      id: "expired",
      entityId: "expense-expired",
      status: "PROCESSING",
      leaseExpiresAt: "2026-09-24T00:00:00Z",
      claimOwner: "dead-process",
    });
    insertOperation(fixture.sqlite, {
      id: "parent",
      entityId: "expense-dependent",
      operationType: "CREATE_LEDGER_EXPENSE",
      status: "COMPLETED",
    });
    insertExpense(fixture.sqlite, {
      id: "expense-dependent",
      serverId: "server-expense-dependent",
      serverRevision: 1,
      syncStatus: "SYNCED",
    });
    insertOperation(fixture.sqlite, {
      id: "dependent",
      entityId: "expense-dependent",
      status: "DEPENDENCY_BLOCKED",
      failureCategory: "DEPENDENCY",
      dependencyOperationId: "parent",
    });

    const automatic = await fixture.coordinator.planAutomaticRun({
      trigger: "COLD_START",
    });
    expect(automatic).toMatchObject({
      hasSuspiciousState: true,
      hasConvergenceWork: true,
      journeyIds: ["journey-a"],
    });
    const scan = await fixture.coordinator.run("CHEAP", {
      journeyIds: automatic.journeyIds,
    });
    expect(
      scan.repairPlans
        .filter((item) => item.eligibility === "ELIGIBLE")
        .map((item) => item.actionId),
    ).toEqual(
      expect.arrayContaining([
        "RECOVER_EXPIRED_OPERATION_LEASE_V1",
        "WAKE_COMPLETED_OPERATION_DEPENDENCY_V1",
      ]),
    );
  });

  it("reconsiders a future sparse retry only in the daily deep window", async () => {
    const fixture = createFixture();
    insertOperation(fixture.sqlite, {
      id: "sparse",
      entityId: "expense-sparse",
      status: "RETRYABLE",
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-09-25T01:00:00Z",
      attemptCount: 7,
    });
    fixture.sqlite.exec(`
      INSERT INTO data_health_state (
        account_id, last_cheap_scan_at, last_deep_scan_at, run_generation,
        run_state, updated_at
      ) VALUES ('user-a', '2026-09-23T00:00:00Z', '2026-09-23T00:00:00Z',
        1, 'COMPLETED', '2026-09-23T00:00:00Z');
    `);

    const deep = await fixture.coordinator.planAutomaticRun({ trigger: "FOREGROUND" });
    expect(deep).toMatchObject({
      shouldRun: true,
      trigger: "DEEP",
      hasConvergenceWork: true,
    });

    await fixture.coordinator.repair("CHEAP", { journeyIds: ["journey-a"] });
    expect(operationState(fixture.sqlite, "sparse").next_attempt_at).not.toBeNull();
    await fixture.coordinator.repair("DEEP", { journeyIds: ["journey-a"] });
    expect(operationState(fixture.sqlite, "sparse").next_attempt_at).toBeNull();
  });

  it("resumes interrupted automatic state and keeps historical FAILED intent protected", async () => {
    const fixture = createFixture();
    insertExpense(fixture.sqlite, {
      id: "guard-like-expense",
      revision: 6,
      syncStatus: "FAILED",
    });
    insertOperation(fixture.sqlite, {
      id: "guard-like-create",
      entityId: "guard-like-expense",
      operationType: "CREATE_LEDGER_EXPENSE",
      status: "FAILED",
      failureCategory: "UNKNOWN",
    });
    fixture.sqlite.exec(`
      INSERT INTO data_health_state (
        account_id, last_cheap_scan_at, run_generation, run_state, updated_at
      ) VALUES ('user-a', '2026-09-24T01:00:00Z', 1, 'RUNNING',
        '2026-09-24T01:00:00Z');
    `);
    const before = domainFingerprint(fixture.sqlite);

    const plan = await fixture.coordinator.planAutomaticRun({ trigger: "FOREGROUND" });
    expect(plan).toMatchObject({
      shouldRun: true,
      interrupted: true,
      hasConvergenceWork: false,
    });
    const scan = await fixture.coordinator.run("CHEAP", {
      journeyIds: plan.journeyIds,
    });
    expect(scan.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: "guard-like-create",
          category: "PROTECTED_LOCAL",
        }),
      ]),
    );
    expect(
      scan.repairPlans.find((item) => item.targetId === "guard-like-create"),
    ).toMatchObject({ eligibility: "INELIGIBLE", actionId: null });
    expect(domainFingerprint(fixture.sqlite)).toBe(before);
  });
});

function createFixture(
  overrides: Partial<DataHealthDependencies> = {},
  hooks: { beforeTransaction?(count: number, sqlite: DatabaseSync): void } = {},
) {
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
  const database = adapter(sqlite, hooks);
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

function adapter(
  sqlite: DatabaseSync,
  hooks: { beforeTransaction?(count: number, sqlite: DatabaseSync): void } = {},
) {
  let transactionCount = 0;
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
      transactionCount += 1;
      hooks.beforeTransaction?.(transactionCount, sqlite);
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
    serverId?: string;
  },
) {
  sqlite
    .prepare(
      `INSERT INTO ledger_expenses (
        id, journey_id, payer_member_id, title, category, occurred_at,
        original_amount_minor, original_currency, original_scale, business_status,
        revision, server_id, server_revision, sync_status, created_at, updated_at,
        local_owner_user_id
      ) VALUES (?, 'journey-a', 'member-a', 'Expense', 'other',
        '2026-09-24T00:00:00Z', 100, 'USD', 2, 'ACCEPTED', ?, ?, ?, ?,
        '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z', 'user-a')`,
    )
    .run(
      input.id,
      input.revision ?? 1,
      input.serverId ?? null,
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
    nextAttemptAt?: string;
    leaseExpiresAt?: string;
    attemptCount?: number;
    claimOwner?: string;
  },
) {
  sqlite
    .prepare(
      `INSERT INTO sync_operations (
        id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
        payload_json, status, owner_user_id, failure_category, last_error_code,
        dependency_operation_id, next_attempt_at, lease_expires_at, attempt_count,
        claim_owner, created_at, updated_at
      ) VALUES (?, ?, 'ledger_expense', ?, ?, ?, '{}', ?, 'user-a', ?, ?, ?, ?, ?, ?, ?,
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
      input.nextAttemptAt ?? null,
      input.leaseExpiresAt ?? null,
      input.attemptCount ?? 0,
      input.claimOwner ?? null,
    );
}

function queueFingerprint(sqlite: DatabaseSync) {
  return JSON.stringify([
    rows(sqlite, "sync_operations"),
    rows(sqlite, "ledger_asset_operations"),
  ]);
}

function operationState(sqlite: DatabaseSync, id: string) {
  return sqlite
    .prepare(
      `SELECT status, attempt_count, next_attempt_at, dependency_operation_id,
         claim_owner, lease_expires_at
       FROM sync_operations WHERE id = ?`,
    )
    .get(id) as Record<string, string | number | null>;
}

function repairEvents(sqlite: DatabaseSync) {
  return sqlite
    .prepare(
      `SELECT action, status, affected_count
       FROM data_health_repair_events ORDER BY created_at, id`,
    )
    .all() as Record<string, string | number | null>[];
}

function insertRepairEvent(
  sqlite: DatabaseSync,
  input: {
    id: string;
    targetId: string;
    status: "APPLIED" | "VERIFIED" | "NEEDS_ATTENTION";
    action?: string;
    updatedAt?: string;
  },
) {
  const timestamp = input.updatedAt ?? "2026-09-24T00:00:00Z";
  sqlite
    .prepare(
      `INSERT INTO data_health_repair_events (
         id, account_id, journey_id, rule_id, target_type, target_id,
         input_digest, action, status, affected_count, created_at, updated_at,
         verified_at
       ) VALUES (?, 'user-a', 'journey-a', 'DH_SYNC_OPERATION_STATE_V1',
         'sync_operation', ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.targetId,
      `digest-${input.id}`,
      input.action ?? "REACTIVATE_RETRYABLE_OPERATION_V1",
      input.status,
      timestamp,
      timestamp,
      input.status === "VERIFIED" ? timestamp : null,
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

function userDomainFingerprint(sqlite: DatabaseSync) {
  return JSON.stringify(
    [
      "ledger_expenses",
      "ledger_personal_payment_records",
      "ledger_receipt_assets",
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
