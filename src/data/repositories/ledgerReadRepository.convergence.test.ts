import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import type { LedgerBootstrapResponse } from "@/data/api/ledgerReadContracts";
import { migrations } from "@/data/db/migrations";

import {
  createLedgerReadRepository,
  type LedgerReadDatabase,
} from "./ledgerReadRepository";

const userId = "90000000-0000-4000-8000-000000000001";
const journeyId = "10000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";
const expenseId = "20000000-0000-4000-8000-000000000001";
const open: DatabaseSync[] = [];

afterEach(() => {
  for (const database of open.splice(0)) database.close();
});

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  open.push(sqlite);
  for (const migration of migrations) sqlite.exec(migration.sql);
  const database: LedgerReadDatabase = {
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
  return {
    sqlite,
    repository: createLedgerReadRepository(database, async () => userId),
  };
}

const expense = {
  id: expenseId,
  journeyId,
  creatorMemberId: null,
  payerMemberId: memberId,
  title: "Canonical",
  description: "Same intent",
  category: "transport",
  occurredAt: "2026-09-11T00:00:00.000Z",
  economicDate: "2026-09-11",
  original: { minor: 1200, currency: "NZD", scale: 2 },
  businessStatus: "ACCEPTED" as const,
  settlementParticipation: "INCLUDED" as const,
  revision: 1,
  deletedAt: null,
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
  participants: [{ memberId, displayNameSnapshot: "Leon", householdIdSnapshot: null }],
  splits: [
    {
      memberId,
      method: "EQUAL_PERSON" as const,
      originalMinor: 1200,
      settlementMinor: 1200,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: {
    id: "60000000-0000-4000-8000-000000000001",
    policy: "SAME_CURRENCY" as const,
    original: { minor: 1200, currency: "NZD", scale: 2 },
    settlement: { minor: 1200, currency: "NZD", scale: 2 },
    rateSnapshotId: null,
    paymentRecordId: null,
    reason: null,
    decimalRate: "1",
    roundingMode: "HALF_UP" as const,
    effectiveAt: undefined,
    supersedesValuationId: null,
    referenceEvidence: null,
  },
  paymentRecords: [],
  auditEvents: [],
} satisfies LedgerBootstrapResponse["expenses"][number];

function bootstrap(expenseValue = expense): LedgerBootstrapResponse {
  return {
    journey: {
      id: journeyId,
      title: "Journey",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      settlementCurrency: "NZD",
      settlementScale: 2,
      valuationPolicy: "REFERENCE_RATE",
      updatedAt: "2026-09-11T00:00:00.000Z",
    },
    members: [
      {
        id: memberId,
        displayName: "Leon",
        role: "owner",
        status: "linked",
        capabilities: {
          canRead: true,
          canCreateExpense: true,
          canEditOwnExpense: true,
          canCorrectAnyExpense: true,
          canSuggestCorrection: true,
          canResolveOwnExpenseConflict: true,
          canAddOwnPaymentEvidence: true,
          canManageExpenseValuation: true,
          canManageLedgerValuationPolicy: true,
        },
        updatedAt: "2026-09-11T00:00:00.000Z",
      },
    ],
    households: [],
    expenses: [expenseValue],
    corrections: [],
    rateQuotes: [],
    actor: {
      memberId,
      role: "owner",
      capabilities: {
        canRead: true,
        canCreateExpense: true,
        canEditOwnExpense: true,
        canCorrectAnyExpense: true,
        canSuggestCorrection: true,
        canResolveOwnExpenseConflict: true,
        canAddOwnPaymentEvidence: true,
        canManageExpenseValuation: true,
        canManageLedgerValuationPolicy: true,
      },
    },
    cursor: "cursor",
    serverTime: "2026-09-11T01:00:00.000Z",
  };
}

function strandEqualMirror(sqlite: DatabaseSync, title = expense.title) {
  sqlite
    .prepare(
      `UPDATE ledger_expenses SET title = ?, revision = 3, server_revision = 1,
         sync_status = 'FAILED', local_owner_user_id = ? WHERE id = ?`,
    )
    .run(title, userId, expenseId);
  sqlite
    .prepare(
      `UPDATE ledger_valuation_snapshots
       SET effective_at = '2026-09-11T00:30:00.000Z',
           reference_evidence_json = '{"stale":true}' WHERE expense_id = ?`,
    )
    .run(expenseId);
  const submitted = { ...expense, title };
  sqlite
    .prepare(
      `INSERT INTO sync_operations (
         id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
         base_version, payload_json, owner_user_id, status, attempt_count,
         created_at, updated_at
       ) VALUES ('failed-update', ?, 'ledger_expense', ?,
         'LEDGER_UPDATE_EXPENSE', 'key', 1, ?, ?, 'FAILED', 0, ?, ?)`,
    )
    .run(
      journeyId,
      expenseId,
      JSON.stringify({ expenseId, revision: 3, expense: submitted }),
      userId,
      "2026-09-11T00:30:00.000Z",
      "2026-09-11T00:30:00.000Z",
    );
}

describe("Ledger canonical mirror convergence", () => {
  it("re-materializes an equal failed mirror from fresh canonical bootstrap once", async () => {
    const { sqlite, repository } = fixture();
    await repository.applyBootstrap(bootstrap());
    sqlite
      .prepare(
        `INSERT INTO ledger_settlements (
           id, journey_id, status, through_timestamp, settlement_currency,
           settlement_scale, settings_revision, algorithm_version, input_digest,
           revision, finalized_by, finalized_at
         ) VALUES ('root', ?, 'FINALIZED', ?, 'NZD', 2, 1,
           'ledger-settlement-greedy-v1', ?, 1, ?, ?)`,
      )
      .run(
        journeyId,
        "2026-09-11T00:00:00.000Z",
        "a".repeat(64),
        userId,
        "2026-09-11T00:00:00.000Z",
      );
    const settlementBefore = JSON.stringify(
      sqlite.prepare("SELECT * FROM ledger_settlements WHERE id = 'root'").get(),
    );
    strandEqualMirror(sqlite);

    await repository.applyBootstrap(bootstrap());
    await repository.applyBootstrap(bootstrap());

    expect(
      sqlite
        .prepare(
          `SELECT revision, server_revision AS serverRevision,
             sync_status AS syncStatus, title
           FROM ledger_expenses WHERE id = ?`,
        )
        .get(expenseId),
    ).toEqual({
      revision: 1,
      serverRevision: 1,
      syncStatus: "SYNCED",
      title: "Canonical",
    });
    expect(
      sqlite
        .prepare("SELECT status FROM sync_operations WHERE id = 'failed-update'")
        .get(),
    ).toEqual({ status: "COMPLETED" });
    expect(
      sqlite
        .prepare(
          `SELECT effective_at AS effectiveAt,
             reference_evidence_json AS evidence
           FROM ledger_valuation_snapshots WHERE expense_id = ? AND is_active = 1`,
        )
        .get(expenseId),
    ).toEqual({ effectiveAt: null, evidence: null });
    expect(
      JSON.stringify(
        sqlite.prepare("SELECT * FROM ledger_settlements WHERE id = 'root'").get(),
      ),
    ).toBe(settlementBefore);
  });

  it("preserves failed intent and defers canonical data when any user field differs", async () => {
    const { sqlite, repository } = fixture();
    await repository.applyBootstrap(bootstrap());
    strandEqualMirror(sqlite, "Different local title");

    await repository.applyBootstrap(bootstrap());

    expect(
      sqlite
        .prepare("SELECT title, sync_status AS syncStatus FROM ledger_expenses")
        .get(),
    ).toEqual({ title: "Different local title", syncStatus: "FAILED" });
    expect(
      sqlite
        .prepare("SELECT status FROM sync_operations WHERE id = 'failed-update'")
        .get(),
    ).toEqual({ status: "FAILED" });
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS count FROM ledger_deferred_server_changes WHERE entity_id = ?",
        )
        .get(expenseId),
    ).toEqual({ count: 1 });
  });
});
