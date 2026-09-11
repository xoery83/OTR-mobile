import { useCallback, useEffect, useState } from "react";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { runLedgerExpenseCreateSync } from "@/data/sync/ledgerExpenseDemoCoordinator";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import { createLocalId } from "@/domain/localId";
import { allocateEqual } from "@/domain/ledger/allocation";

export const stage3JourneyId = process.env.EXPO_PUBLIC_OTR_DEV_TRIP_ID ?? "";

type Summary = Awaited<
  ReturnType<
    Awaited<ReturnType<typeof getDefaultLedgerReadRepository>>["listMyLedgerSummaries"]
  >
>[number];

export function useLedgerStage3() {
  const [expenses, setExpenses] = useState<LedgerExpense[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [ledger, reads] = await Promise.all([
      getDefaultLedgerExpenseRepository(),
      getDefaultLedgerReadRepository(),
    ]);
    setExpenses(
      stage3JourneyId ? await ledger.listExpensesForJourney(stage3JourneyId, true) : [],
    );
    setSummaries(await reads.listMyLedgerSummaries());
    setCursor(
      (stage3JourneyId ? await reads.getCursor(stage3JourneyId) : null)?.cursor ?? null,
    );
  }, []);

  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch(() => setMessage("Ledger local cache unavailable."));
  }, [refresh]);

  const run = useCallback(
    async (task: () => Promise<string>) => {
      setIsBusy(true);
      setMessage(null);
      try {
        setMessage(await task());
        await refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ledger Stage 3 failed.");
      } finally {
        setIsBusy(false);
      }
    },
    [refresh],
  );

  const bootstrap = useCallback(
    () =>
      run(async () => {
        if (!stage3JourneyId) throw new Error("EXPO_PUBLIC_OTR_DEV_TRIP_ID is required.");
        const response = await createLedgerReadTransport().bootstrap(stage3JourneyId);
        await (await getDefaultLedgerReadRepository()).applyBootstrap(response);
        return `Bootstrapped ${response.expenses.length} expenses.`;
      }),
    [run],
  );

  const pull = useCallback(
    () =>
      run(async () => {
        if (!stage3JourneyId) throw new Error("EXPO_PUBLIC_OTR_DEV_TRIP_ID is required.");
        const reads = await getDefaultLedgerReadRepository();
        const response = await createLedgerReadTransport().pull(
          stage3JourneyId,
          (await reads.getCursor(stage3JourneyId))?.cursor ?? null,
        );
        await reads.applyChanges(stage3JourneyId, response);
        return `Pulled ${response.changes.length} changes.`;
      }),
    [run],
  );

  const cacheMyLedger = useCallback(
    () =>
      run(async () => {
        const response = await createLedgerReadTransport().myLedger();
        await (await getDefaultLedgerReadRepository()).cacheMyLedger(response);
        return `Cached ${response.journeys.length} Journey summaries.`;
      }),
    [run],
  );

  const createLocalStage4Expense = useCallback(
    () =>
      run(async () => {
        if (!stage3JourneyId) throw new Error("EXPO_PUBLIC_OTR_DEV_TRIP_ID is required.");
        const reads = await getDefaultLedgerReadRepository();
        const members = await reads.listMembers(stage3JourneyId);
        if (members.length < 1) throw new Error("Bootstrap Ledger members first.");
        const participants = members
          .slice(0, Math.min(2, members.length))
          .map((member) => ({
            memberId: member.id,
            displayNameSnapshot: member.displayName,
            householdIdSnapshot: null,
          }));
        const memberIds = participants.map((member) => member.memberId);
        const original = { minor: 1200, currency: "NZD", scale: 2 };
        const created = await (
          await getDefaultLedgerExpenseRepository()
        ).createExpense({
          journeyId: stage3JourneyId,
          creatorMemberId: participants[0].memberId,
          payerMemberId: participants[0].memberId,
          title: `Stage 4A coffee ${new Date().toISOString().slice(11, 19)}`,
          category: "food",
          occurredAt: new Date().toISOString(),
          original,
          participants,
          splits: allocateEqual(original.minor, original.minor, memberIds),
          valuation: {
            id: createLocalId("ledger-valuation"),
            policy: "SAME_CURRENCY",
            original,
            settlement: original,
            rateSnapshotId: null,
            paymentRecordId: null,
            reason: null,
          },
          status: "ACCEPTED",
        });
        return `Created local Ledger expense ${created.id}.`;
      }),
    [run],
  );

  const syncStage4Creates = useCallback(
    () =>
      run(async () => {
        const result = await runLedgerExpenseCreateSync();
        return `Ledger create sync processed ${result.processedCount} operation(s).`;
      }),
    [run],
  );

  return {
    bootstrap,
    cacheMyLedger,
    createLocalStage4Expense,
    cursor,
    expenses,
    isBusy,
    message,
    pull,
    refresh,
    syncStage4Creates,
    summaries,
  };
}
