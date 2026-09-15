import type * as SQLite from "expo-sqlite";

import type {
  LedgerJourneyContext,
  MyLedgerPeriod,
} from "@/domain/ledger/journeyContext";
import type {
  ReportingAggregate,
  ReportingBucket,
  ReportingDimension,
  ReportingFilters,
  ReportingScope,
} from "@/domain/ledger/reporting";

export type LedgerReportingDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync"
>;

export type LedgerReportQuery = ReportingFilters & {
  journeyId: string;
  memberId: string;
  scope: ReportingScope;
  authoritativeOnly?: boolean;
};

export type LedgerJourneyOption = LedgerJourneyContext & {
  hasActor: boolean;
  memberCount: number;
};

export type LedgerPreferences = {
  defaultCurrency: string;
  debugMode: boolean;
};

export type LedgerReportListItem = {
  id: string;
  title: string;
  category: string;
  occurredAt: string;
  payerMemberId: string;
  payerName: string;
  originalMinor: number;
  originalCurrency: string;
  originalScale: number;
  settlementMinor: number | null;
  settlementCurrency: string;
  settlementScale: number;
  componentMinor: number | null;
  participantCount: number;
  businessStatus: string;
  settlementParticipation: "INCLUDED" | "EXCLUDED";
  syncStatus: string;
  hasReceipt: boolean;
  hasOpenConflict: boolean;
  isAuthoritative: boolean;
};

type SummaryRow = {
  totalMinor: number | null;
  expenseCount: number;
  includedExpenseIds: string | null;
  unresolvedRateCount: number;
  openConflictCount: number;
};

type BucketRow = SummaryRow & { key: string; label: string };

const conflictSql = `EXISTS (
  SELECT 1 FROM ledger_expense_conflicts c
  WHERE c.expense_id = e.id AND c.status = 'OPEN'
)`;
const receiptSql = `EXISTS (
  SELECT 1 FROM ledger_receipt_assets r WHERE r.expense_id = e.id
)`;
const authoritativeSql = `(e.business_status = 'ACCEPTED'
  AND v.id IS NOT NULL AND NOT ${conflictSql})`;

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function where(query: LedgerReportQuery, alias = "e") {
  const clauses = [`${alias}.journey_id = ?`];
  const params: SQLite.SQLiteBindValue[] = [query.journeyId];
  if (query.businessStatus) {
    clauses.push(`${alias}.business_status = ?`);
    params.push(query.businessStatus);
  } else {
    clauses.push(`${alias}.deleted_at IS NULL`);
  }
  const values: [keyof ReportingFilters, string][] = [
    ["from", `${alias}.occurred_at >= ?`],
    ["to", `${alias}.occurred_at < ?`],
    ["category", `${alias}.category = ?`],
    ["payerMemberId", `${alias}.payer_member_id = ?`],
    ["currency", `${alias}.original_currency = ?`],
    ["syncStatus", `${alias}.sync_status = ?`],
  ];
  for (const [key, sql] of values) {
    const value = query[key];
    if (typeof value === "string" && value) {
      clauses.push(sql);
      params.push(value);
    }
  }
  if (query.participantMemberId) {
    clauses.push(`EXISTS (SELECT 1 FROM ledger_expense_participants ep
      WHERE ep.expense_id = ${alias}.id AND ep.member_id = ?)`);
    params.push(query.participantMemberId);
  }
  if (query.query?.trim()) {
    clauses.push(`(
      LOWER(${alias}.title || ' ' || COALESCE(${alias}.description, '') || ' ' || ${alias}.category) LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM ledger_members lm
        WHERE lm.id = ${alias}.payer_member_id AND LOWER(lm.display_name) LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM ledger_expense_participants ep
        WHERE ep.expense_id = ${alias}.id AND LOWER(ep.display_name_snapshot) LIKE ? ESCAPE '\\')
    )`);
    const needle = `%${escapeLike(query.query.trim().replace(/[A-Z]/g, (character) => character.toLowerCase()))}%`;
    params.push(needle, needle, needle);
  }
  if (query.conflict)
    clauses.push(`${conflictSql} = ${query.conflict === "OPEN" ? 1 : 0}`);
  if (query.valuation)
    clauses.push(
      query.valuation === "RATE_REQUIRED"
        ? `${alias}.business_status = 'RATE_REQUIRED'`
        : `${alias}.business_status = 'ACCEPTED' AND v.id IS NOT NULL`,
    );
  if (query.receipt) clauses.push(`${receiptSql} = ${query.receipt === "HAS" ? 1 : 0}`);
  if (query.authoritativeOnly)
    clauses.push(
      `${authoritativeSql} AND ${query.scope === "GROUP" ? "v.settlement_amount_minor" : "mine.settlement_amount_minor"} IS NOT NULL`,
    );
  return { sql: clauses.join(" AND "), params };
}

function ids(value: string | null) {
  return value ? value.split(",").sort() : [];
}

function visibleExpenseSql(scope: ReportingScope) {
  return scope === "GROUP"
    ? "1"
    : "mine.expense_id IS NOT NULL AND (mine.settlement_amount_minor IS NULL OR mine.settlement_amount_minor <> 0)";
}

export function createLedgerReportingRepository(database: LedgerReportingDatabase) {
  return {
    async listJourneys() {
      const rows = await database.getAllAsync<
        Omit<LedgerJourneyOption, "hasActor"> & { hasActor: number }
      >(
        `SELECT source.*,
           (SELECT COUNT(*) FROM ledger_members member
             WHERE member.journey_id = source.journeyId) AS memberCount,
           EXISTS (SELECT 1 FROM ledger_actor_context actor
             WHERE actor.journey_id = source.journeyId AND actor.member_id IS NOT NULL) AS hasActor
         FROM (
           SELECT journey_id AS journeyId, COALESCE(title, 'Journey') AS title,
             start_date AS startDate, end_date AS endDate,
             settlement_currency AS settlementCurrency, settlement_scale AS settlementScale
           FROM ledger_journeys
           UNION ALL
           SELECT s.journey_id, s.title, s.start_date, s.end_date, s.currency, s.scale
           FROM ledger_my_journey_summaries s
           WHERE NOT EXISTS (SELECT 1 FROM ledger_journeys j WHERE j.journey_id = s.journey_id)
             AND s.period_key = 'ALL'
         ) source ORDER BY COALESCE(startDate, endDate, '') DESC, title`,
      );
      return rows.map((row) => ({ ...row, hasActor: Boolean(row.hasActor) }));
    },

    getActorMemberId(journeyId: string) {
      return database.getFirstAsync<{ memberId: string | null }>(
        "SELECT member_id AS memberId FROM ledger_actor_context WHERE journey_id = ?",
        journeyId,
      );
    },

    async listFilterOptions(journeyId: string) {
      const [categories, currencies, members] = await Promise.all([
        database.getAllAsync<{ value: string }>(
          "SELECT DISTINCT category AS value FROM ledger_expenses WHERE journey_id = ? ORDER BY value",
          journeyId,
        ),
        database.getAllAsync<{ value: string }>(
          "SELECT DISTINCT original_currency AS value FROM ledger_expenses WHERE journey_id = ? ORDER BY value",
          journeyId,
        ),
        database.getAllAsync<{ id: string; label: string }>(
          "SELECT id, display_name AS label FROM ledger_members WHERE journey_id = ? ORDER BY label",
          journeyId,
        ),
      ]);
      return {
        categories: categories.map((item) => item.value),
        currencies: currencies.map((item) => item.value),
        members,
      };
    },

    async getSelectedJourneyId() {
      return (
        (
          await database.getFirstAsync<{ selectedJourneyId: string | null }>(
            "SELECT selected_journey_id AS selectedJourneyId FROM ledger_preferences WHERE id = 1",
          )
        )?.selectedJourneyId ?? null
      );
    },

    async getPreferences(): Promise<LedgerPreferences> {
      const row = await database.getFirstAsync<{
        defaultCurrency: string;
        debugMode: number;
      }>(
        `SELECT default_currency AS defaultCurrency, debug_mode AS debugMode
         FROM ledger_preferences WHERE id = 1`,
      );
      return {
        defaultCurrency: row?.defaultCurrency ?? "NZD",
        debugMode: Boolean(row?.debugMode),
      };
    },

    async setDefaultCurrency(defaultCurrency: string) {
      await database.runAsync(
        `INSERT INTO ledger_preferences
           (id, selected_journey_id, default_currency, debug_mode, updated_at)
         VALUES (1, NULL, ?, 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           default_currency = excluded.default_currency,
           updated_at = excluded.updated_at`,
        defaultCurrency,
        new Date().toISOString(),
      );
    },

    async setDebugMode(debugMode: boolean) {
      await database.runAsync(
        `INSERT INTO ledger_preferences
           (id, selected_journey_id, default_currency, debug_mode, updated_at)
         VALUES (1, NULL, 'NZD', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           debug_mode = excluded.debug_mode,
           updated_at = excluded.updated_at`,
        debugMode ? 1 : 0,
        new Date().toISOString(),
      );
    },

    async selectJourney(journeyId: string | null) {
      await database.runAsync(
        `INSERT INTO ledger_preferences
           (id, selected_journey_id, default_currency, debug_mode, updated_at)
         VALUES (1, ?, 'NZD', 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           selected_journey_id = excluded.selected_journey_id,
           updated_at = excluded.updated_at`,
        journeyId,
        new Date().toISOString(),
      );
    },

    async hasOpenConflict(expenseId: string) {
      return Boolean(
        await database.getFirstAsync(
          "SELECT 1 FROM ledger_expense_conflicts WHERE expense_id = ? AND status = 'OPEN' LIMIT 1",
          expenseId,
        ),
      );
    },

    async listExpenses(query: LedgerReportQuery, limit = 50, offset = 0) {
      const filtered = where(query);
      const component =
        query.scope === "GROUP"
          ? "v.settlement_amount_minor"
          : "mine.settlement_amount_minor";
      const rows = await database.getAllAsync<
        Omit<
          LedgerReportListItem,
          "hasReceipt" | "hasOpenConflict" | "isAuthoritative"
        > & {
          hasReceipt: number;
          hasOpenConflict: number;
          isAuthoritative: number;
        }
      >(
        `SELECT e.id, e.title, e.category, e.occurred_at AS occurredAt,
          e.payer_member_id AS payerMemberId, COALESCE(payer.display_name, 'Traveller') AS payerName,
          e.original_amount_minor AS originalMinor, e.original_currency AS originalCurrency,
          e.original_scale AS originalScale, v.settlement_amount_minor AS settlementMinor,
          COALESCE(v.settlement_currency, j.settlement_currency) AS settlementCurrency,
          COALESCE(v.settlement_scale, j.settlement_scale) AS settlementScale,
          ${component} AS componentMinor,
          (SELECT COUNT(*) FROM ledger_expense_participants participants
            WHERE participants.expense_id = e.id) AS participantCount,
          e.business_status AS businessStatus,
          e.settlement_participation AS settlementParticipation,
          e.sync_status AS syncStatus, ${receiptSql} AS hasReceipt,
          ${conflictSql} AS hasOpenConflict, ${authoritativeSql} AS isAuthoritative
         FROM ledger_expenses e
         JOIN ledger_journeys j ON j.journey_id = e.journey_id
         LEFT JOIN ledger_members payer ON payer.id = e.payer_member_id
         LEFT JOIN ledger_valuation_snapshots v ON v.expense_id = e.id AND v.is_active = 1
         LEFT JOIN ledger_expense_splits mine ON mine.expense_id = e.id AND mine.member_id = ?
         WHERE ${filtered.sql} AND ${visibleExpenseSql(query.scope)}
         ORDER BY e.occurred_at DESC, e.id
         LIMIT ? OFFSET ?`,
        query.memberId,
        ...filtered.params,
        limit,
        offset,
      );
      return rows.map((row) => ({
        ...row,
        hasReceipt: Boolean(row.hasReceipt),
        hasOpenConflict: Boolean(row.hasOpenConflict),
        isAuthoritative: Boolean(row.isAuthoritative) && row.componentMinor !== null,
      }));
    },

    async countExpenses(query: LedgerReportQuery) {
      const filtered = where(query);
      const row = await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM ledger_expenses e
         JOIN ledger_journeys j ON j.journey_id = e.journey_id
         LEFT JOIN ledger_valuation_snapshots v ON v.expense_id = e.id AND v.is_active = 1
         LEFT JOIN ledger_expense_splits mine ON mine.expense_id = e.id AND mine.member_id = ?
         WHERE ${filtered.sql} AND ${visibleExpenseSql(query.scope)}`,
        query.memberId,
        ...filtered.params,
      );
      return row?.count ?? 0;
    },

    async summarize(query: LedgerReportQuery): Promise<ReportingAggregate> {
      const filtered = where(query);
      const component =
        query.scope === "GROUP"
          ? "v.settlement_amount_minor"
          : "mine.settlement_amount_minor";
      const eligible = `${authoritativeSql} AND ${component} IS NOT NULL`;
      const relevant = query.scope === "GROUP" ? "1" : "mine.expense_id IS NOT NULL";
      const row = await database.getFirstAsync<SummaryRow>(
        `SELECT COALESCE(SUM(CASE WHEN ${eligible} THEN ${component} ELSE 0 END), 0) AS totalMinor,
          COUNT(CASE WHEN ${eligible} THEN 1 END) AS expenseCount,
          GROUP_CONCAT(CASE WHEN ${eligible} THEN e.id END) AS includedExpenseIds,
          COUNT(CASE WHEN ${relevant} AND e.business_status = 'RATE_REQUIRED' THEN 1 END) AS unresolvedRateCount,
          COUNT(CASE WHEN ${relevant} AND ${conflictSql} THEN 1 END) AS openConflictCount
         FROM ledger_expenses e
         LEFT JOIN ledger_valuation_snapshots v ON v.expense_id = e.id AND v.is_active = 1
         LEFT JOIN ledger_expense_splits mine ON mine.expense_id = e.id AND mine.member_id = ?
         WHERE ${filtered.sql}`,
        query.memberId,
        ...filtered.params,
      );
      return {
        totalMinor: row?.totalMinor ?? 0,
        expenseCount: row?.expenseCount ?? 0,
        includedExpenseIds: ids(row?.includedExpenseIds ?? null),
        unresolvedRateCount: row?.unresolvedRateCount ?? 0,
        openConflictCount: row?.openConflictCount ?? 0,
      };
    },

    async analyze(
      query: LedgerReportQuery,
      dimension: ReportingDimension,
    ): Promise<ReportingBucket[]> {
      const filtered = where(query);
      const dimensionSql = {
        CATEGORY: ["e.category", "e.category"],
        DAY: ["substr(e.occurred_at, 1, 10)", "substr(e.occurred_at, 1, 10)"],
        PAYER: ["e.payer_member_id", "COALESCE(payer.display_name, 'Traveller')"],
        CURRENCY: ["e.original_currency", "e.original_currency"],
        PARTICIPANT: ["part.member_id", "part.display_name_snapshot"],
      }[dimension];
      const participantJoin =
        dimension === "PARTICIPANT"
          ? `JOIN ledger_expense_splits partSplit ON partSplit.expense_id = e.id
             JOIN ledger_expense_participants part ON part.expense_id = e.id AND part.member_id = partSplit.member_id`
          : "LEFT JOIN ledger_expense_participants part ON 0";
      const amount =
        dimension === "PARTICIPANT" && query.scope === "GROUP"
          ? "partSplit.settlement_amount_minor"
          : query.scope === "GROUP"
            ? "v.settlement_amount_minor"
            : "mine.settlement_amount_minor";
      const ownParticipant =
        dimension === "PARTICIPANT" && query.scope === "MINE"
          ? "AND part.member_id = ?"
          : "";
      const params = [query.memberId, ...filtered.params];
      if (ownParticipant) params.push(query.memberId);
      const rows = await database.getAllAsync<BucketRow>(
        `SELECT ${dimensionSql[0]} AS key, ${dimensionSql[1]} AS label,
          SUM(${amount}) AS totalMinor, COUNT(DISTINCT e.id) AS expenseCount,
          GROUP_CONCAT(DISTINCT e.id) AS includedExpenseIds,
          0 AS unresolvedRateCount, 0 AS openConflictCount
         FROM ledger_expenses e
         LEFT JOIN ledger_members payer ON payer.id = e.payer_member_id
         LEFT JOIN ledger_valuation_snapshots v ON v.expense_id = e.id AND v.is_active = 1
         LEFT JOIN ledger_expense_splits mine ON mine.expense_id = e.id AND mine.member_id = ?
         ${participantJoin}
         WHERE ${filtered.sql} AND ${authoritativeSql} AND ${amount} IS NOT NULL ${ownParticipant}
         GROUP BY ${dimensionSql[0]}, ${dimensionSql[1]}
         ORDER BY ${dimension === "DAY" ? "key ASC" : "totalMinor DESC, label"}`,
        ...params,
      );
      return rows.map((row) => ({
        key: row.key,
        label: row.label,
        totalMinor: row.totalMinor ?? 0,
        expenseCount: row.expenseCount,
        includedExpenseIds: ids(row.includedExpenseIds),
        unresolvedRateCount: 0,
        openConflictCount: 0,
      }));
    },

    listMyLedger(period: MyLedgerPeriod) {
      return database.getAllAsync<{
        journeyId: string;
        title: string;
        startDate: string | null;
        endDate: string | null;
        currency: string;
        scale: number;
        mySpendMinor: number;
        paidMinor: number;
        positionMinor: number;
        unvaluedCount: number;
        conflictCount: number;
        updatedAt: string;
      }>(
        `SELECT journey_id AS journeyId, title, start_date AS startDate,
          end_date AS endDate, currency, scale, my_spend_minor AS mySpendMinor,
          paid_minor AS paidMinor, position_minor AS positionMinor,
          unvalued_count AS unvaluedCount, conflict_count AS conflictCount,
          updated_at AS updatedAt
         FROM ledger_my_journey_summaries WHERE period_key = ?
         ORDER BY COALESCE(start_date, end_date, '') DESC, title`,
        period,
      );
    },
  };
}
