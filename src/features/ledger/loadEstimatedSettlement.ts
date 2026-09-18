import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";

import { estimatedSettlement } from "./estimatedSettlement";
import { loadDisplayEstimates } from "./loadDisplayEstimates";

export async function loadEstimatedSettlement(journeyId: string) {
  const reports = await getDefaultLedgerReportingRepository();
  const [journey, options, actor] = await Promise.all([
    reports
      .listJourneys()
      .then((rows) => rows.find((row) => row.journeyId === journeyId)),
    reports.listFilterOptions(journeyId),
    reports.getActorMemberId(journeyId),
  ]);
  if (!journey || !actor?.memberId) throw new Error("Journey unavailable.");
  const query = { journeyId, memberId: actor.memberId, scope: "GROUP" as const };
  const [expenses, rows] = await Promise.all([
    getDefaultLedgerExpenseRepository().then((repo) =>
      repo.listExpensesForJourney(journeyId),
    ),
    reports.countExpenses(query).then((count) => reports.listExpenses(query, count)),
  ]);
  const estimates = await loadDisplayEstimates(
    journeyId,
    journey.settlementCurrency,
    journey.settlementScale,
    expenses,
  );
  const conflicted = new Set(
    rows.filter((row) => row.hasOpenConflict).map((row) => row.id),
  );
  return {
    ...estimatedSettlement(
      expenses,
      options.members.map((member) => member.id),
      journey.settlementCurrency,
      journey.settlementScale,
      estimates,
      conflicted,
      "REFERENCE_RATE",
    ),
    members: options.members,
    serverIds: new Map(expenses.map((expense) => [expense.id, expense.serverId])),
  };
}
