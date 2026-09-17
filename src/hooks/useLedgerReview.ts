import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";

import type { LedgerReviewFindingDto } from "@/data/api/ledgerReviewContracts";
import { ApiClientError } from "@/data/api/client";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import { subscribeLedgerReview } from "@/data/repositories/ledgerReviewRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { openDatabase } from "@/data/db/database";
import { readLedgerSupportDiagnostics } from "@/data/operations/ledgerMaintenance";
import { runLedgerReviewSync } from "@/data/sync/ledgerReviewCoordinator";
import { runLedgerOperationalSync } from "@/data/sync/ledgerOperationalSync";
import { refreshJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";
import { createLedgerReviewTransport } from "@/data/sync/ledgerReviewTransport";
import { stage3JourneyId } from "./useLedgerStage3";

export type LedgerReviewFinding = LedgerReviewFindingDto;

export function useLedgerReview(journeyId = stage3JourneyId) {
  const [findings, setFindings] = useState<LedgerReviewFindingDto[]>([]);
  const [counts, setCounts] = useState({ pending: 0, reviewed: 0 });
  const [expenseTitles, setExpenseTitles] = useState<Record<string, string>>({});
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const submitting = useRef(false);
  const recheckRef = useRef(false);
  const [rechecking, setRechecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!journeyId) return;
    const [nextFindings, nextCounts, expenses, options] = await Promise.all([
      getDefaultLedgerReviewRepository().then((repository) => repository.list(journeyId)),
      getDefaultLedgerReviewRepository().then((repository) =>
        repository.counts(journeyId),
      ),
      getDefaultLedgerExpenseRepository().then((repository) =>
        repository.listExpensesForJourney(journeyId),
      ),
      getDefaultLedgerReportingRepository().then((repository) =>
        repository.listFilterOptions(journeyId),
      ),
    ]);
    setFindings(nextFindings);
    setCounts(nextCounts);
    setExpenseTitles(
      Object.fromEntries(expenses.map((expense) => [expense.id, expense.title])),
    );
    setMemberNames(
      Object.fromEntries(options.members.map((member) => [member.id, member.label])),
    );
    setLoading(false);
  }, [journeyId]);
  const refresh = useCallback(async () => {
    if (!journeyId) return;
    try {
      if (recheckRef.current) await runLedgerOperationalSync();
      await refreshJourneyLedger(journeyId);
      await runLedgerReviewSync(journeyId);
      const response = await createLedgerReviewTransport().refresh(journeyId);
      await (
        await getDefaultLedgerReviewRepository()
      ).apply(journeyId, response.findings, response.actions);
      setMessage(null);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        await (await getDefaultLedgerReviewRepository()).invalidate(journeyId);
        setMessage("Review access is no longer available for this Journey.");
      } else {
        setMessage("Offline · showing cached Review");
      }
    }
    try {
      await load();
    } finally {
      recheckRef.current = false;
      setRechecking(false);
    }
  }, [journeyId, load]);
  useFocusEffect(
    useCallback(() => {
      void Promise.resolve()
        .then(load)
        .then(refresh)
        .catch(() => {
          setLoading(false);
          setMessage("Review cache is unavailable.");
        });
    }, [load, refresh]),
  );
  useEffect(
    () =>
      subscribeLedgerReview((changedJourneyId, change) => {
        if (changedJourneyId !== journeyId) return;
        if (change === "expense_saved") {
          recheckRef.current = true;
          setRechecking(true);
        } else {
          void load().catch(() => undefined);
        }
      }),
    [journeyId, load],
  );
  return {
    findings,
    counts,
    expenseTitles,
    memberNames,
    message,
    loading,
    rechecking,
    isSubmitting,
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
      if (submitting.current) return;
      submitting.current = true;
      setIsSubmitting(true);
      try {
        await (await getDefaultLedgerReviewRepository()).act(findingId, action, reason);
        await load();
        void runLedgerReviewSync(journeyId)
          .then(load)
          .catch(() => setMessage("Offline · Review action queued for sync"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Review action failed.");
      } finally {
        submitting.current = false;
        setIsSubmitting(false);
      }
    },
  };
}
