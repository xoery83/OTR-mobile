import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  analyzeReporting,
  summarizeReporting,
  type ReportingRecord,
} from "@/domain/ledger/reporting";
import { migrations } from "@/data/db/migrations";
import {
  buildSpendingAnalysis,
  analysisDateBounds,
} from "@/domain/ledger/spendingAnalysis";

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
    CREATE INDEX ledger_members_journey ON ledger_members(journey_id);
    CREATE TABLE ledger_actor_context (user_id TEXT, journey_id TEXT, member_id TEXT,
      PRIMARY KEY(user_id, journey_id));
    CREATE TABLE ledger_expenses (id TEXT PRIMARY KEY, server_id TEXT, journey_id TEXT, payer_member_id TEXT,
      title TEXT, description TEXT, category TEXT, occurred_at TEXT,
      original_amount_minor INTEGER, original_currency TEXT, original_scale INTEGER,
      business_status TEXT, settlement_participation TEXT, sync_status TEXT, deleted_at TEXT,
      local_owner_user_id TEXT, updated_at TEXT NOT NULL DEFAULT '2026-09-12T08:00:00.000Z');
    CREATE INDEX ledger_expenses_journey_occurred ON ledger_expenses(journey_id, occurred_at DESC, id);
    CREATE TABLE ledger_expense_participants (expense_id TEXT, member_id TEXT,
      display_name_snapshot TEXT, PRIMARY KEY(expense_id, member_id));
    CREATE TABLE ledger_expense_splits (expense_id TEXT, member_id TEXT,
      original_amount_minor INTEGER, settlement_amount_minor INTEGER, PRIMARY KEY(expense_id, member_id));
    CREATE TABLE ledger_valuation_snapshots (id TEXT PRIMARY KEY, expense_id TEXT,
      settlement_amount_minor INTEGER, settlement_currency TEXT, settlement_scale INTEGER,
      is_active INTEGER);
    CREATE INDEX ledger_valuation_expense ON ledger_valuation_snapshots(expense_id) WHERE is_active = 1;
    CREATE TABLE ledger_expense_conflicts (expense_id TEXT, status TEXT);
    CREATE INDEX ledger_conflicts_expense ON ledger_expense_conflicts(expense_id, status);
    CREATE TABLE ledger_receipt_assets (expense_id TEXT);
    CREATE INDEX ledger_receipts_expense ON ledger_receipt_assets(expense_id);
    CREATE TABLE ledger_settlements (journey_id TEXT,
      correction_source_expense_id TEXT, correction_successor_expense_id TEXT);
    CREATE INDEX ledger_settlements_journey ON ledger_settlements(journey_id);
    CREATE TABLE ledger_preferences (id INTEGER PRIMARY KEY, selected_journey_id TEXT,
      default_currency TEXT NOT NULL DEFAULT 'NZD', debug_mode INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT);
    CREATE TABLE account_local_state (user_id TEXT PRIMARY KEY, selected_journey_id TEXT,
      default_currency TEXT NOT NULL DEFAULT 'NZD', updated_at TEXT);
    CREATE TABLE ledger_my_journey_summaries (user_id TEXT, journey_id TEXT,
      period_key TEXT, title TEXT,
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
    INSERT INTO ledger_actor_context VALUES ('user-a', 'journey', 'a');
    INSERT INTO ledger_expenses (id, server_id, journey_id, payer_member_id, title, description, category, occurred_at, original_amount_minor, original_currency, original_scale, business_status, settlement_participation, sync_status, deleted_at, local_owner_user_id) VALUES
      ('valued', 'valued', 'journey', 'a', 'Dinner', NULL, 'food', '2026-09-10T08:00:00.000Z', 1000, 'EUR', 2, 'ACCEPTED', 'INCLUDED', 'PENDING_CREATE', NULL, 'user-a'),
      ('rate', 'rate', 'journey', 'b', 'Taxi', NULL, 'transport', '2026-09-11T08:00:00.000Z', 500, 'EUR', 2, 'RATE_REQUIRED', 'INCLUDED', 'SYNCED', NULL, NULL),
      ('conflict', 'conflict', 'journey', 'a', 'Hotel', NULL, 'hotel', '2026-09-12T08:00:00.000Z', 4000, 'NZD', 2, 'ACCEPTED', 'INCLUDED', 'CONFLICT', NULL, 'user-a');
    INSERT INTO ledger_expense_participants VALUES
      ('valued', 'a', 'Alex'), ('valued', 'b', 'Bea'), ('rate', 'a', 'Alex'), ('conflict', 'a', 'Alex');
    INSERT INTO ledger_expense_splits VALUES
      ('valued', 'a', 600, 1200), ('valued', 'b', 400, 800), ('rate', 'a', 500, NULL), ('conflict', 'a', 4000, 4000);
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
  it("keeps date-only expenses in the same calendar bucket and drilldown", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    sqlite.exec("UPDATE ledger_expenses SET occurred_at = substr(occurred_at, 1, 10)");
    const repository = createLedgerReportingRepository(adapter, () =>
      Promise.resolve("user-a"),
    );
    const range = analysisDateBounds("2026-09-10", "2026-09-10")!;
    const query = {
      journeyId,
      memberId,
      scope: "MINE" as const,
      analysisState: "INCLUDED" as const,
      ...range,
    };
    const projection = await repository.loadSpendingAnalysisProjection(
      journeyId,
      memberId,
      range,
    );
    expect(projection.expenses.map((item) => item.id)).toEqual(["valued"]);
    expect(
      buildSpendingAnalysis(projection, memberId, "MINE", range, "2026-09-29")
        .expenseCount,
    ).toBe(1);
    expect((await repository.listExpenses(query)).map((item) => item.id)).toEqual([
      "valued",
    ]);
    expect(await repository.countExpenses(query)).toBe(1);
    expect((await repository.summarize(query)).totalMinor).toBe(1200);
    sqlite.close();
  });
  it("loads all Dashboard inputs in one account-scoped statement and keeps incomplete records", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    let reads = 0;
    const counted = {
      ...adapter,
      async getFirstAsync<T>(sql: string, ...args: unknown[]) {
        reads++;
        return adapter.getFirstAsync<T>(sql, ...(args as never[]));
      },
    };
    const repository = createLedgerReportingRepository(counted, async () => "user-a");
    const data = await repository.loadSpendingAnalysisProjection(journeyId, memberId);
    expect(reads).toBe(1);
    expect(data.expenses).toHaveLength(3);
    expect(data.members).toHaveLength(2);
    const mine = buildSpendingAnalysis(data, memberId, "MINE", {}, "2026-09-29");
    expect(mine).toMatchObject({ totalMinor: 1200, expenseCount: 1 });
    expect(mine.incomplete.map((item) => item.id).sort()).toEqual(["conflict", "rate"]);
    const group = buildSpendingAnalysis(data, memberId, "GROUP", {}, "2026-09-29");
    expect(group.totalMinor).toBe(2000);
    expect(group.travellers.find((member) => member.key === "b")?.totalMinor).toBe(800);
    expect(group.payers[0]?.totalMinor).toBe(2000);
    // Toggles, expansions, filters and chart selections have no Repository ownership.
    expect(reads).toBe(1);
    await expect(
      createLedgerReportingRepository(
        adapter,
        async () => "other-account",
      ).loadSpendingAnalysisProjection(journeyId, memberId),
    ).rejects.toThrow("not available locally");
    sqlite.close();
  });

  it("applies range in the consolidated query and refreshes once on Detail return", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    let reads = 0;
    const counted = {
      ...adapter,
      async getFirstAsync<T>(sql: string, ...args: unknown[]) {
        reads++;
        return adapter.getFirstAsync<T>(sql, ...(args as never[]));
      },
    };
    const repository = createLedgerReportingRepository(counted, async () => "user-a");
    const range = analysisDateBounds("2026-09-10", "2026-09-10")!;
    const data = await repository.loadSpendingAnalysisProjection(
      journeyId,
      memberId,
      range,
    );
    expect(data.expenses.map((item) => item.id)).toEqual(["valued"]);
    expect(reads).toBe(1);
    sqlite.exec(
      "UPDATE ledger_expense_splits SET settlement_amount_minor = 1300 WHERE expense_id = 'valued' AND member_id = 'a'",
    );
    const refreshed = await repository.loadSpendingAnalysisProjection(
      journeyId,
      memberId,
      range,
    );
    expect(
      buildSpendingAnalysis(refreshed, memberId, "MINE", range, "2026-09-29").totalMinor,
    ).toBe(1300);
    expect(reads).toBe(2);
    const empty = await repository.loadSpendingAnalysisProjection(
      journeyId,
      memberId,
      analysisDateBounds("2026-09-20", "2026-09-21")!,
    );
    expect(empty.expenses).toEqual([]);
    expect(empty.hasExpensesOutsideRange).toBe(true);
    sqlite.close();
  });

  it("retains settlement-excluded local accepted spending and rejects deleted/correction predecessors", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    const repository = createLedgerReportingRepository(adapter, async () => "user-a");
    sqlite.exec(
      "UPDATE ledger_expenses SET settlement_participation = 'EXCLUDED' WHERE id = 'valued'",
    );
    expect(
      buildSpendingAnalysis(
        await repository.loadSpendingAnalysisProjection(journeyId, memberId),
        memberId,
        "GROUP",
        {},
        "2026-09-29",
      ).totalMinor,
    ).toBe(2000);
    sqlite.exec(
      "INSERT INTO ledger_settlements VALUES ('journey', 'valued', 'successor')",
    );
    expect(
      (
        await repository.loadSpendingAnalysisProjection(journeyId, memberId)
      ).expenses.some((expense) => expense.id === "valued"),
    ).toBe(false);
    sqlite.exec("UPDATE ledger_expenses SET deleted_at = '2026-09-29' WHERE id = 'rate'");
    expect(
      (await repository.loadSpendingAnalysisProjection(journeyId, memberId)).expenses.map(
        (expense) => expense.id,
      ),
    ).toEqual(["conflict"]);
    sqlite.close();
  });

  it("matches exact category/member/payer drilldowns including zero shares and incomplete identities", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    sqlite.exec(
      "UPDATE ledger_expense_splits SET settlement_amount_minor = 0 WHERE expense_id = 'valued' AND member_id = 'a'",
    );
    const repository = createLedgerReportingRepository(adapter, async () => "user-a");
    const query = {
      journeyId,
      memberId,
      scope: "MINE" as const,
      analysisState: "INCLUDED" as const,
      categories: ["food", "other"],
      payerMemberId: "a",
    };
    expect((await repository.listExpenses(query)).map((expense) => expense.id)).toEqual([
      "valued",
    ]);
    expect(await repository.countExpenses(query)).toBe(1);
    expect((await repository.summarize(query)).expenseCount).toBe(1);
    expect(
      (
        await repository.listExpenses({
          journeyId,
          memberId,
          scope: "MINE",
          analysisState: "INCOMPLETE",
        })
      )
        .map((expense) => expense.id)
        .sort(),
    ).toEqual(["conflict", "rate"]);
    expect(
      (
        await repository.listExpenses({
          ...query,
          memberId: "b",
          participantMemberId: "b",
        })
      )[0]?.componentMinor,
    ).toBe(800);
    sqlite.close();
  });

  it("bounds a 10k-Expense long Journey projection with one read and indexed scoped query plans", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    sqlite.exec(
      "UPDATE ledger_journeys SET start_date = '2024-01-01', end_date = '2026-09-30'",
    );
    const insert = sqlite.prepare(
      "INSERT INTO ledger_expenses SELECT ?, ?, journey_id, payer_member_id, title, description, category, ?, original_amount_minor, original_currency, original_scale, business_status, settlement_participation, sync_status, deleted_at, local_owner_user_id, updated_at FROM ledger_expenses WHERE id='valued'",
    );
    const split = sqlite.prepare(
      "INSERT INTO ledger_expense_splits SELECT ?, member_id, original_amount_minor, settlement_amount_minor FROM ledger_expense_splits WHERE expense_id='valued'",
    );
    const valuation = sqlite.prepare(
      "INSERT INTO ledger_valuation_snapshots SELECT ?, ?, settlement_amount_minor, settlement_currency, settlement_scale, is_active FROM ledger_valuation_snapshots WHERE id='v1'",
    );
    sqlite.exec("BEGIN");
    for (let index = 0; index < 10_000; index++) {
      const id = `large-${index}`;
      const date = new Date(Date.UTC(2024, 0, 1 + (index % 900))).toISOString();
      insert.run(id, id, date);
      split.run(id);
      valuation.run(`v-${id}`, id);
    }
    sqlite.exec("COMMIT");
    let reads = 0;
    let queryPlan: string[] = [];
    const counted = {
      ...adapter,
      async getFirstAsync<T>(sql: string, ...args: unknown[]) {
        reads++;
        queryPlan = sqlite
          .prepare(`EXPLAIN QUERY PLAN ${sql}`)
          .all(...(args as never[]))
          .map((row) => String(row.detail));
        return adapter.getFirstAsync<T>(sql, ...(args as never[]));
      },
    };
    const repository = createLedgerReportingRepository(counted, async () => "user-a");
    const started = performance.now();
    const data = await repository.loadSpendingAnalysisProjection(journeyId, memberId);
    const localReadMs = performance.now() - started;
    const cpuStart = performance.now();
    const result = buildSpendingAnalysis(data, memberId, "GROUP", {}, "2026-09-29");
    const cpuMs = performance.now() - cpuStart;
    expect(data.expenses).toHaveLength(10_003);
    expect(data.expenses[0]?.updatedAt).toBe("2026-09-12T08:00:00.000Z");
    expect(result.granularity).toBe("Monthly");
    expect(result.expenseCount).toBe(10_001);
    expect(reads).toBe(1);
    expect(
      queryPlan.some((line) => line.includes("ledger_expenses_journey_occurred")),
    ).toBe(true);
    expect(localReadMs + cpuMs).toBeLessThan(1500);
    const range = analysisDateBounds("2026-09-10", "2026-09-10")!;
    const ranged = await repository.loadSpendingAnalysisProjection(
      journeyId,
      memberId,
      range,
    );
    expect(ranged.expenses).toHaveLength(1);
    expect(
      queryPlan.some(
        (line) => line.includes("occurred_at>?") && line.includes("occurred_at<?"),
      ),
    ).toBe(true);
    const evidence = JSON.stringify({
      analysisPerformance: {
        expenses: data.expenses.length,
        localReads: 1,
        localReadMs: Math.round(localReadMs),
        cpuMs: Math.round(cpuMs),
        rangeReads: 1,
        queryPlan,
      },
    });
    if (process.env.OTR_ANALYSIS_PERFORMANCE_OUTPUT)
      writeFileSync(process.env.OTR_ANALYSIS_PERFORMANCE_OUTPUT, evidence);
    sqlite.close();
  });
  it("discovers summary-only linked Journeys from YEAR without needing ALL", async () => {
    const { adapter, sqlite } = database();
    sqlite.exec(`
      INSERT INTO ledger_journeys VALUES
        ('both', 'Other account cache', NULL, NULL, 'EUR', 2);
      INSERT INTO ledger_my_journey_summaries (
        user_id, journey_id, period_key, title, start_date, end_date,
        currency, scale, my_spend_minor, paid_minor, position_minor,
        unvalued_count, conflict_count, updated_at
      ) VALUES
        ('user-a', 'year-only', 'YEAR', 'Year', NULL, NULL, 'NZD', 2, 0, 0, 0, 0, 0, 'now'),
        ('user-a', 'both', 'YEAR', 'Both', NULL, NULL, 'EUR', 2, 0, 0, 0, 0, 0, 'now'),
        ('user-a', 'both', 'ALL', 'Both', NULL, NULL, 'EUR', 2, 0, 0, 0, 0, 0, 'now'),
        ('user-b', 'private', 'YEAR', 'Private', NULL, NULL, 'NZD', 2, 0, 0, 0, 0, 0, 'now');
    `);
    const journeys = await createLedgerReportingRepository(
      adapter,
      async () => "user-a",
    ).listJourneys();
    expect(journeys.map((journey) => journey.journeyId).sort()).toEqual([
      "both",
      "year-only",
    ]);
    expect(journeys.every((journey) => !journey.hasActor)).toBe(true);
    sqlite.close();
  });
  const activeUser = async () => "user-a";

  it("persists UI preferences without resetting them when the Journey changes", async () => {
    const { adapter, sqlite } = database();
    const repository = createLedgerReportingRepository(adapter, activeUser);

    expect(await repository.getPreferences()).toEqual({
      defaultCurrency: "NZD",
      debugMode: false,
    });
    await repository.setDefaultCurrency("EUR");
    await repository.setDebugMode(true);
    await repository.selectJourney("journey");

    expect(await repository.getPreferences()).toEqual({
      defaultCurrency: "EUR",
      debugMode: true,
    });
    expect(await repository.getSelectedJourneyId()).toBe("journey");
    sqlite.close();
  });

  it("excludes a confirmed correction source from the current projection", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    sqlite.exec(
      `INSERT INTO ledger_settlements VALUES ('journey', 'valued', 'successor')`,
    );
    const repository = createLedgerReportingRepository(adapter, activeUser);

    expect(
      await repository.listExpenses({ journeyId, memberId, scope: "GROUP" }),
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "valued" })]));
    sqlite.close();
  });

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
    const repository = createLedgerReportingRepository(adapter, activeUser);
    expect(
      (await repository.listExpenses({ journeyId, memberId, scope: "MINE" })).find(
        (item) => item.id === "valued",
      )?.originalComponentMinor,
    ).toBe(600);
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
        expect(await repository.countExpenses(query)).toBe(
          (await repository.listExpenses(query, 1000)).length,
        );
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

  it("hides zero and absent personal shares from Mine lists", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    sqlite.exec(`
      INSERT INTO ledger_expenses (id, server_id, journey_id, payer_member_id, title, description, category, occurred_at, original_amount_minor, original_currency, original_scale, business_status, settlement_participation, sync_status, deleted_at, local_owner_user_id) VALUES
        ('zero', 'zero', 'journey', 'b', 'Zero share', NULL, 'food', '2026-09-13T08:00:00.000Z', 100, 'NZD', 2, 'ACCEPTED', 'INCLUDED', 'SYNCED', NULL, NULL),
        ('absent', 'absent', 'journey', 'b', 'Not participating', NULL, 'food', '2026-09-14T08:00:00.000Z', 100, 'NZD', 2, 'ACCEPTED', 'EXCLUDED', 'SYNCED', NULL, NULL);
      INSERT INTO ledger_expense_participants VALUES ('zero', 'a', 'Alex');
      INSERT INTO ledger_expense_splits VALUES ('zero', 'a', 0, 0);
      INSERT INTO ledger_valuation_snapshots VALUES
        ('v-zero', 'zero', 100, 'NZD', 2, 1), ('v-absent', 'absent', 100, 'NZD', 2, 1);
    `);
    const repository = createLedgerReportingRepository(adapter, activeUser);
    const mine = { journeyId, memberId, scope: "MINE" as const };
    const group = { journeyId, memberId, scope: "GROUP" as const };

    expect((await repository.listExpenses(mine)).map((item) => item.id)).toEqual([
      "conflict",
      "rate",
      "valued",
    ]);
    expect(await repository.countExpenses(mine)).toBe(3);
    expect((await repository.listExpenses(group)).map((item) => item.id)).toEqual([
      "absent",
      "zero",
      "conflict",
      "rate",
      "valued",
    ]);
    sqlite.close();
  });

  it("attributes a member's categories to their split instead of the payer", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    const repository = createLedgerReportingRepository(adapter, activeUser);
    const member = { journeyId, memberId: "b", scope: "MINE" as const };
    const group = { journeyId, memberId: "a", scope: "GROUP" as const };

    expect((await repository.summarize(member)).totalMinor).toBe(800);
    expect((await repository.analyze(member, "CATEGORY"))[0].totalMinor).toBe(800);
    expect(
      (
        await repository.listExpenses({
          ...member,
          category: "food",
          authoritativeOnly: true,
        })
      )[0].componentMinor,
    ).toBe(800);
    expect((await repository.summarize(group)).totalMinor).toBe(2000);
    sqlite.close();
  });

  it("shares canonical rows but hides another account's local Ledger changes", async () => {
    const { adapter, sqlite } = database();
    insertFixture(sqlite);
    sqlite.exec("INSERT INTO ledger_actor_context VALUES ('user-b', 'journey', 'b')");
    const repository = createLedgerReportingRepository(adapter, async () => "user-b");

    const rows = await repository.listExpenses({
      journeyId,
      memberId: "b",
      scope: "GROUP",
    });

    expect(rows.map((row) => row.id)).toEqual(["rate"]);
    sqlite.close();
  });

  it("keeps a representative 10,000 Expense filter query near the 250 ms target", async () => {
    const { adapter, sqlite } = database();
    sqlite.exec(
      "INSERT INTO ledger_journeys VALUES ('journey', 'Europe', NULL, NULL, 'NZD', 2); INSERT INTO ledger_members VALUES ('a', 'journey', 'Alex'); INSERT INTO ledger_actor_context VALUES ('user-a', 'journey', 'a');",
    );
    const insertExpense = sqlite.prepare(
      "INSERT INTO ledger_expenses (id, server_id, journey_id, payer_member_id, title, description, category, occurred_at, original_amount_minor, original_currency, original_scale, business_status, settlement_participation, sync_status, deleted_at, local_owner_user_id) VALUES (?, ?, 'journey', 'a', ?, NULL, ?, ?, 100, 'NZD', 2, 'ACCEPTED', 'INCLUDED', 'SYNCED', NULL, NULL)",
    );
    const insertParticipant = sqlite.prepare(
      "INSERT INTO ledger_expense_participants VALUES (?, 'a', 'Alex')",
    );
    const insertSplit = sqlite.prepare(
      "INSERT INTO ledger_expense_splits VALUES (?, 'a', 100, 100)",
    );
    const insertValuation = sqlite.prepare(
      "INSERT INTO ledger_valuation_snapshots VALUES (?, ?, 100, 'NZD', 2, 1)",
    );
    sqlite.exec("BEGIN");
    for (let index = 0; index < 10_000; index += 1) {
      const id = `expense-${index}`;
      insertExpense.run(
        id,
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
    const repository = createLedgerReportingRepository(adapter, activeUser);
    const query = {
      journeyId,
      memberId,
      scope: "MINE" as const,
      category: "food",
      receipt: "HAS_NOT" as const,
    };
    const started = performance.now();
    const [result, count, firstPage] = await Promise.all([
      repository.summarize(query),
      repository.countExpenses(query),
      repository.listExpenses(query, 50),
    ]);
    const elapsedMs = performance.now() - started;
    expect(result).toMatchObject({ totalMinor: 500_000, expenseCount: 5000 });
    expect(count).toBe(5000);
    expect(firstPage).toHaveLength(50);
    expect(elapsedMs).toBeLessThan(250);
    sqlite.close();
  });
});

it("sorts Recent by update time before limiting, preserving ordinary occurrence sorting", async () => {
  const { sqlite, adapter } = database();
  insertFixture(sqlite);
  sqlite.exec(
    "UPDATE ledger_expenses SET updated_at = occurred_at; UPDATE ledger_expenses SET updated_at = '2026-09-28T08:00:00Z' WHERE id = 'valued';",
  );
  const repository = createLedgerReportingRepository(adapter, async () => "user-a");
  const query = { journeyId, memberId, scope: "GROUP" as const };
  expect((await repository.listExpenses({ ...query, order: "UPDATED" }, 1))[0].id).toBe(
    "valued",
  );
  expect((await repository.listExpenses(query, 1))[0].id).toBe("conflict");
});
