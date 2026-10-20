import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerFxSnapshotRepository } from "@/data/repositories/defaultLedgerFxSnapshotRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import type { RateQuote } from "@/domain/ledger/types";

import { loadEstimatedSettlement } from "./loadEstimatedSettlement";
import {
  analyticalSpending,
  displayCurrencies,
  journeyInPeriod,
  personalSpendingMaterial,
  spendingDate,
  type Period,
  type PersonalExpense,
  type PersonalSpendingRow,
} from "./myLedgerAnalytics";
import { savedSettlementSummaryProjection } from "./settlementSummaryProjection";

export async function loadMyLedger(
  period: Period,
  currency: string | null,
  section: "SPENDING" | "SETTLEMENTS",
  now = new Date(),
) {
  const year = now.getFullYear();
  const [reports, expensesRepo, settlementsRepo, snapshotRepo] = await Promise.all([
    getDefaultLedgerReportingRepository(),
    getDefaultLedgerExpenseRepository(),
    getDefaultLedgerSettlementRepository(),
    getDefaultLedgerFxSnapshotRepository(),
  ]);
  const [localJourneys, summaries, narrowFacts, hasNarrowSnapshot, preference, bundle] =
    await Promise.all([
      reports.listJourneys(),
      reports.listMyLedger(period),
      reports.listMyLedgerSpendingFacts(period),
      reports.hasMyLedgerSpendingSnapshot(period),
      reports.getPreferences(),
      snapshotRepo.list(),
    ]);
  const factsByJourney = new Map<string, typeof narrowFacts>();
  for (const fact of narrowFacts) {
    const rows = factsByJourney.get(fact.journeyId) ?? [];
    rows.push(fact);
    factsByJourney.set(fact.journeyId, rows);
  }
  const known = new Set(localJourneys.map((journey) => journey.journeyId));
  const journeys = [
    ...localJourneys,
    ...summaries
      .filter((row) => !known.has(row.journeyId))
      .map((row) => ({
        journeyId: row.journeyId,
        title: row.title,
        startDate: row.startDate,
        endDate: row.endDate,
        settlementCurrency: row.currency,
        settlementScale: row.scale,
        hasActor: false,
        memberCount: 0,
      })),
  ];
  const loaded = await Promise.all(
    journeys.map(async (journey) => {
      const [actor, expenses] = await Promise.all([
        reports.getActorMemberId(journey.journeyId),
        journey.hasActor
          ? expensesRepo.listExpensesForJourney(journey.journeyId)
          : Promise.resolve([]),
      ]);
      if (!actor?.memberId)
        return {
          journey,
          expenses: [] as PersonalExpense[],
          facts: factsByJourney.get(journey.journeyId) ?? [],
          memberId: null,
          conflicts: new Set<string>(),
        };
      const memberId = actor.memberId;
      const query = {
        journeyId: journey.journeyId,
        memberId,
        scope: "GROUP" as const,
      };
      const count = await reports.countExpenses(query);
      const list = count ? await reports.listExpenses(query, count) : [];
      return {
        journey,
        expenses: expenses.map((expense) => ({ expense, memberId })),
        facts: (factsByJourney.get(journey.journeyId) ?? []).filter(
          (fact) =>
            !expenses.some(
              (expense) =>
                expense.id === fact.expenseId || expense.serverId === fact.expenseId,
            ),
        ),
        memberId,
        conflicts: new Set(
          list.filter((item) => item.hasOpenConflict).map((item) => item.id),
        ),
      };
    }),
  );
  const involved = loaded.filter(
    ({ journey, expenses, facts }) =>
      journeyInPeriod(journey, period, year) ||
      (period === "YEAR" &&
        (expenses.some(({ expense }) => spendingDate(expense).startsWith(`${year}-`)) ||
          facts?.some((fact) =>
            (fact.economicDate ?? fact.occurredAt.slice(0, 10)).startsWith(`${year}-`),
          ))),
  );
  const options = displayCurrencies(involved.map((item) => item.journey));
  const selected =
    (currency && options.includes(currency) ? currency : null) ??
    (options.includes(preference.defaultCurrency)
      ? preference.defaultCurrency
      : (options[0] ?? "NZD"));
  const spendingRows: PersonalSpendingRow[] = involved.flatMap(
    ({ expenses, facts, conflicts }) => [
      ...expenses.filter(({ expense }) => !conflicts.has(expense.id)),
      ...(facts ?? []).map((fact) => ({ fact })),
    ],
  );
  const pairs = [
    ...new Set(
      spendingRows.map((row) => {
        const item = personalSpendingMaterial(row);
        return `${item.journeyId}:${item.currency}:${selected}`;
      }),
    ),
  ].filter((pair) => pair.split(":")[1] !== selected);
  const quotes = new Map<string, RateQuote[]>(
    await Promise.all(
      pairs.map(async (pair) => {
        const [journeyId, source, target] = pair.split(":");
        return [
          pair,
          await expensesRepo.listRateQuotes(journeyId, source, target),
        ] as const;
      }),
    ),
  );
  const spending = analyticalSpending(
    spendingRows,
    period,
    year,
    selected,
    bundle?.snapshots ?? [],
    quotes,
  );
  const incompleteJourneyCount = hasNarrowSnapshot
    ? 0
    : involved.filter(({ journey }) => !journey.hasActor).length;
  const settlements =
    section === "SPENDING"
      ? []
      : await Promise.all(
          involved.map(async ({ journey, memberId }) => {
            if (!memberId)
              return {
                journey,
                projection: null,
                status: "Saved Journey data unavailable",
              };
            try {
              const [preview, finalized, pending] = await Promise.all([
                loadEstimatedSettlement(journey.journeyId),
                settlementsRepo.listFinalized(journey.journeyId),
                settlementsRepo.hasPendingFinancialOperations(journey.journeyId),
              ]);
              const root =
                finalized.find((item) => item.kind !== "ADJUSTMENT") ??
                finalized[0] ??
                null;
              const projection = savedSettlementSummaryProjection(
                preview,
                root,
                memberId,
                pending,
              );
              return {
                journey,
                projection,
                status: !projection
                  ? "Saved Journey data unavailable"
                  : preview.blockers.length
                    ? `${preview.blockers.length} expenses need attention`
                    : null,
              };
            } catch {
              return {
                journey,
                projection: null,
                status: "Saved Journey data unavailable",
              };
            }
          }),
        );
  return {
    period,
    section,
    currency: selected,
    options,
    spending,
    incompleteJourneyCount,
    settlements,
  };
}
