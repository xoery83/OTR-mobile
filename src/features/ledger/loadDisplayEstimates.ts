import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

import { displayEstimate, type DisplayEstimate } from "./displayEstimate";

export async function loadDisplayEstimates(
  journeyId: string,
  currency: string,
  scale: number,
  expenses?: LedgerExpense[],
) {
  const repository = await getDefaultLedgerExpenseRepository();
  const items = expenses ?? (await repository.listExpensesForJourney(journeyId));
  const pairs = [...new Set(items.map((item) => item.original.currency))].filter(
    (original) => original !== currency,
  );
  const quotes = new Map(
    await Promise.all(
      pairs.map(
        async (original) =>
          [
            original,
            await repository.listRateQuotes(journeyId, original, currency),
          ] as const,
      ),
    ),
  );
  return new Map<string, DisplayEstimate>(
    items.flatMap((item) => {
      const estimate = displayEstimate(
        item,
        quotes.get(item.original.currency) ?? [],
        currency,
        scale,
      );
      return estimate ? [[item.id, estimate] as const] : [];
    }),
  );
}
