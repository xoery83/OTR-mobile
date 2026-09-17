import { RateProviderError, type RateQuoteProvider } from "./rateQuoteProvider";

// ECB's published daily EUR reference-rate coverage; other OTR currencies stay unresolved.
const ecbCurrencies = new Set(
  "AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR".split(
    " ",
  ),
);

export function createFrankfurterRateProvider(
  request: typeof fetch = fetch,
): RateQuoteProvider {
  return {
    async fetch(input) {
      if (
        !ecbCurrencies.has(input.quoteCurrency) ||
        !ecbCurrencies.has(input.settlementCurrency)
      )
        throw new RateProviderError("UNSUPPORTED", "ECB does not cover this pair.");

      const url = new URL(
        `https://api.frankfurter.dev/v2/providers/ecb/rate/${input.quoteCurrency}/${input.settlementCurrency}`,
      );
      url.searchParams.set("date", input.economicDate);
      let response: Response;
      try {
        response = await request(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        });
      } catch {
        throw new RateProviderError(
          "TEMPORARY_FAILURE",
          "Provider timeout or network error.",
        );
      }
      if (response.status === 429)
        throw new RateProviderError("RATE_LIMITED", "Provider rate limited the request.");
      if (response.status === 404)
        throw new RateProviderError(
          "NO_REFERENCE_WITHIN_POLICY",
          "Provider has no reference rate for this date and pair.",
        );
      if (!response.ok)
        throw new RateProviderError(
          "TEMPORARY_FAILURE",
          `Provider HTTP ${response.status}.`,
        );

      const body = await response.text();
      if (body.length > 4_096) throw new Error("Provider response is too large.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new Error("Provider JSON is malformed.");
      }
      if (
        !parsed ||
        Array.isArray(parsed) ||
        typeof parsed !== "object" ||
        Object.keys(parsed).sort().join(",") !== "base,date,quote,rate"
      )
        throw new Error("Provider response shape is invalid.");
      const row = parsed as Record<string, unknown>;
      if (
        row.base !== input.quoteCurrency ||
        row.quote !== input.settlementCurrency ||
        typeof row.date !== "string" ||
        typeof row.rate !== "number"
      )
        throw new Error("Provider rate direction or date is invalid.");
      const tokens = [
        ...body.matchAll(/"rate"\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?)(?=\s*[,}])/g),
      ];
      if (tokens.length !== 1) throw new Error("Provider decimal token is invalid.");
      return {
        decimalRate: tokens[0][1],
        referenceDate: row.date,
        provider: "ECB",
        providerReference: url.toString(),
        sourceReference:
          "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
      };
    },
  };
}
