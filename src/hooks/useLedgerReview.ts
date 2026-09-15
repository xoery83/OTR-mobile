import { useCallback, useEffect, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";

import type { LedgerReviewFindingDto } from "@/data/api/ledgerReviewContracts";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import { openDatabase } from "@/data/db/database";
import { readLedgerSupportDiagnostics } from "@/data/operations/ledgerMaintenance";
import { runLedgerReviewSync } from "@/data/sync/ledgerReviewCoordinator";
import { refreshJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";
import { createLedgerReviewTransport } from "@/data/sync/ledgerReviewTransport";
import { stage3JourneyId } from "./useLedgerStage3";

export type LedgerReviewFinding = LedgerReviewFindingDto;

export function useLedgerReview(journeyId = stage3JourneyId) {
  const [findings, setFindings] = useState<LedgerReviewFindingDto[]>([]);
  const [expenseTitles, setExpenseTitles] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!journeyId) return;
    const [nextFindings, expenses] = await Promise.all([
      getDefaultLedgerReviewRepository().then((repository) => repository.list(journeyId)),
      getDefaultLedgerExpenseRepository().then((repository) =>
        repository.listExpensesForJourney(journeyId),
      ),
    ]);
    setFindings(nextFindings);
    setExpenseTitles(
      Object.fromEntries(expenses.map((expense) => [expense.id, expense.title])),
    );
  }, [journeyId]);
  const refresh = useCallback(async () => {
    if (!journeyId) return;
    try {
      await refreshJourneyLedger(journeyId);
      await runLedgerReviewSync(journeyId);
      const response = await createLedgerReviewTransport().refresh(journeyId);
      await (
        await getDefaultLedgerReviewRepository()
      ).apply(response.findings, response.actions);
      setMessage(null);
    } catch {
      setMessage("Offline · showing cached Review");
    }
    await load();
  }, [journeyId, load]);
  useEffect(() => {
    void Promise.resolve().then(load);
    void Promise.resolve().then(refresh);
  }, [load, refresh]);
  return {
    findings,
    expenseTitles,
    message,
    generateDiagnostics: async () => {
      if (!FileSystem.documentDirectory) throw new Error("Diagnostics unavailable.");
      await FileSystem.writeAsStringAsync(
        `${FileSystem.documentDirectory}ledger-support-diagnostics.json`,
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          ...(await readLedgerSupportDiagnostics(await openDatabase())),
        }),
      );
      setMessage("Support diagnostics generated.");
    },
    act: async (
      findingId: string,
      action: "ACKNOWLEDGED" | "DISMISSED",
      reason: string,
    ) => {
      try {
        await (await getDefaultLedgerReviewRepository()).act(findingId, action, reason);
        await load();
        void runLedgerReviewSync(journeyId)
          .then(load)
          .catch(() => setMessage("Offline · Review action queued for sync"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Review action failed.");
      }
    },
  };
}
