import { currencyScale } from "../../src/domain/ledger/currency";
import { parseDecimalRatio } from "../../src/domain/ledger/money";
import type { LedgerFxReferenceSnapshotBundle } from "../../src/data/api/ledgerFxContracts";

export const historicalRatePolicyVersion = "ECB_DAILY_V1";

export type HistoricalRateRequest = {
  economicDate: string;
  quoteCurrency: string;
  settlementCurrency: string;
  policyVersion: typeof historicalRatePolicyVersion;
};

export type HistoricalRateCandidate = {
  decimalRate: string;
  referenceDate: string;
  provider: string;
  providerReference: string;
  sourceReference: string;
};

export type RateQuoteProvider = {
  fetch(input: HistoricalRateRequest): Promise<HistoricalRateCandidate>;
};

export type RateSnapshotProvider = {
  fetchReferenceSnapshots(workingDays?: number): Promise<LedgerFxReferenceSnapshotBundle>;
};

export class RateProviderError extends Error {
  constructor(
    readonly category:
      | "UNSUPPORTED"
      | "NOT_YET_AVAILABLE"
      | "NO_REFERENCE_WITHIN_POLICY"
      | "TEMPORARY_FAILURE"
      | "RATE_LIMITED",
    message: string,
  ) {
    super(message);
  }
}

export function calendarDistance(later: string, earlier: string): number {
  return (
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000
  );
}

export async function fetchTrustedRateQuote(
  provider: RateQuoteProvider,
  input: HistoricalRateRequest,
  today = new Date().toISOString().slice(0, 10),
): Promise<HistoricalRateCandidate> {
  if (
    currencyScale(input.quoteCurrency) === null ||
    currencyScale(input.settlementCurrency) === null ||
    input.quoteCurrency === input.settlementCurrency ||
    input.policyVersion !== historicalRatePolicyVersion ||
    !validDate(input.economicDate)
  ) {
    throw new Error("Rate quote request is invalid.");
  }
  if (input.economicDate > today)
    throw new RateProviderError("NOT_YET_AVAILABLE", "Future economic date.");
  const quote = await provider.fetch(input);
  parseDecimalRatio(quote.decimalRate);
  if (!validDate(quote.referenceDate))
    throw new Error("Provider reference date is invalid.");
  const days = calendarDistance(input.economicDate, quote.referenceDate);
  if (days < 0 || days > 7)
    throw new RateProviderError(
      "NO_REFERENCE_WITHIN_POLICY",
      "Provider reference date is outside the seven-day policy.",
    );
  if (input.economicDate === today && days > 0 && !isWeekend(today))
    throw new RateProviderError(
      "NOT_YET_AVAILABLE",
      "The requested day's rate has not been published.",
    );
  if (!quote.provider.trim() || !quote.providerReference || !quote.sourceReference)
    throw new Error("Rate quote provenance is missing or mismatched.");
  return quote;
}

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
