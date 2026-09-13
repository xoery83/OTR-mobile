import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import {
  analyzeReporting,
  summarizeReporting,
  type ReportingRecord,
} from "@/domain/ledger/reporting";
import { migrations } from "@/data/db/migrations";

import {
  createLedgerReportingRepository,
  type LedgerReportingDatabase,
} from "./ledgerReportingRepository";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE ledger_journeys (journey_id TEXT PRIMARY KEY, title TEXT, start_date TEXT,
      end_date TEXT, settlement_currency TEXT, settlement_scale INTEGER);
    CREATE TABLE ledger_members (id TEXT PRIMARY KEY, journey_id TEXT, display_name TEXT);
    CREATE TABLE ledger_expenses (id TEXT PRIMARY KEY, journey_id TEXT, payer_member_id TEXT,
      title TEXT, description TEXT, category TEXT, occurred_at TEXT,
      original_amount_minor INTEGER, original_currency TEXT, original_scale INTEGER,
      business_status TEXT, settlement_participation TEXT, sync_status TEXT, deleted_at TEXT);
    CREATE INDEX ledger_expenses_journey_occurred ON ledger_expenses(journey_id, occurred_at DESC, id);
    CREATE TABLE ledger_expense_participants (expense_id TEXT, member_id TEXT,
      display_name_snapshot TEXT, PRIMARY KEY(expense_id, member_id));
    CREATE TABLE ledger_expense_splits (expense_id TEXT, member_id TEXT,
      settlement_amount_minor INTEGER, PRIMARY KEY(expense_id, member_id));
    CREATE TABLE ledger_valuation_snapshots (id TEXT PRIMARY KEY, expense_id TEXT,
      settlement_amount_minor INTEGER, settlement_currency TEXT, settlement_scale INTEGER,
      is_active INTEGER);
    CREATE INDEX ledger_valuation_expense ON ledger_valuation_snapshots(expense_id) WHERE is_active = 1;
    CREATE TABLE ledger_expense_conflicts (expense_id TEXT, status TEXT);
    CREATE INDEX ledger_conflicts_expense ON ledger_expense_conflicts(expense_id, status);
    CREATE TABLE ledger_receipt_assets (expense_id TEXT);
    CREATE INDEX ledger_receipts_expense ON ledger_receipt_assets(expense_id);
    CREATE TABLE ledger_preferences (id INTEGER PRIMARY KEY, selected_journey_id TEXT, updated_at TEXT);
    CREATE TABLE ledger_my_journey_summaries (journey_id TEXT, period_key TEXT, title TEXT,
      start_date TEXT, end_date TEXT, currency TEXT, scale INTEGER, my_spend_minor INTEGER,
      paid_minor INTEGER, position_minor INTEGER, unvalued_count INTEGER,
      conflict_count INTEGER, updated_at TEXT);
  `);
  const adapter: LedgerReportingDatabase = {
    async getAllAsync<T>(sql: string, ...params: unknown[]) {
      return sqlite.prepare(sql).all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, ...params: unknown[]) {
      return (sqlite.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
    },
    async runAsync(sql: string, ...params: unknown[]) {
      sqlite.prepare(sql).run(...(params as never[]));
      return {} as never;
    },
  };
  return { adapter, sqlite };
}

const journeyId = "journey";
const memberId = "a";

function insertFixture(sqlite: DatabaseSync) {
  sqlite.exec(`
    INSERT INTO ledger_journeys VALUES ('journey', 'Europe', '2026-09-01', '2026-09-30', 'NZD', 2);
    INSERT INTO ledger_members VALUES ('a', 'journey', 'Alex'), ('b', 'journey', 'Bea');
    INSERT INTO ledger_expenses VALUES
      ('valued', 'journey', 'a', 'Dinner', NULL, 'food', '2026-09-10T08:00:00.000Z', 1000, 'EUR', 2, 'ACCEPTED', 'INCLUDED', 'PENDING_CREATE', NULL),
      ('rate', 'journey', 'b', 'Taxi', NULL, 'transport', '2026-09-11T08:00:00.000Z', 500, 'EUR', 2, 'RATE_REQUIRED', 'INCLUDED', 'SYNCED', NULL),
      ('conflict', 'journey', 'a', 'Hotel', NULL, 'hotel', '2026-09-12T08:00:00.000Z', 4000, 'NZD', 2, 'ACCEPTED', 'INCLUDED', 'CONFLICT', NULL);
    INSERT INTO ledger_expense_participants VALUES
      ('valued', 'a', 'Alex'), ('valued', 'b', 'Bea'), ('rate', 'a', 'Alex'), ('conflict', 'a', 'Alex');
    INSERT INTO ledger_expense_splits VALUES
      ('valued', 'a', 1200), ('valued', 'b', 800), ('rate', 'a', NULL), ('conflict', 'a', 4000);
    INSERT INTO ledger_valuation_snapshots VALUES
      ('v1', 'valued', 2000, 'NZD', 2, 1), ('v2', 'conflict', 4000, 'NZD', 2, 1);
    INSERT INTO ledger_expense_conflicts VALUES ('conflict', 'OPEN');
    INSERT INTO ledger_receipt_assets VALUES ('valued');
  `);
}

const records: ReportingRecord[] = [
  {
    id: "valued",
    title: "Dinner",
    description: null,
    category: "food",
    occurredAt: "2026-09-10T08:00:00.000Z",
    payerMemberId: "a",
    payerName: "Alex",
    originalMinor: 1000,
    originalCurrency: "EUR",
    businessStatus: "ACCEPTED",
    settlementParticipation: "INCLUDED",
    syncStatus: "PENDING_CREATE",
    settlementMinor: 2000,
    settlementCurrency: "NZD",
    hasOpenConflict: false,
    hasReceipt: true,
    splits: [
      { memberId: "a", memberName: "Alex", settlementMinor: 1200 },
      { memberId: "b", memberName: "Bea", settlementMinor: 800 },
    ],
  },
  {
    id: "rate",
    title: "Taxi",
    description: null,
    category: "transport",
    occurredAt: "2026-09-11T08:00:00.000Z",
    payerMemberId: "b",
    payerName: "Bea",
    originalMinor: 500,
    originalCurrency: "EUR",
    businessStatus: "RATE_REQUIRED",
    settlementParticipation: "INCLUDED",
    syncStatus: "SYNCED",
    settlementMinor: null,
    settlementCurrency: "NZD",
    hasOpenConflict: false,
    hasReceipt: false,
    splits: [{ memberId: "a", memberName: "Alex", settlementMinor: null }],
  },
  {
    id: "conflict",
    title: "Hotel",
    description: null,
    category: "hotel",
    occurredAt: "2026-09-12T08:00:00.000Z",
    payerMemberId: "a",
    payerName: "Alex",
    originalMinor: 4000,
    originalCurrency: "NZD",
    businessStatus: "ACCEPTED",
    settlementParticipation: "INCLUDED",
    syncStatus: "CONFLICT",
    settlementMinor: 4000,
    settlementCurrency: "NZD",
    hasOpenConflict: true,
    hasReceipt: false,
    splits: [{ memberId: "a", memberName: "Alex", settlementMinor: 4000 }],
  },
];

describe("Ledger reporting repository", () => {
  it("migrates the v10 reporting cache to v11 without touching financial or asset rows", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      CREATE TABLE ledger_journeys (journey_id TEXT PRIMARY KEY, settlement_currency TEXT,
        settlement_scale INTEGER, valuation_policy TEXT, updated_at TEXT);
      CREATE TABLE ledger_my_journey_summaries (journey_id TEXT PRIMARY KEY);
      CREATE TABLE ledger_expense_participants (expense_id TEXT, member_id TEXT);
      CREATE TABLE ledger_receipt_assets (id TEXT PRIMARY KEY, expense_id TEXT);
      CREATE TABLE ledger_expenses (id TEXT PRIMARY KEY);
      INSERT INTO ledger_expenses VALUES ('kept-expense');
      INSERT INTO ledger_receipt_assets VALUES ('kept-receipt', 'kept-expense');
    `);
    sqlite.exec(migrations.find((migration) => migration.id === 11)!.sql);
    expect(sqlite.prepare("SELECT id FROM ledger_expenses").get()).toEqual({
      id: "kept-expense",
    });
    expect(sqlite.prepare("SELECT id FROM ledger_receipt_assets").get()).toEqual({
      id: "kept-receipt",
    });
    expect(sqlite.prepare("PRAGMA table_info(ledger_journeys)").all()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "title" })]),
    );
    sqlite.close();
  });

  it("matches the shared backend semantics by totals, counts, and identities", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    const repository = createLedgerReportingRepository(adapter);
    for (const scope of ["MINE", "GROUP"] as const) {
      for (const filters of [
        {},
        { receipt: "HAS" as const },
        { category: "food" },
        { valuation: "RATE_REQUIRED" as const },
      ]) {
        const query = { journeyId, memberId, scope, ...filters };
        const summary = await repository.summarize(query);
        expect(summary).toEqual(summarizeReporting(records, scope, memberId, filters));
        const drilldown = (await repository.listExpenses(query, 1000)).filter(
          (row) => row.isAuthoritative,
        );
        expect(drilldown.map((row) => row.id).sort()).toEqual(summary.includedExpenseIds);
        expect(
          drilldown.reduce((total, row) => total + (row.componentMinor ?? 0), 0),
        ).toBe(summary.totalMinor);
      }
      for (const dimension of [
        "CATEGORY",
        "DAY",
        "PAYER",
        "PARTICIPANT",
        "CURRENCY",
      ] as const) {
        const buckets = await repository.analyze(
          { journeyId, memberId, scope },
          dimension,
        );
        expect(buckets).toEqual(analyzeReporting(records, dimension, scope, memberId));
        for (const bucket of buckets) {
          const nextDay = new Date(`${bucket.key}T00:00:00.000Z`);
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          const query = {
            journeyId,
            authoritativeOnly: true,
            memberId:
              dimension === "PARTICIPANT" && scope === "GROUP" ? bucket.key : memberId,
            scope:
              dimension === "PARTICIPANT" && scope === "GROUP"
                ? ("MINE" as const)
                : scope,
            ...(dimension === "CATEGORY" ? { category: bucket.key } : {}),
            ...(dimension === "PAYER" ? { payerMemberId: bucket.key } : {}),
            ...(dimension === "PARTICIPANT" ? { participantMemberId: bucket.key } : {}),
            ...(dimension === "CURRENCY" ? { currency: bucket.key } : {}),
            ...(dimension === "DAY"
              ? {
                  from: `${bucket.key}T00:00:00.000Z`,
                  to: nextDay.toISOString(),
                }
              : {}),
          };
          const drilldown = await repository.listExpenses(query, 1000);
          expect(drilldown.every((row) => row.isAuthoritative)).toBe(true);
          expect(drilldown.map((row) => row.id).sort()).toEqual(
            bucket.includedExpenseIds,
          );
          expect(
            drilldown.reduce((total, row) => total + (row.componentMinor ?? 0), 0),
          ).toBe(bucket.totalMinor);
        }
      }
    }
    sqlite.close();
  });

  it("keeps a representative 10,000 Expense filter query near the 250 ms target", async () => {
    const { adapter, sqlite } = database();
    sqlite.exec(
      "INSERT INTO ledger_journeys VALUES ('journey', 'Europe', NULL, NULL, 'NZD', 2); INSERT INTO ledger_members VALUES ('a', 'journey', 'Alex');",
    );
    const insertExpense = sqlite.prepare(
      "INSERT INTO ledger_expenses VALUES (?, 'journey', 'a', ?, NULL, ?, ?, 100, 'NZD', 2, 'ACCEPTED', 'INCLUDED', 'SYNCED', NULL)",
    );
    const insertParticipant = sqlite.prepare(
      "INSERT INTO ledger_expense_participants VALUES (?, 'a', 'Alex')",
    );
    const insertSplit = sqlite.prepare(
      "INSERT INTO ledger_expense_splits VALUES (?, 'a', 100)",
    );
    const insertValuation = sqlite.prepare(
      "INSERT INTO ledger_valuation_snapshots VALUES (?, ?, 100, 'NZD', 2, 1)",
    );
    sqlite.exec("BEGIN");
    for (let index = 0; index < 10_000; index += 1) {
      const id = `expense-${index}`;
      insertExpense.run(
        id,
        `Expense ${index}`,
        index % 2 ? "food" : "transport",
        "2026-09-10T08:00:00.000Z",
      );
      insertParticipant.run(id);
      insertSplit.run(id);
      insertValuation.run(`valuation-${index}`, id);
    }
    sqlite.exec("COMMIT");
    const repository = createLedgerReportingRepository(adapter);
    const started = performance.now();
    const result = await repository.summarize({
      journeyId,
      memberId,
      scope: "MINE",
      category: "food",
      receipt: "HAS_NOT",
    });
    const elapsedMs = performance.now() - started;
    expect(result).toMatchObject({ totalMinor: 500_000, expenseCount: 5000 });
    expect(elapsedMs).toBeLessThan(250);
    sqlite.close();
  });
});
