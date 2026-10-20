import type {
  LedgerRateLookupRequest,
  LedgerRateLookupResponse,
} from "@/data/api/ledgerFxContracts";
import type { RateQuote } from "@/domain/ledger/types";

export function cachedRateLookup(
  input: LedgerRateLookupRequest,
  quotes: RateQuote[],
  now = Date.now(),
): LedgerRateLookupResponse | null {
  const quote = quotes.find(
    (item) =>
      item.economicDate === input.requestedDate &&
      item.quoteCurrency === input.quoteCurrency &&
      item.baseCurrency === input.baseCurrency &&
      item.policyVersion === "ECB_DAILY_V1" &&
      item.provider === "ECB" &&
      item.referenceDate != null &&
      item.referenceDate <= input.requestedDate &&
      (Date.parse(`${input.requestedDate}T00:00:00Z`) -
        Date.parse(`${item.referenceDate}T00:00:00Z`)) /
        86_400_000 <=
        7 &&
      item.sourceReference ===
        "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" &&
      item.providerReference ===
        `https://api.frankfurter.dev/v2/providers/ecb/rate/${input.quoteCurrency}/${input.baseCurrency}?date=${input.requestedDate}` &&
      Date.parse(item.expiresAt) > now,
  );
  if (!quote) return null;
  return {
    quoteCurrency: input.quoteCurrency,
    baseCurrency: input.baseCurrency,
    requestedDate: input.requestedDate,
    referenceDate: quote.referenceDate ?? null,
    decimalRate: quote.decimalRate,
    resolution:
      quote.referenceDate === input.requestedDate ? "EXACT_DATE" : "NEAREST_AVAILABLE",
    policyVersion: "ECB_DAILY_V1",
    observedAt: quote.observedAt,
    provider: "ECB",
    sourceReference: quote.sourceReference ?? null,
    providerReference: quote.providerReference ?? null,
  };
}

export function identityRateLookup(
  input: LedgerRateLookupRequest,
): LedgerRateLookupResponse {
  return {
    quoteCurrency: input.quoteCurrency,
    baseCurrency: input.baseCurrency,
    requestedDate: input.requestedDate,
    referenceDate: input.requestedDate,
    decimalRate: "1",
    resolution: "SAME_CURRENCY",
    policyVersion: "ECB_DAILY_V1",
    observedAt: null,
    provider: null,
    sourceReference: null,
    providerReference: null,
  };
}
