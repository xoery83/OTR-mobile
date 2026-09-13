import { useCallback, useEffect, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";

import type { LedgerReviewFindingDto } from "@/data/api/ledgerReviewContracts";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import { openDatabase } from "@/data/db/database";
import { readLedgerSupportDiagnostics } from "@/data/operations/ledgerMaintenance";
import { runLedgerReviewSync } from "@/data/sync/ledgerReviewCoordinator";
import { refreshJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";
import { createLedgerReviewTransport } from "@/data/sync/ledgerReviewTransport";
import { stage3JourneyId } from "./useLedgerStage3";

export function useLedgerReview() {
  const [findings, setFindings] = useState<LedgerReviewFindingDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (stage3JourneyId)
      setFindings(await (await getDefaultLedgerReviewRepository()).list(stage3JourneyId));
  }, []);
  const refresh = useCallback(async () => {
    if (!stage3JourneyId) return;
    try {
      await refreshJourneyLedger(stage3JourneyId);
      await runLedgerReviewSync(stage3JourneyId);
      const response = await createLedgerReviewTransport().refresh(stage3JourneyId);
      await (
        await getDefaultLedgerReviewRepository()
      ).apply(response.findings, response.actions);
      setMessage(null);
    } catch {
      setMessage("Offline · showing cached Review");
    }
    await load();
  }, [load]);
  useEffect(() => {
    void Promise.resolve().then(load);
    void Promise.resolve().then(refresh);
  }, [load, refresh]);
  return {
    findings,
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
        void runLedgerReviewSync(stage3JourneyId)
          .then(load)
          .catch(() => setMessage("Offline · Review action queued for sync"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Review action failed.");
      }
    },
  };
}
