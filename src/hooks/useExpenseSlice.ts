import { useCallback, useEffect, useState } from "react";

import { getDefaultExpenseRepository } from "@/data/repositories/defaultExpenseRepository";
import {
  failNextExpenseDemoSync,
  runExpenseDemoSync,
} from "@/data/sync/expenseDemoCoordinator";
import type { Expense } from "@/domain/expense/types";

export const phase2ADemoTripId = "phase-2a-demo-trip";

export function useExpenseSlice() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const repository = await getDefaultExpenseRepository();
    setExpenses(await repository.listExpensesForTrip(phase2ADemoTripId));
  }, []);

  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch(() => setError("Expenses are unavailable."))
      .finally(() => setIsLoading(false));
  }, [refresh]);

  const createExpense = useCallback(
    async (input: { title: string; amountMinor: number; currencyCode: string }) => {
      setIsSaving(true);
      setError(null);

      try {
        const repository = await getDefaultExpenseRepository();
        await repository.createExpense({
          ...input,
          tripId: phase2ADemoTripId,
        });
        await refresh();
        return true;
      } catch (createError) {
        setError(
          createError instanceof Error ? createError.message : "Expense was not saved.",
        );
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [refresh],
  );

  const runDemoSync = useCallback(async () => {
    setError(null);

    try {
      await runExpenseDemoSync();
      await refresh();
    } catch {
      setError("Demo sync could not run.");
    }
  }, [refresh]);

  return {
    createExpense,
    error,
    expenses,
    failNextDemoSync: failNextExpenseDemoSync,
    isLoading,
    isSaving,
    refresh,
    runDemoSync,
  };
}
