import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { LedgerJourneyOption } from "@/data/repositories/ledgerReportingRepository";
import { currencyScale } from "@/domain/ledger/currency";
import { convertMoney, convertMoneyWithCrossRate } from "@/domain/ledger/money";
import type { RateQuote } from "@/domain/ledger/types";
import type { FxReferenceSnapshot } from "./personalPaymentFx";

export type Period = "YEAR" | "ALL";
export type PersonalExpense = { expense: LedgerExpense; memberId: string };

export function journeyInPeriod(
  journey: LedgerJourneyOption,
  period: Period,
  year: number,
) {
  if (period === "ALL") return true;
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  return Boolean(
    (journey.startDate || journey.endDate) &&
    (!journey.startDate || journey.startDate < to) &&
    (!journey.endDate || journey.endDate >= from),
  );
}

export function displayCurrencies(journeys: LedgerJourneyOption[]) {
  return [...new Set(journeys.map((journey) => journey.settlementCurrency))]
    .filter((currency) => currencyScale(currency) !== null)
    .sort();
}

export function spendingDate(expense: LedgerExpense) {
  return expense.economicDate ?? expense.occurredAt.slice(0, 10);
}

export function analyticalSpending(
  rows: PersonalExpense[],
  period: Period,
  year: number,
  currency: string,
  snapshots: FxReferenceSnapshot[],
  quotes: Map<string, RateQuote[]>,
) {
  const scale = currencyScale(currency);
  if (scale === null) throw new Error("Unsupported display currency.");
  const months = new Map<string, number>();
  if (period === "YEAR")
    for (let month = 1; month <= 12; month++)
      months.set(`${year}-${String(month).padStart(2, "0")}`, 0);
  const categories = new Map<string, number>();
  let totalMinor = 0;
  let unconverted = 0;
  for (const { expense, memberId } of rows) {
    if (
      expense.deletedAt ||
      (expense.status !== "ACCEPTED" && expense.status !== "RATE_REQUIRED") ||
      (period === "YEAR" && !spendingDate(expense).startsWith(`${year}-`))
    )
      continue;
    const split = expense.splits.find((item) => item.memberId === memberId);
    if (!split || split.originalMinor === 0) continue;
    const source = {
      minor: split.originalMinor,
      currency: expense.original.currency,
      scale: expense.original.scale,
    };
    let minor: number | null = null;
    try {
      if (source.currency === currency) minor = source.minor;
      else {
        const snapshot = snapshots.find(
          (item) => item.rates[source.currency] && item.rates[currency],
        );
        if (snapshot)
          minor = convertMoneyWithCrossRate(
            source,
            currency,
            scale,
            snapshot.rates[source.currency],
            snapshot.rates[currency],
          ).minor;
        else {
          const quote = quotes
            .get(`${expense.journeyId}:${source.currency}:${currency}`)
            ?.find(
              (item) => item.provider === "ECB" && item.policyVersion === "ECB_DAILY_V1",
            );
          if (quote)
            minor = convertMoney(source, currency, scale, quote.decimalRate).minor;
        }
      }
    } catch {
      /* An unusable local rate excludes only this expense. */
    }
    if (minor === null) {
      unconverted++;
      continue;
    }
    totalMinor += minor;
    if (!Number.isSafeInteger(totalMinor))
      throw new Error("Spending total exceeds safe range.");
    categories.set(
      expense.category || "Other",
      (categories.get(expense.category || "Other") ?? 0) + minor,
    );
    const month = spendingDate(expense).slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + minor);
  }
  const ranked = [...categories].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, 5);
  if (ranked.length > 5) {
    const remainder = ranked.slice(5).reduce((sum, [, minor]) => sum + minor, 0);
    const other = top.find((item) => item[0] === "Other");
    if (other) other[1] += remainder;
    else top.push(["Other", remainder]);
  }
  if (period === "ALL" && months.size) {
    const sorted = [...months.keys()].sort();
    let [firstYear, firstMonth] = sorted[0].split("-").map(Number);
    const last = sorted.at(-1)!;
    while (`${firstYear}-${String(firstMonth).padStart(2, "0")}` <= last) {
      const key = `${firstYear}-${String(firstMonth).padStart(2, "0")}`;
      if (!months.has(key)) months.set(key, 0);
      firstMonth++;
      if (firstMonth > 12) {
        firstYear++;
        firstMonth = 1;
      }
    }
  }
  return {
    totalMinor,
    unconverted,
    categories: top,
    months: [...months].sort((a, b) => a[0].localeCompare(b[0])),
    currency,
    scale,
  };
}
