import { createLedgerReadRepository } from "./ledgerReadRepository";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

import { migrations } from "@/data/db/migrations";
import { createLedgerExpenseSyncWorker } from "@/data/sync/ledgerExpenseSyncWorker";
import { createSyncEngine, SyncConflictError } from "@/data/sync/syncEngine";
import { createSyncOperationRepository } from "@/data/sync/syncOperationRepository";

import {
  createLedgerExpenseRepository,
  type LedgerExpenseCommand,
  type LedgerExpenseDatabase,
} from "./ledgerExpenseRepository";

import { ApiClientError } from "@/data/api/client";
import { createLedgerCollaborationRepository } from "./ledgerCollaborationRepository";
import { expenseCommandRequestSchema } from "@/data/api/ledgerMutationContracts";
import { createLedgerExpenseConflictRepository } from "./ledgerExpenseConflictRepository";
import type { ExpenseConflictChainResponse } from "@/data/api/ledgerMutationContracts";
import {
  canonicalConflictLines,
  conflictChoices,
  conflictIntentLines,
  resolutionStatus,
} from "@/features/ledger/expenseConflictPresentation";

vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/db/database", () => ({ openDatabase: vi.fn() }));
vi.mock("@/data/sync/ledgerExpenseMutationTransport", () => ({
  createLedgerExpenseMutationTransport: vi.fn(),
}));

vi.mock("@/data/sync/ledgerQueueActivity", () => ({
  announceLedgerQueueWorkAvailable: vi.fn(),
}));

const journeyId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations) sqlite.exec(migration.sql);
  sqlite
    .prepare(
      `INSERT INTO ledger_actor_context
       (user_id, journey_id, member_id, role, capabilities_json, updated_at)
       VALUES (?, ?, ?, 'owner', '{}', '2026-09-24T00:00:00Z')`,
    )
    .run(userId, journeyId, memberId);
  const api = {
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
    async runAsync(sql: string, ...args: unknown[]) {
      const result = sqlite.prepare(sql).run(...(args as never[]));
      return { changes: Number(result.changes) } as never;
    },
    async getFirstAsync<T>(sql: string, ...args: unknown[]) {
      return (sqlite.prepare(sql).get(...(args as never[])) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...args: unknown[]) {
      return sqlite.prepare(sql).all(...(args as never[])) as T[];
    },
  } satisfies LedgerExpenseDatabase;
  return { sqlite, api };
}

function command(title: string): LedgerExpenseCommand {
  return {
    journeyId,
    creatorMemberId: memberId,
    payerMemberId: memberId,
    title,
    category: "food",
    occurredAt: "2026-09-24T10:00:00Z",
    economicDate: "2026-09-24",
    original: { minor: 100, currency: "NZD", scale: 2 },
    participants: [{ memberId, displayNameSnapshot: "A", householdIdSnapshot: null }],
    splits: [
      {
        memberId,
        method: "EQUAL_PERSON",
        originalMinor: 100,
        settlementMinor: 100,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: {
      id: "40000000-0000-4000-8000-000000000001",
      policy: "SAME_CURRENCY",
      original: { minor: 100, currency: "NZD", scale: 2 },
      settlement: { minor: 100, currency: "NZD", scale: 2 },
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
    },
    status: "ACCEPTED",
  };
}

describe("Ledger Expense causal queue", () => {
  it("coalesces multiple edits into an unattempted CREATE", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const created = await repository.createExpense(command("original"));
    await repository.updateExpense(created.id, command("edit one"), "edit");
    await repository.updateExpense(created.id, command("edit two"), "edit");

    const rows = sqlite
      .prepare(
        `SELECT operation_type, status, attempt_count, payload_json
         FROM sync_operations WHERE entity_id = ? AND status <> 'COMPLETED'`,
      )
      .all(created.id) as Record<string, string | number>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operation_type: "LEDGER_CREATE_EXPENSE",
      status: "PENDING",
      attempt_count: 0,
    });
    expect(JSON.parse(String(rows[0]!.payload_json)).expense.title).toBe("edit two");
    expect((await repository.getExpense(created.id))?.syncStatus).toBe("PENDING_CREATE");
    sqlite.close();
  });

  it("replays an attempted CREATE unchanged then sends one compacted UPDATE", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const created = await repository.createExpense(command("original"));
    const original = sqlite
      .prepare(
        "SELECT id, idempotency_key, payload_json FROM sync_operations WHERE entity_id = ?",
      )
      .get(created.id) as { id: string; idempotency_key: string; payload_json: string };
    sqlite
      .prepare(
        `UPDATE sync_operations SET status = 'RETRYABLE', attempt_count = 1,
         next_attempt_at = NULL WHERE id = ?`,
      )
      .run(original.id);
    await repository.updateExpense(created.id, command("edit one"), "edit");
    await repository.updateExpense(created.id, command("edit two"), "edit");

    const queued = sqlite
      .prepare(
        `SELECT id, operation_type, idempotency_key, status, attempt_count,
          dependency_operation_id, payload_json
         FROM sync_operations WHERE entity_id = ? ORDER BY rowid`,
      )
      .all(created.id) as Record<string, string | number | null>[];
    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({
      id: original.id,
      idempotency_key: original.idempotency_key,
      status: "RETRYABLE",
      attempt_count: 1,
    });
    expect(queued[0]!.payload_json).toBe(original.payload_json);
    expect(queued[1]).toMatchObject({
      operation_type: "LEDGER_UPDATE_EXPENSE",
      status: "DEPENDENCY_BLOCKED",
      attempt_count: 0,
      dependency_operation_id: original.id,
    });
    expect(JSON.parse(String(queued[1]!.payload_json)).expense.title).toBe("edit two");

    const canonical = (title: string, revision: number) => {
      const value = command(title);
      return {
        ...value,
        id: "50000000-0000-4000-8000-000000000001",
        revision,
        description: null,
        businessStatus: value.status,
        settlementParticipation: "INCLUDED" as const,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        deletedAt: null,
        paymentRecords: [],
        auditEvents: [],
      };
    };
    const createExpense = vi.fn(async () => ({
      serverId: "50000000-0000-4000-8000-000000000001",
      revision: 1,
      entity: canonical("original", 1),
    }));
    const updateExpense = vi.fn(async () => ({
      serverId: "50000000-0000-4000-8000-000000000001",
      revision: 2,
      entity: canonical("edit two", 2),
    }));
    await createSyncEngine(
      createSyncOperationRepository(api, async () => userId),
      createLedgerExpenseSyncWorker(repository, {
        createExpense,
        updateExpense,
        deleteExpense: vi.fn(),
        restoreExpense: vi.fn(),
      }),
    ).run("AUTHENTICATED_ONLINE");

    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: original.idempotency_key,
        expense: expect.objectContaining({ title: "original" }),
      }),
    );
    expect(updateExpense).toHaveBeenCalledOnce();
    expect(updateExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        baseRevision: 1,
        expense: expect.objectContaining({ title: "edit two" }),
      }),
    );
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM sync_operations WHERE entity_id = ? AND status <> 'COMPLETED'",
        )
        .get(created.id),
    ).toEqual({ count: 0 });
    expect(await repository.getExpense(created.id)).toMatchObject({
      title: "edit two",
      serverRevision: 2,
      syncStatus: "SYNCED",
    });
    sqlite.close();
  });

  it("does not send or burn attempts for a dependency-blocked edit after restart", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const created = await repository.createExpense(command("original"));
    sqlite
      .prepare(
        `UPDATE sync_operations SET status = 'RETRYABLE', attempt_count = 1,
         next_attempt_at = '2099-01-01T00:00:00Z' WHERE entity_id = ?`,
      )
      .run(created.id);
    await repository.updateExpense(created.id, command("offline edit"), "edit");
    const createExpense = vi.fn();
    const updateExpense = vi.fn();

    await createSyncEngine(
      createSyncOperationRepository(api, async () => userId),
      createLedgerExpenseSyncWorker(
        createLedgerExpenseRepository(api, async () => userId),
        {
          createExpense,
          updateExpense,
          deleteExpense: vi.fn(),
          restoreExpense: vi.fn(),
        },
      ),
    ).run("AUTHENTICATED_ONLINE");

    expect(createExpense).not.toHaveBeenCalled();
    expect(updateExpense).not.toHaveBeenCalled();
    expect(
      sqlite
        .prepare(
          `SELECT status, attempt_count FROM sync_operations
           WHERE entity_id = ? AND operation_type = 'LEDGER_UPDATE_EXPENSE'`,
        )
        .get(created.id),
    ).toEqual({ status: "DEPENDENCY_BLOCKED", attempt_count: 0 });
    sqlite.close();
  });

  it("blocks delete and restore behind an unfinished CREATE", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const created = await repository.createExpense(command("delete restore"));
    sqlite
      .prepare(
        `UPDATE sync_operations SET status = 'RETRYABLE', attempt_count = 1,
         next_attempt_at = '2099-01-01T00:00:00Z' WHERE entity_id = ?`,
      )
      .run(created.id);
    await repository.tombstoneExpense(created.id, "delete");
    await repository.restoreExpense(created.id, "ACCEPTED", "restore");

    expect(
      sqlite
        .prepare(
          `SELECT operation_type, status, attempt_count, dependency_operation_id
           FROM sync_operations WHERE entity_id = ? AND operation_type <> 'LEDGER_CREATE_EXPENSE'
           ORDER BY rowid`,
        )
        .all(created.id),
    ).toEqual([
      {
        operation_type: "LEDGER_DELETE_EXPENSE",
        status: "DEPENDENCY_BLOCKED",
        attempt_count: 0,
        dependency_operation_id: expect.any(String),
      },
      {
        operation_type: "LEDGER_RESTORE_EXPENSE",
        status: "DEPENDENCY_BLOCKED",
        attempt_count: 0,
        dependency_operation_id: expect.any(String),
      },
    ]);
    sqlite.close();
  });

  it("preserves a plain unknown failure as retryable structured diagnostics", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const created = await repository.createExpense(command("unknown failure"));
    await createSyncEngine(
      createSyncOperationRepository(api, async () => userId),
      createLedgerExpenseSyncWorker(repository, {
        createExpense: vi.fn(async () => {
          throw new Error("safe ambiguous response");
        }),
        updateExpense: vi.fn(),
        deleteExpense: vi.fn(),
        restoreExpense: vi.fn(),
      }),
      () => "2099-01-01T00:00:00Z",
    ).run("AUTHENTICATED_ONLINE");

    expect(
      sqlite
        .prepare(
          `SELECT status, attempt_count, failure_category, last_error_code,
            last_error_message, first_failed_at, last_attempt_at
           FROM sync_operations WHERE entity_id = ?`,
        )
        .get(created.id),
    ).toMatchObject({
      status: "RETRYABLE",
      attempt_count: 1,
      failure_category: "UNKNOWN",
      last_error_code: "SYNC_FAILED",
      last_error_message: "safe ambiguous response",
    });
    expect((await repository.getExpense(created.id))?.syncStatus).toBe("PENDING_CREATE");
    sqlite.close();
  });
});

it("locks an explicitly accepted cached rate once and rejects stale or differently rounded acceptance", async () => {
  const { sqlite, api } = database();
  sqlite
    .prepare(
      "INSERT INTO ledger_journeys (journey_id, settlement_currency, settlement_scale, valuation_policy, updated_at) VALUES (?, 'NZD', 2, 'REFERENCE_RATE', '2026-09-28')",
    )
    .run(journeyId);
  const repository = createLedgerExpenseRepository(api, async () => userId);
  const draft = command("JPY");
  draft.original = { minor: 685, currency: "JPY", scale: 0 };
  draft.economicDate = "2026-09-28";
  draft.valuation = null;
  draft.status = "RATE_REQUIRED";
  draft.splits = draft.splits.map((split) => ({
    ...split,
    originalMinor: 685,
    settlementMinor: null,
  }));
  const expense = await repository.createExpense(draft);
  await repository.markExpenseSynced(
    expense.id,
    "50000000-0000-4000-8000-000000000001",
    1,
  );
  const input = {
    policy: "MANUAL_AGREED" as const,
    manualRate: "0.01119",
    reason: "Accepted ECB reference date 2026-09-25",
    expectedRevision: expense.revision,
    expectedSettlement: { minor: 767, currency: "NZD", scale: 2 },
    rateAcceptance: {
      revision: expense.revision,
      serverRevision: 1,
      original: draft.original,
      economicDate: "2026-09-28",
      settlement: { minor: 767, currency: "NZD", scale: 2 },
      decimalRate: "0.01119",
      referenceDate: "2026-09-25",
    },
  };
  await expect(
    repository.applyValuation(expense.id, { ...input, expectedRevision: 0 }),
  ).rejects.toThrow("Expense changed");
  await expect(
    repository.applyValuation(expense.id, {
      ...input,
      expectedSettlement: { ...input.expectedSettlement, minor: 768 },
    }),
  ).rejects.toThrow("Journey value changed");
  await expect(
    repository.applyValuation(expense.id, {
      ...input,
      rateAcceptance: { ...input.rateAcceptance, economicDate: "2026-09-27" },
    }),
  ).rejects.toThrow("Expense or Journey value changed");
  const accepted = await repository.applyValuation(expense.id, input);
  expect(
    JSON.parse(
      String(
        sqlite
          .prepare("SELECT intent_json FROM ledger_expense_commands WHERE operation_id=?")
          .get(accepted.operationResult!.operationId)!.intent_json,
      ),
    ).valuation.rateAcceptance,
  ).toEqual(input.rateAcceptance);
  expect(accepted).toMatchObject({
    status: "ACCEPTED",
    syncStatus: "PENDING_UPDATE",
    valuation: {
      policy: "MANUAL_AGREED",
      decimalRate: "0.01119",
      settlement: { minor: 767 },
      reason: input.reason,
    },
  });
  await expect(repository.applyValuation(expense.id, input)).rejects.toThrow(
    "Expense changed",
  );
  expect(
    sqlite
      .prepare(
        "SELECT count(*) AS n FROM ledger_valuation_snapshots WHERE expense_id=? AND is_active=1",
      )
      .get(expense.id)?.n,
  ).toBe(1);
  expect(
    sqlite
      .prepare(
        "SELECT payload_json FROM sync_operations WHERE entity_id=? AND operation_type='LEDGER_APPLY_VALUATION'",
      )
      .get(expense.id)?.payload_json,
  ).toContain("0.01119");
  const interrupted = await repository.createExpense({
    ...draft,
    title: "Interrupted rate",
  });
  await repository.markExpenseSynced(
    interrupted.id,
    "50000000-0000-4000-8000-000000000002",
    1,
  );
  const execute = api.runAsync;
  api.runAsync = async (sql, ...params) => {
    const result = await execute(sql, ...params);
    if (sql.includes("INSERT INTO ledger_expense_commands")) advanceAccountGeneration();
    return result;
  };
  await expect(
    repository.applyValuation(interrupted.id, {
      ...input,
      expectedRevision: interrupted.revision,
      rateAcceptance: { ...input.rateAcceptance, revision: interrupted.revision },
    }),
  ).rejects.toThrow("Account changed");
  expect((await repository.getExpense(interrupted.id))?.valuation).toBeNull();
  expect(operationIds(sqlite, interrupted.id)).toHaveLength(1);
  sqlite.close();
});

function serverExpense(title: string, revision: number, deleted = false) {
  const value = command(title);
  return {
    ...value,
    id: "50000000-0000-4000-8000-000000000001",
    revision,
    description: null,
    businessStatus: deleted ? ("DELETED" as const) : value.status,
    settlementParticipation: "INCLUDED" as const,
    createdAt: "2026-09-24T10:00:00Z",
    updatedAt: "2026-09-24T10:00:01Z",
    deletedAt: deleted ? "2026-09-24T10:00:01Z" : null,
    paymentRecords: [],
    auditEvents: [],
  };
}
function operationIds(sqlite: DatabaseSync, expenseId: string) {
  return (
    sqlite
      .prepare("SELECT id FROM sync_operations WHERE entity_id = ? ORDER BY rowid")
      .all(expenseId) as { id: string }[]
  ).map((row) => row.id);
}

describe("Formal typed Expense transport and resolution", () => {
  it("binds new commands once to verified causal proof and preserves attempted legacy bodies", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const queue = createSyncOperationRepository(api, async () => userId);
    const created = await repository.createExpense(command("original"));
    const [create] = await queue.listPending();
    const bound = await repository.bindOperation(create!, true);
    const wire = expenseCommandRequestSchema.parse(JSON.parse(bound.payloadJson));
    expect(wire.envelope).toMatchObject({
      commandId: create!.id,
      observedServerRevision: 0,
      observedBase: null,
      patchOrIntent: { type: "CREATE" },
    });
    await repository.confirmExpenseOperation(create!.id, serverExpense("original", 1));
    const edited = await repository.updateExpense(
      created.id,
      command("local title"),
      "change title",
    );
    const update = (await queue.listPending()).find(
      (op) => op.id === edited.operationResult?.operationId,
    )!;
    const typed = await repository.bindOperation(update, true);
    expect(JSON.parse(typed.payloadJson).envelope).toMatchObject({
      predecessorOperationId: create!.id,
      causalBaseReceipt: { operationId: create!.id, disposition: "APPLIED" },
      patchOrIntent: { type: "UPDATE", patch: { descriptive: { title: "local title" } } },
    });
    await repository.reconcileCanonicalExpense(
      created.id,
      serverExpense("newer shared", 2),
    );
    expect((await repository.bindOperation(update, true)).payloadJson).toBe(
      typed.payloadJson,
    );
    const later = await repository.updateExpense(
      created.id,
      command("another title"),
      "later",
    );
    sqlite
      .prepare("UPDATE sync_operations SET attempt_count=1 WHERE id=?")
      .run(later.operationResult!.operationId);
    const historical = sqlite
      .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
      .get(later.operationResult!.operationId)!.payload_json;
    // Parent receipt is required before binding, including historical fallback.
    await repository.confirmExpenseOperation(update.id, serverExpense("local title", 3));
    const legacy = (await queue.listPending()).find(
      (op) => op.id === later.operationResult!.operationId,
    )!;
    expect((await repository.bindOperation(legacy, true)).payloadJson).toBe(historical);
    sqlite.close();
  });

  it("stores typed DELETE conflict without guessing an editable UPDATE and closes covered commands atomically", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const collaboration = createLedgerCollaborationRepository(api, async () => userId);
    const queue = createSyncOperationRepository(api, async () => userId);
    const created = await repository.createExpense(command("original"));
    const createId = created.operationResult!.operationId!;
    await repository.confirmExpenseOperation(createId, serverExpense("original", 1));
    const deletion = await repository.tombstoneExpense(created.id, "delete");
    const operation = (await queue.listPending()).find(
      (op) => op.id === deletion.operationId,
    )!;
    const bound = await repository.bindOperation(operation, true);
    const envelope = JSON.parse(bound.payloadJson).envelope;
    const conflictId = "60000000-0000-4000-8000-000000000001";
    const uncoveredId = "60000000-0000-4000-8000-000000000002";
    await collaboration.recordConflict(created.id, operation, {
      error: {
        code: "REVISION_CONFLICT",
        conflictId,
        expenseId: serverExpense("", 1).id,
        commandId: operation.id,
        commandType: "DELETE",
        submittedIntent: { type: "DELETE" },
        envelope,
        baseRevision: 1,
        currentRevision: 2,
        current: serverExpense("newer server", 2),
        changedGroups: ["LIFECYCLE"],
      },
    });
    expect(
      JSON.parse(
        String(
          sqlite
            .prepare(
              "SELECT submitted_snapshot_json FROM ledger_expense_conflicts WHERE conflict_id=?",
            )
            .get(conflictId)!.submitted_snapshot_json,
        ),
      ),
    ).toEqual({ type: "DELETE" });
    const restore = await repository.restoreExpense(
      created.id,
      "ACCEPTED",
      "restore after deletion",
    );
    sqlite
      .prepare(
        "INSERT INTO ledger_expense_conflicts SELECT ?,journey_id,expense_id,'remote-only',base_revision,current_revision,base_snapshot_json,submitted_snapshot_json,canonical_snapshot_json,changed_groups_json,audit_summaries_json,'OPEN',created_at,NULL FROM ledger_expense_conflicts WHERE conflict_id=?",
      )
      .run(uncoveredId, conflictId);
    const input = {
      contractVersion: 2,
      commandId: operation.id,
      intentType: "DELETE",
      submittedIntent: { type: "DELETE" },
      observedBaseRevision: 1,
      currentServerRevision: 2,
      coveredConflictIds: [conflictId],
      expectedChainDigest: "a".repeat(64),
      choice: "CONFIRM_DELETE",
      reason: "Confirm deletion",
    };
    const resolutionId = "resolution-operation";
    sqlite
      .prepare(
        "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,owner_user_id,status,created_at,updated_at) VALUES(?,?,'ledger_expense',?,'LEDGER_RESOLVE_EXPENSE_CONFLICT','resolution-key',2,?,?,'PENDING','2026-09-29','2026-09-29')",
      )
      .run(resolutionId, journeyId, created.id, JSON.stringify(input), userId);
    const canonical = serverExpense("newer server", 3, true);
    const operationReceipt = {
      operationId: operation.id,
      commandId: operation.id,
      idempotencyKey: operation.idempotencyKey,
      expenseId: canonical.id,
      commandType: "DELETE" as const,
      intentSequence: envelope.intentSequence,
      disposition: "APPLIED" as const,
      canonicalRevision: 3,
    };
    const response = {
      resolutionReceipt: { ...operationReceipt, idempotencyKey: "resolution-key" },
      canonical,
      openConflictIds: [uncoveredId],
      conflictOutcomes: [
        {
          conflictId,
          lifecycle: "RESOLVED" as const,
          reason: "Confirmed",
          supersededByCommandId: operation.id,
          operationReceipt,
        },
        {
          conflictId: uncoveredId,
          lifecycle: "OPEN" as const,
          reason: "Uncovered",
          supersededByCommandId: null,
          operationReceipt: null,
        },
      ],
    };
    await expect(
      repository.confirmConflictResolution(resolutionId, {
        ...response,
        conflictOutcomes: response.conflictOutcomes.map((outcome) => ({
          ...outcome,
          operationReceipt: null,
        })),
      }),
    ).rejects.toThrow("missing its server receipt");
    sqlite.exec(
      "CREATE TRIGGER reject_resolution_projection BEFORE UPDATE ON ledger_expenses BEGIN SELECT RAISE(ABORT,'resolution projection failure'); END;",
    );
    await expect(
      repository.confirmConflictResolution(resolutionId, response),
    ).rejects.toThrow("resolution projection failure");
    expect(
      sqlite.prepare("SELECT * FROM ledger_expense_resolution_receipts").all(),
    ).toHaveLength(0);
    expect(
      sqlite
        .prepare("SELECT status FROM ledger_expense_conflicts WHERE conflict_id=?")
        .get(conflictId)!.status,
    ).toBe("OPEN");
    sqlite.exec("DROP TRIGGER reject_resolution_projection");
    await repository.confirmConflictResolution(resolutionId, response);
    await repository.confirmConflictResolution(resolutionId, response);
    expect(
      sqlite.prepare("SELECT * FROM ledger_expense_resolution_receipts").all(),
    ).toHaveLength(1);
    expect(
      sqlite
        .prepare("SELECT status FROM ledger_expense_conflicts WHERE conflict_id=?")
        .get(uncoveredId)!.status,
    ).toBe("OPEN");
    expect(await repository.getOperationResult(operation.id)).toMatchObject({
      state: "SERVER_CONFIRMED",
      disposition: "APPLIED",
    });
    expect((await repository.getExpense(created.id))?.status).toBe("ACCEPTED"); // Later RESTORE projection survives.
    expect(
      sqlite
        .prepare("SELECT status FROM sync_operations WHERE id=?")
        .get(restore.operationId!)!.status,
    ).toBe("PENDING");
    const child = (await queue.listPending()).find(
      (op) => op.id === restore.operationId,
    )!;
    expect(
      JSON.parse((await repository.bindOperation(child, true)).payloadJson).envelope
        .causalBaseReceipt,
    ).toEqual(operationReceipt);
    await expect(
      repository.confirmConflictResolution(resolutionId, {
        ...response,
        canonical: serverExpense("changed replay", 3, true),
      }),
    ).rejects.toThrow("Immutable resolution replay differs");
    sqlite.close();
  });
});

describe("Expense causal reconciliation gates", () => {
  it("late CREATE receipt confirms only itself and preserves newer local DELETE across restart", async () => {
    const { sqlite, api } = database();
    let repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    await repository.tombstoneExpense(expense.id, "changed my mind");
    const [createId, deleteId] = operationIds(sqlite, expense.id);
    repository = createLedgerExpenseRepository(api, async () => userId);
    await repository.confirmExpenseOperation(createId!, serverExpense("original", 1));
    expect(await repository.getExpense(expense.id)).toMatchObject({
      status: "DELETED",
      deletedAt: expect.any(String),
      syncStatus: "PENDING_DELETE",
      serverRevision: 1,
    });
    expect(await repository.getOperationResult(createId!)).toMatchObject({
      state: "SERVER_CONFIRMED",
      disposition: "APPLIED",
    });
    expect(await repository.getOperationResult(deleteId!)).toMatchObject({
      state: "PENDING_SYNC",
      intentSequence: 2,
    });
    expect(
      sqlite
        .prepare(
          "SELECT intent_sequence, predecessor_operation_id FROM ledger_expense_commands ORDER BY intent_sequence",
        )
        .all(),
    ).toEqual([
      { intent_sequence: 1, predecessor_operation_id: null },
      { intent_sequence: 2, predecessor_operation_id: createId },
    ]);
    sqlite.close();
  });

  it("pull uses aggregate revision, preserves descriptive intent and compatible server valuation, never regresses baseline", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    const [createId] = operationIds(sqlite, expense.id);
    await repository.confirmExpenseOperation(createId!, serverExpense("original", 1));
    await repository.updateExpense(expense.id, command("my title"), "title");
    const canonical = {
      ...serverExpense("original", 2),
      valuation: {
        ...serverExpense("original", 2).valuation!,
        policy: "REFERENCE_RATE" as const,
        settlement: { minor: 150, currency: "NZD", scale: 2 },
      },
      splits: command("original").splits.map((split) => ({
        ...split,
        settlementMinor: 150,
      })),
    };
    const reads = createLedgerReadRepository(api, async () => userId);
    await reads.applyChanges(journeyId, {
      cursor: "cursor-2",
      hasMore: false,
      serverTime: canonical.updatedAt,
      changes: [
        {
          entityType: "EXPENSE",
          entityId: canonical.id,
          revision: 1,
          isTombstone: false,
          aggregate: canonical,
        },
      ],
    });
    expect(await repository.getExpense(expense.id)).toMatchObject({
      title: "my title",
      serverRevision: 2,
      syncStatus: "PENDING_UPDATE",
      valuation: { policy: "REFERENCE_RATE", settlement: { minor: 150 } },
    });
    await reads.applyChanges(journeyId, {
      cursor: "cursor-3",
      hasMore: false,
      serverTime: canonical.updatedAt,
      changes: [
        {
          entityType: "EXPENSE",
          entityId: canonical.id,
          revision: 1,
          isTombstone: false,
          aggregate: serverExpense("old title", 1),
        },
      ],
    });
    expect(await repository.getExpense(expense.id)).toMatchObject({
      title: "my title",
      serverRevision: 2,
      valuation: { settlement: { minor: 150 } },
    });
    sqlite.close();
  });

  it("older valuation/correction/resolution canonical cannot resurrect newer tombstone; only explicit RESTORE can", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    const [createId] = operationIds(sqlite, expense.id);
    await repository.confirmExpenseOperation(createId!, serverExpense("original", 1));
    await repository.tombstoneExpense(expense.id, "delete");
    await repository.reconcileCanonicalExpense(
      expense.id,
      serverExpense("server title", 2),
    );
    expect(await repository.getExpense(expense.id)).toMatchObject({
      status: "DELETED",
      syncStatus: "PENDING_DELETE",
    });
    await repository.restoreExpense(expense.id, "ACCEPTED", "restore");
    const [, deleteId, restoreId] = operationIds(sqlite, expense.id);
    await repository.confirmExpenseOperation(
      deleteId!,
      serverExpense("server title", 3, true),
    );
    expect(await repository.getExpense(expense.id)).toMatchObject({
      status: "ACCEPTED",
      deletedAt: null,
      syncStatus: "PENDING_UPDATE",
    });
    expect(await repository.getOperationResult(restoreId!)).toMatchObject({
      state: "PENDING_SYNC",
    });
    sqlite.close();
  });

  it("receipt, canonical, projection, command completion and dependency wake roll back together and replay once", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    await repository.tombstoneExpense(expense.id, "delete");
    const [createId, deleteId] = operationIds(sqlite, expense.id);
    sqlite.exec(
      "CREATE TRIGGER reject_projection BEFORE UPDATE ON ledger_expenses BEGIN SELECT RAISE(ABORT, 'projection failed'); END;",
    );
    await expect(
      repository.confirmExpenseOperation(createId!, serverExpense("original", 1)),
    ).rejects.toThrow("projection failed");
    expect(
      sqlite.prepare("SELECT * FROM ledger_expense_operation_receipts").all(),
    ).toEqual([]);
    expect(
      sqlite.prepare("SELECT * FROM ledger_expense_canonical_baselines").all(),
    ).toEqual([]);
    expect(
      sqlite.prepare("SELECT status FROM sync_operations WHERE id = ?").get(deleteId!),
    ).toEqual({ status: "DEPENDENCY_BLOCKED" });
    sqlite.exec("DROP TRIGGER reject_projection");
    await repository.confirmExpenseOperation(createId!, serverExpense("original", 1));
    await repository.confirmExpenseOperation(createId!, serverExpense("original", 1));
    expect(
      sqlite.prepare("SELECT * FROM ledger_expense_operation_receipts").all(),
    ).toHaveLength(1);
    expect(
      sqlite.prepare("SELECT status FROM sync_operations WHERE id = ?").get(deleteId!),
    ).toEqual({ status: "PENDING" });
    await expect(
      repository.confirmExpenseOperation(createId!, serverExpense("changed replay", 1)),
    ).rejects.toThrow("immutable result");
    sqlite.close();
  });

  it("binds CAS before request and preserves bound request after response loss, restart and a newer pull", async () => {
    const { sqlite, api } = database();
    let repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    const [createId] = operationIds(sqlite, expense.id);
    await repository.confirmExpenseOperation(createId!, serverExpense("original", 1));
    await repository.updateExpense(expense.id, command("my title"), "title");
    const queue = createSyncOperationRepository(api, async () => userId);
    const operation = (await queue.listPending())[0]!;
    const bound = await repository.bindOperation(operation);
    expect(bound.baseVersion).toBe(1);
    await repository.reconcileCanonicalExpense(
      expense.id,
      serverExpense("server change", 4),
    );
    repository = createLedgerExpenseRepository(api, async () => userId);
    expect(await repository.bindOperation(operation)).toEqual(bound);
    expect(await repository.getOperationResult(operation.id)).toMatchObject({
      state: "PENDING_SYNC",
    });
    sqlite.close();
  });

  it("COMPLETED without receipt never confirms or wakes a new causal dependency", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    await repository.tombstoneExpense(expense.id, "delete");
    const [createId] = operationIds(sqlite, expense.id);
    const queue = createSyncOperationRepository(api, async () => userId);
    await queue.markCompleted(createId!);
    expect(await repository.getOperationResult(createId!)).toMatchObject({
      state: "PENDING_SYNC",
    });
    expect(await queue.listPending()).toEqual([]);
    sqlite.close();
  });

  it("cross-account interruption discards response and pauses before any second request", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    await repository.createExpense(command("second expense"));
    const [createId] = operationIds(sqlite, expense.id);
    const transport = {
      createExpense: vi.fn(async () => {
        advanceAccountGeneration();
        return {
          serverId: serverExpense("original", 1).id,
          revision: 1,
          entity: serverExpense("original", 1),
        };
      }),
      updateExpense: vi.fn(),
      deleteExpense: vi.fn(),
      restoreExpense: vi.fn(),
    };
    const result = await createSyncEngine(
      createSyncOperationRepository(api, async () => userId),
      createLedgerExpenseSyncWorker(repository, transport),
    ).run("AUTHENTICATED_ONLINE");
    expect(result.status).toBe("paused_auth");
    expect(transport.createExpense).toHaveBeenCalledOnce();
    expect(await repository.getOperationResult(createId!)).toMatchObject({
      state: "PENDING_SYNC",
    });
    expect((await repository.getExpense(expense.id))?.serverRevision).toBe(0);
    expect(
      sqlite.prepare("SELECT * FROM ledger_expense_operation_receipts").all(),
    ).toEqual([]);
    sqlite.close();
  });

  it("does not rewrite an attempted auth-paused CREATE with zero error attempts", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    const [createId] = operationIds(sqlite, expense.id);
    const original = sqlite
      .prepare("SELECT payload_json, idempotency_key FROM sync_operations WHERE id = ?")
      .get(createId!);
    sqlite
      .prepare(
        "UPDATE sync_operations SET last_attempt_at = ?, status = 'PENDING', attempt_count = 0 WHERE id = ?",
      )
      .run("2026-09-24T10:01:00Z", createId!);
    await repository.updateExpense(expense.id, command("new title"), "title");
    expect(
      sqlite
        .prepare("SELECT payload_json, idempotency_key FROM sync_operations WHERE id = ?")
        .get(createId!),
    ).toEqual(original);
    expect(operationIds(sqlite, expense.id)).toHaveLength(2);
    sqlite.close();
  });
});

describe("Expense operation receipt and chain outcomes", () => {
  it("late valuation receipt atomically maps evidence, confirms valuation and preserves newer DELETE", async () => {
    const { sqlite, api } = database();
    sqlite
      .prepare(
        "INSERT INTO ledger_journeys (journey_id, settlement_currency, settlement_scale, valuation_policy, updated_at) VALUES (?, 'NZD', 2, 'REFERENCE_RATE', ?)",
      )
      .run(journeyId, "2026-09-24T10:00:00Z");
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    const [createId] = operationIds(sqlite, expense.id);
    await repository.confirmExpenseOperation(createId!, serverExpense("original", 1));
    const valued = await repository.applyValuation(expense.id, {
      policy: "SAME_CURRENCY",
    });
    expect(valued.operationResult).toMatchObject({
      commandType: "APPLY_VALUATION",
      state: "PENDING_SYNC",
    });
    const deletion = await repository.tombstoneExpense(expense.id, "delete");
    const response = {
      ...serverExpense("original", 2),
      valuation: {
        ...serverExpense("original", 2).valuation!,
        id: "65000000-0000-4000-8000-000000000001",
      },
    };
    const valuationId = valued.operationResult!.operationId!;
    sqlite.exec(
      "CREATE TRIGGER reject_receipt BEFORE INSERT ON ledger_expense_operation_receipts BEGIN SELECT RAISE(ABORT, 'receipt failed'); END;",
    );
    await expect(
      repository.confirmExpenseOperation(valuationId, response),
    ).rejects.toThrow("receipt failed");
    expect(
      sqlite
        .prepare("SELECT server_id FROM ledger_valuation_snapshots WHERE id = ?")
        .get(valued.valuation!.id),
    ).toEqual({ server_id: null });
    sqlite.exec("DROP TRIGGER reject_receipt");
    await repository.confirmExpenseOperation(valuationId, response);
    expect(await repository.getExpense(expense.id)).toMatchObject({
      status: "DELETED",
      syncStatus: "PENDING_DELETE",
      serverRevision: 2,
    });
    expect(await repository.getOperationResult(valuationId)).toMatchObject({
      state: "SERVER_CONFIRMED",
      disposition: "APPLIED",
    });
    expect(await repository.getOperationResult(deletion.operationId!)).toMatchObject({
      state: "PENDING_SYNC",
      commandType: "DELETE",
    });
    sqlite.close();
  });

  it("per-operation failures and multi-step conflict dependencies remain distinguishable", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    const [createId] = operationIds(sqlite, expense.id);
    const queue = createSyncOperationRepository(api, async () => userId);
    await queue.markRetryable(
      createId!,
      new ApiClientError("Server unavailable", "http", 503),
      "2026-09-24T10:00:00Z",
    );
    expect(await repository.getOperationResult(createId!)).toMatchObject({
      state: "RETRYABLE_FAILURE",
    });
    await queue.markConflict(createId!, new SyncConflictError("conflict"));
    await repository.updateExpense(expense.id, command("my title"), "edit");
    const deletion = await repository.tombstoneExpense(expense.id, "delete");
    expect(deletion).toMatchObject({
      state: "CONFLICT_REQUIRES_ACTION",
      blockingOperationId: createId,
    });
    expect(await queue.listPending()).toEqual([]);
    sqlite.close();
  });

  it("non-applied predecessor disposition cannot wake or execute its dependent intent", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    await repository.tombstoneExpense(expense.id, "delete");
    const [createId, deleteId] = operationIds(sqlite, expense.id);
    await repository.confirmExpenseOperation(
      createId!,
      serverExpense("original", 1),
      "KEPT_SERVER",
    );
    expect(await repository.getOperationResult(createId!)).toMatchObject({
      state: "SERVER_CONFIRMED",
      disposition: "KEPT_SERVER",
    });
    const queue = createSyncOperationRepository(api, async () => userId);
    expect(await queue.listPending()).toEqual([]);
    expect(await repository.getOperationResult(deleteId!)).toMatchObject({
      state: "CONFLICT_REQUIRES_ACTION",
      blockingOperationId: createId,
    });
    const row = sqlite
      .prepare(
        "SELECT id, owner_user_id AS ownerUserId, entity_id AS entityId, payload_json AS payloadJson, base_version AS baseVersion FROM sync_operations WHERE id = ?",
      )
      .get(deleteId!);
    await expect(repository.bindOperation(row as never)).rejects.toThrow(
      "was not applied",
    );
    sqlite.close();
  });
});

describe("CREATE acknowledgement after pull", () => {
  it("adopts an already pulled newer canonical and removes only the confirmed duplicate mirror", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    await repository.tombstoneExpense(expense.id, "delete");
    const [createId] = operationIds(sqlite, expense.id);
    const canonical = {
      ...serverExpense("automatic title", 2),
      valuation: {
        ...serverExpense("automatic title", 2).valuation!,
        id: "65000000-0000-4000-8000-000000000001",
      },
    };
    const reads = createLedgerReadRepository(api, async () => userId);
    await reads.applyChanges(journeyId, {
      cursor: "pull-first",
      hasMore: false,
      serverTime: canonical.updatedAt,
      changes: [
        {
          entityType: "EXPENSE",
          entityId: canonical.id,
          revision: 1,
          isTombstone: false,
          aggregate: canonical,
        },
      ],
    });
    expect(sqlite.prepare("SELECT id FROM ledger_expenses").all()).toHaveLength(2);
    await repository.confirmExpenseOperation(createId!, serverExpense("original", 1));
    expect(sqlite.prepare("SELECT id FROM ledger_expenses").all()).toEqual([
      { id: expense.id },
    ]);
    expect(await repository.getExpense(expense.id)).toMatchObject({
      status: "DELETED",
      title: "automatic title",
      serverRevision: 2,
      syncStatus: "PENDING_DELETE",
    });
    expect(await repository.getOperationResult(createId!)).toMatchObject({
      state: "SERVER_CONFIRMED",
      confirmedServerRevision: 1,
    });
    sqlite.close();
  });
});

describe("Pull transaction account boundary", () => {
  it("rolls back canonical/projection/cursor when the account changes before commit", async () => {
    const { sqlite, api } = database();
    const repository = createLedgerExpenseRepository(api, async () => userId);
    const expense = await repository.createExpense(command("original"));
    const [createId] = operationIds(sqlite, expense.id);
    await repository.confirmExpenseOperation(createId!, serverExpense("original", 1));
    const originalRun = api.runAsync;
    api.runAsync = async (sql, ...args) => {
      const result = await originalRun(sql, ...args);
      if (sql.includes("INSERT OR REPLACE INTO ledger_sync_cursors"))
        advanceAccountGeneration();
      return result;
    };
    const canonical = serverExpense("server title", 2);
    await expect(
      createLedgerReadRepository(api, async () => userId).applyChanges(journeyId, {
        cursor: "changed-account",
        hasMore: false,
        serverTime: canonical.updatedAt,
        changes: [
          {
            entityType: "EXPENSE",
            entityId: canonical.id,
            revision: 1,
            isTombstone: false,
            aggregate: canonical,
          },
        ],
      }),
    ).rejects.toThrow("Account changed");
    expect(await repository.getExpense(expense.id)).toMatchObject({
      title: "original",
      serverRevision: 1,
    });
    expect(
      sqlite.prepare("SELECT revision FROM ledger_expense_canonical_baselines").all(),
    ).toEqual([{ revision: 1 }]);
    expect(sqlite.prepare("SELECT * FROM ledger_sync_cursors").all()).toEqual([]);
    sqlite.close();
  });
});

describe("Feed event versus canonical lifecycle", () => {
  it("uses newer canonical lifecycle over an older delete event and retains events with no canonical", async () => {
    const { sqlite, api } = database();
    const reads = createLedgerReadRepository(api, async () => userId);
    const canonical = serverExpense("restored", 3);
    await reads.applyChanges(journeyId, {
      cursor: "restored",
      hasMore: false,
      serverTime: canonical.updatedAt,
      changes: [
        {
          entityType: "EXPENSE",
          entityId: canonical.id,
          revision: 2,
          isTombstone: true,
          aggregate: canonical,
        },
      ],
    });
    expect(
      sqlite
        .prepare("SELECT business_status, server_revision FROM ledger_expenses")
        .get(),
    ).toEqual({ business_status: "ACCEPTED", server_revision: 3 });
    await reads.applyChanges(journeyId, {
      cursor: "event-only",
      hasMore: false,
      serverTime: canonical.updatedAt,
      changes: [
        {
          entityType: "EXPENSE",
          entityId: canonical.id,
          revision: 100,
          isTombstone: true,
          aggregate: null,
        },
      ],
    });
    expect(
      sqlite
        .prepare("SELECT business_status, server_revision FROM ledger_expenses")
        .get(),
    ).toEqual({ business_status: "ACCEPTED", server_revision: 3 });
    expect(
      sqlite.prepare("SELECT revision FROM ledger_deferred_server_changes").all(),
    ).toEqual([{ revision: 100 }]);
    expect(
      sqlite.prepare("SELECT revision FROM ledger_expense_canonical_baselines").all(),
    ).toEqual([{ revision: 3 }]);
    sqlite.close();
  });
});

describe("Formal review cache and durable decision", () => {
  it("discovers tombstones through empty pull, preserves the decision on restart, rejects drift and rolls back account changes", async () => {
    const { sqlite, api } = database();
    const expenses = createLedgerExpenseRepository(api, async () => userId);
    const local = await expenses.createExpense(command("delete intent"));
    await expenses.confirmExpenseOperation(
      operationIds(sqlite, local.id)[0]!,
      serverExpense("latest", 2),
    );
    await expenses.tombstoneExpense(local.id, "delete intent");
    const conflictId = "60000000-0000-4000-8000-000000000001";
    const chain: ExpenseConflictChainResponse = {
      contractVersion: 2,
      canonical: serverExpense("latest", 2),
      chainDigest: "a".repeat(64),
      conflicts: [
        {
          conflictId,
          commandId: "remote-delete",
          idempotencyKey: "remote-key",
          commandType: "DELETE",
          submittedIntent: { type: "DELETE" },
          observedBaseRevision: 1,
          currentServerRevision: 2,
          changedGroups: ["LIFECYCLE"],
          lifecycle: "OPEN",
          reason: null,
        },
      ],
    };
    const reads = createLedgerReadRepository(api, async () => userId);
    const pull = {
      cursor: "metadata-only",
      hasMore: false,
      serverTime: chain.canonical.updatedAt,
      changes: [],
      expenseConflictChains: [
        {
          expenseId: chain.canonical.id,
          chainDigest: chain.chainDigest,
          conflictIds: [conflictId],
          openConflictIds: [conflictId],
        },
      ],
    };
    await reads.applyChanges(journeyId, pull);
    const transport = {
      readConflictChain: vi.fn().mockResolvedValue(chain),
    } as unknown as Parameters<typeof createLedgerExpenseConflictRepository>[2];
    const review = createLedgerExpenseConflictRepository(
      api,
      async () => userId,
      transport,
    );
    expect(await review.listOpen(journeyId)).toMatchObject([
      { id: local.id, deletedAt: expect.any(String), conflictCount: 1 },
    ]);
    expect(await review.readCached(local.id)).toBeNull();
    await review.refresh(local.id);
    const input = {
      contractVersion: 2 as const,
      commandId: "remote-delete",
      intentType: "DELETE" as const,
      submittedIntent: { type: "DELETE" as const },
      observedBaseRevision: 1,
      currentServerRevision: 2,
      coveredConflictIds: [conflictId],
      expectedChainDigest: chain.chainDigest,
      choice: "CONFIRM_DELETE" as const,
      reason: "Continue deletion",
    };
    const operationId = await review.queueResolution(local.id, input);
    const first = sqlite
      .prepare("SELECT idempotency_key,payload_json FROM sync_operations WHERE id=?")
      .get(operationId);
    const restarted = createLedgerExpenseConflictRepository(
      api,
      async () => userId,
      transport,
    );
    expect(await restarted.getResolutionResult(local.id)).toMatchObject({
      operationId,
      status: "PENDING",
      responseJson: null,
    });
    await expect(restarted.queueResolution(local.id, input)).rejects.toThrow(
      "previous decision",
    );
    expect(
      sqlite
        .prepare("SELECT idempotency_key,payload_json FROM sync_operations WHERE id=?")
        .get(operationId),
    ).toEqual(first);
    await expect(
      restarted.queueResolution(local.id, { ...input, currentServerRevision: 3 }),
    ).rejects.toThrow("latest value");
    await reads.applyChanges(journeyId, {
      ...pull,
      expenseConflictChains: [
        { ...pull.expenseConflictChains[0]!, chainDigest: "b".repeat(64) },
      ],
    });
    expect(await restarted.readCached(local.id)).toBeNull();
    await expect(restarted.queueResolution(local.id, input)).rejects.toThrow(
      "latest value",
    );
    expect(
      await createLedgerExpenseConflictRepository(
        api,
        async () => "other-account",
        transport,
      ).listOpen(),
    ).toEqual([]);
    const run = api.runAsync;
    api.runAsync = async (sql, ...args) => {
      const result = await run(sql, ...args);
      if (sql.includes("SET chain_json=")) advanceAccountGeneration();
      return result;
    };
    await expect(restarted.refresh(local.id)).rejects.toThrow("Account changed");
    expect(await restarted.readCached(local.id)).toBeNull();
    sqlite.close();
  });

  it("shows business choices and only reports the actual explicit decision result", () => {
    const canonical = serverExpense("latest", 2);
    const conflict: ExpenseConflictChainResponse["conflicts"][number] = {
      conflictId: "60000000-0000-4000-8000-000000000001",
      commandId: "delete",
      idempotencyKey: "key",
      commandType: "DELETE",
      submittedIntent: { type: "DELETE" },
      observedBaseRevision: 1,
      currentServerRevision: 2,
      changedGroups: ["LIFECYCLE"],
      lifecycle: "OPEN",
      reason: null,
    };
    expect(conflictChoices(conflict)).toEqual([
      { choice: "KEEP_SERVER", label: "Use latest value" },
      { choice: "CONFIRM_DELETE", label: "Continue deletion" },
    ]);
    const intent = {
      ...conflict,
      commandType: "UPDATE" as const,
      submittedIntent: {
        type: "UPDATE" as const,
        patch: {
          financial: { payerMemberId: memberId },
          participantSplit: {
            participants: canonical.participants,
            splits: canonical.splits,
          },
        },
      },
    };
    const lines = conflictIntentLines(intent, canonical).join("\n");
    expect(lines).toContain("Payer: A");
    expect(lines).toContain("A's share:");
    expect(lines).not.toContain(memberId);
    expect(lines).not.toContain("minor units");
    const currentLines = canonicalConflictLines(canonical).join("\n");
    expect(currentLines).toContain("Payer: A");
    expect(currentLines).toContain("A's share:");
    expect(currentLines).not.toContain(memberId);
    expect(
      canonicalConflictLines(
        { ...canonical, participants: [] },
        { [memberId]: "Journey payer" },
      ).join("\n"),
    ).toContain("Payer: Journey payer");
    expect(resolutionStatus(null)).toBeNull();
    expect(
      resolutionStatus({ status: "RETRYABLE", responseJson: null, errorCode: null }),
    ).toContain("connection");
    expect(
      resolutionStatus({ status: "CONFLICT", responseJson: null, errorCode: null }),
    ).toContain("Check the latest value");
    expect(
      resolutionStatus({ status: "COMPLETED", responseJson: "{}", errorCode: null }),
    ).toBe("Your decision is saved.");
    expect(conflictChoices({ ...conflict, submittedIntent: null })).toEqual([]);
    expect(conflictChoices(intent, serverExpense("deleted", 3, true))).toEqual([
      { choice: "KEEP_SERVER", label: "Use latest value" },
    ]);
    expect(
      resolutionStatus({
        status: "CONFLICT",
        responseJson: null,
        errorCode: "SETTLEMENT_INPUT_STALE",
      }),
    ).toContain("confirmed Settlement");
  });
});

it("replays a lost resolution response unchanged and a prior rejected review does not override the confirmed deletion", async () => {
  const { sqlite, api } = database();
  const expenses = createLedgerExpenseRepository(api, async () => userId);
  const local = await expenses.createExpense(command("current"));
  await expenses.confirmExpenseOperation(
    operationIds(sqlite, local.id)[0]!,
    serverExpense("current", 3),
  );
  const conflictId = "60000000-0000-4000-8000-000000000002";
  const request = {
    contractVersion: 2 as const,
    commandId: "remote-delete",
    intentType: "DELETE" as const,
    submittedIntent: { type: "DELETE" as const },
    observedBaseRevision: 1,
    currentServerRevision: 3,
    coveredConflictIds: [conflictId],
    expectedChainDigest: "a".repeat(64),
    choice: "CONFIRM_DELETE" as const,
    reason: "Continue deletion",
  };
  sqlite
    .prepare(
      "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,owner_user_id,status,created_at,updated_at) VALUES(?,?,'ledger_expense',?,'LEDGER_RESOLVE_EXPENSE_CONFLICT',?,?,?,?,'CONFLICT','2026-09-29','2026-09-29')",
    )
    .run(
      "old-review",
      journeyId,
      local.id,
      "old-key",
      2,
      JSON.stringify({ ...request, currentServerRevision: 2 }),
      userId,
    );
  sqlite
    .prepare(
      "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,owner_user_id,status,created_at,updated_at) VALUES(?,?,'ledger_expense',?,'LEDGER_RESOLVE_EXPENSE_CONFLICT',?,?,?,?,'PENDING','2026-09-29','2026-09-29')",
    )
    .run(
      "fresh-review",
      journeyId,
      local.id,
      "same-resolution-key",
      3,
      JSON.stringify(request),
      userId,
    );
  const canonical = serverExpense("current", 4, true);
  const receipt = {
    operationId: "remote-delete",
    commandId: "remote-delete",
    idempotencyKey: "same-resolution-key",
    expenseId: canonical.id,
    commandType: "DELETE" as const,
    intentSequence: 1,
    disposition: "APPLIED" as const,
    canonicalRevision: 4,
  };
  const response = {
    canonical,
    resolutionReceipt: receipt,
    openConflictIds: [],
    conflictOutcomes: [
      {
        conflictId,
        lifecycle: "RESOLVED" as const,
        reason: "Confirmed",
        supersededByCommandId: "remote-delete",
        operationReceipt: { ...receipt, idempotencyKey: "original-delete-key" },
      },
    ],
  };
  const requests: unknown[] = [];
  const resolveConflictChain = vi.fn(async (input: unknown) => {
    requests.push(input);
    if (requests.length === 1) throw new ApiClientError("Response lost", "network");
    return response;
  });
  const queue = createSyncOperationRepository(api, async () => userId);
  const collaboration = createLedgerCollaborationRepository(api, async () => userId);
  const transport = { resolveConflictChain } as unknown as Parameters<
    typeof createLedgerExpenseSyncWorker
  >[1];
  const worker = createLedgerExpenseSyncWorker(expenses, transport, collaboration);
  const [op] = await queue.listPending();
  await expect(worker.push(op!)).rejects.toThrow("Response lost");
  expect(
    sqlite.prepare("SELECT * FROM ledger_expense_resolution_receipts").all(),
  ).toHaveLength(0);
  await createLedgerExpenseSyncWorker(expenses, transport, collaboration).push(op!);
  await createLedgerExpenseSyncWorker(expenses, transport, collaboration).push(op!);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[2]).toEqual(requests[0]);
  expect(
    sqlite.prepare("SELECT * FROM ledger_expense_resolution_receipts").all(),
  ).toHaveLength(1);
  expect(await expenses.getExpense(local.id)).toMatchObject({
    status: "DELETED",
    serverRevision: 4,
    syncStatus: "SYNCED",
  });
  expect(
    sqlite.prepare("SELECT status FROM sync_operations WHERE id='fresh-review'").get(),
  ).toEqual({ status: "COMPLETED" });
  expect(
    sqlite.prepare("SELECT status FROM sync_operations WHERE id='old-review'").get(),
  ).toEqual({ status: "CONFLICT" });
  sqlite.close();
});

it("converges same-revision closure audit and later server time without stale feed regression", async () => {
  const { sqlite, api } = database();
  const repository = createLedgerExpenseRepository(api, async () => userId);
  const expense = await repository.createExpense(command("original"));
  const [createId] = operationIds(sqlite, expense.id);
  const before = serverExpense("original", 2);
  await repository.confirmExpenseOperation(createId!, before);
  const closure = {
    ...before,
    updatedAt: "2026-09-24T10:00:02Z",
    auditEvents: [
      {
        id: "60000000-0000-4000-8000-000000000001",
        expenseId: before.id,
        actorUserId: userId,
        actorMemberId: memberId,
        eventType: "CONFLICT_RESOLVED" as const,
        reason: "Equivalent business intent",
        changedGroups: [],
        revision: 2,
        createdAt: "2026-09-24T10:00:02Z",
      },
    ],
  };
  const oldAuditSnapshot = {
    ...before,
    auditEvents: closure.auditEvents.map((event) => ({
      ...event,
      createdAt: before.updatedAt,
    })),
  };
  await repository.reconcileCanonicalExpense(expense.id, oldAuditSnapshot);
  const review = createLedgerExpenseConflictRepository(api, async () => userId, {
    readConflictChain: vi.fn().mockResolvedValue({
      contractVersion: 2,
      canonical: closure,
      chainDigest: "a".repeat(64),
      conflicts: [],
    }),
  } as unknown as Parameters<typeof createLedgerExpenseConflictRepository>[2]);
  await review.refresh(expense.id);
  await repository.reconcileCanonicalExpense(expense.id, oldAuditSnapshot);
  await repository.reconcileCanonicalExpense(expense.id, before);
  await repository.reconcileCanonicalExpense(expense.id, serverExpense("stale", 1));
  const baseline = JSON.parse(
    (
      sqlite
        .prepare(
          "SELECT canonical_json FROM ledger_expense_canonical_baselines WHERE expense_id=?",
        )
        .get(expense.id) as { canonical_json: string }
    ).canonical_json,
  );
  expect(baseline).toMatchObject({
    revision: 2,
    title: "original",
    updatedAt: closure.updatedAt,
    auditEvents: closure.auditEvents,
  });
  expect((await repository.getExpense(expense.id))?.updatedAt).toBe(closure.updatedAt);
  expect(
    sqlite
      .prepare(
        "SELECT * FROM ledger_expense_audit_events WHERE event_type='CONFLICT_RESOLVED'",
      )
      .all(),
  ).toHaveLength(1);
  expect(operationIds(sqlite, expense.id)).toHaveLength(1);
  sqlite.close();
});
