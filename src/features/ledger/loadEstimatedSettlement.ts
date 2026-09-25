import * as Crypto from "expo-crypto";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import {
  canonicalLocalSettlementSourceJson,
  currentSettlementExpenses,
} from "@/domain/ledger/settlementSource";

import { estimatedSettlement } from "./estimatedSettlement";
import { loadDisplayEstimates } from "./loadDisplayEstimates";

export async function loadEstimatedSettlement(
  journeyId: string,
  sourceAsOf = new Date().toISOString(),
) {
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
  const currentExpenses = currentSettlementExpenses(expenses);
  const estimates = await loadDisplayEstimates(
    journeyId,
    journey.settlementCurrency,
    journey.settlementScale,
    currentExpenses,
  );
  const conflicted = new Set(
    rows.filter((row) => row.hasOpenConflict).map((row) => row.id),
  );
  const canonicalSourceJson = canonicalLocalSettlementSourceJson(
    journeyId,
    sourceAsOf,
    expenses,
    conflicted,
  );
  return {
    ...estimatedSettlement(
      currentExpenses,
      options.members.map((member) => member.id),
      journey.settlementCurrency,
      journey.settlementScale,
      estimates,
      conflicted,
      "REFERENCE_RATE",
    ),
    members: options.members,
    serverIds: new Map(currentExpenses.map((expense) => [expense.id, expense.serverId])),
    estimatedServerIds: new Set(
      currentExpenses.flatMap((expense) =>
        estimates.has(expense.id) && expense.serverId ? [expense.serverId] : [],
      ),
    ),
    canonicalSourceCount: JSON.parse(canonicalSourceJson).length as number,
    canonicalSourceFingerprint: await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      canonicalSourceJson,
    ),
  };
}
