import { currencyScale } from "../../src/domain/ledger/currency";
import { parseDecimalRatio } from "../../src/domain/ledger/money";

export type RateQuoteProvider = {
  fetch(input: {
    quoteCurrency: string;
    baseCurrency: string;
    effectiveDate: string;
  }): Promise<{
    decimalRate: string;
    provider: string;
    providerReference: string | null;
  }>;
};

export async function fetchTrustedRateQuote(
  provider: RateQuoteProvider,
  input: {
    quoteCurrency: string;
    baseCurrency: string;
    effectiveDate: string;
  },
) {
  if (
    currencyScale(input.quoteCurrency) === null ||
    currencyScale(input.baseCurrency) === null ||
    input.quoteCurrency === input.baseCurrency ||
    Number.isNaN(Date.parse(`${input.effectiveDate}T00:00:00Z`))
  ) {
    throw new Error("Rate quote request is invalid.");
  }
  const quote = await provider.fetch(input);
  parseDecimalRatio(quote.decimalRate);
  if (!quote.provider.trim()) throw new Error("Rate quote provenance is missing.");
  return quote;
}
