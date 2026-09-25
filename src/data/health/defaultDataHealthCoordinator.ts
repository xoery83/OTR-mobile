import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { resolveReceiptFile } from "@/data/files/receiptFileStore";
import { runLedgerOperationalSync } from "@/data/sync/ledgerOperationalSync";
import {
  refreshJourneyLedger,
  revalidateJourneyLedger,
} from "@/data/sync/ledgerReportingCoordinator";
import { createLedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";
import { createLedgerExpenseMutationTransport } from "@/data/sync/ledgerExpenseMutationTransport";
import { preflightSettlementFx } from "@/data/sync/ledgerSettlementCoordinator";

import { createDataHealthCoordinator } from "./dataHealthCoordinator";

let coordinator: ReturnType<typeof createDataHealthCoordinator> | null = null;
const missingDateWithoutAutomaticEvidence = new Set<string>();
const dateRepairsAwaitingFx = new Set<string>();

export async function getDefaultDataHealthCoordinator() {
  if (coordinator) return coordinator;
  const database = await openDatabase();
  const expenses = createLedgerExpenseRepository(database);
  coordinator = createDataHealthCoordinator({
    database,
    getActiveAccountId: requireActiveUserId,
    getAccountGeneration,
    runOperationalSync: () => runLedgerOperationalSync({ origin: "DATA_HEALTH" }),
    refreshJourneyLedger: async (journeyId) => {
      if (dateRepairsAwaitingFx.has(journeyId)) {
        await preflightSettlementFx(journeyId);
        dateRepairsAwaitingFx.delete(journeyId);
      }
      return refreshJourneyLedger(journeyId);
    },
    revalidateJourneyLedger: async (journeyId) => {
      await revalidateJourneyLedger(journeyId);
    },
    getExpense: (id) => expenses.getExpense(id),
    restoreMissingEconomicDate: async (journeyId, expenseId) => {
      const current = await expenses.getExpense(expenseId);
      if (!current?.serverId || current.syncStatus !== "SYNCED" || current.economicDate)
        return false;
      const key = `${await requireActiveUserId()}:${current.serverId}:${current.serverRevision}`;
      if (missingDateWithoutAutomaticEvidence.has(key)) return false;
      const evidence = await createLedgerExpenseMutationTransport().inspectEconomicDate(
        journeyId,
        current.serverId,
      );
      if (evidence.disposition !== "AUTO_SAFE") {
        missingDateWithoutAutomaticEvidence.add(key);
        return false;
      }
      if (evidence.expenseRevision !== current.serverRevision) return false;
      await expenses.completeEconomicDate(
        expenseId,
        evidence.economicDate,
        evidence.source,
      );
      dateRepairsAwaitingFx.add(journeyId);
      return true;
    },
    fileExists: async (uri) => {
      try {
        return resolveReceiptFile(uri).exists;
      } catch {
        return null;
      }
    },
  });
  return coordinator;
}

export async function recoverMissingSettlementEconomicDates(journeyId: string) {
  const coordinator = await getDefaultDataHealthCoordinator();
  const scope = { journeyIds: [journeyId] };
  const report = await coordinator.run("CHEAP", scope);
  if (
    !report.findings.some(
      (finding) => finding.ruleId === "RESTORE_MISSING_ECONOMIC_DATE_V1",
    )
  )
    return;
  await coordinator.converge("MANUAL", scope);
}
