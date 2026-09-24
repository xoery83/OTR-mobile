import { ledgerFxReferenceSnapshotBundleSchema } from "../../src/data/api/ledgerFxContracts";
import {
  RateProviderError,
  type RateQuoteProvider,
  type RateSnapshotProvider,
} from "./rateQuoteProvider";

// ECB's published daily EUR reference-rate coverage; other OTR currencies stay unresolved.
const ecbCurrencies = new Set(
  "AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR".split(
    " ",
  ),
);

export function createFrankfurterRateProvider(
  request: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): RateQuoteProvider & RateSnapshotProvider {
  let snapshotCache:
    | {
        expiresAt: number;
        value: Awaited<ReturnType<RateSnapshotProvider["fetchReferenceSnapshots"]>>;
      }
    | undefined;
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

    async fetchReferenceSnapshots(workingDays = 32) {
      if (!Number.isInteger(workingDays) || workingDays < 1 || workingDays > 32)
        throw new Error("Snapshot working-day limit is invalid.");
      const current = now();
      if (snapshotCache && snapshotCache.expiresAt > current.getTime())
        return {
          ...snapshotCache.value,
          snapshots: snapshotCache.value.snapshots.slice(0, workingDays),
        };

      const today = current.toISOString().slice(0, 10);
      const start = new Date(`${today}T00:00:00.000Z`);
      start.setUTCDate(start.getUTCDate() - 60);
      const url = new URL("https://api.frankfurter.dev/v2/providers/ecb/rates");
      url.searchParams.set("from", start.toISOString().slice(0, 10));
      url.searchParams.set("to", today);
      let response: Response;
      try {
        response = await request(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(12_000),
        });
      } catch {
        throw new RateProviderError(
          "TEMPORARY_FAILURE",
          "Provider timeout or network error.",
        );
      }
      if (response.status === 429)
        throw new RateProviderError("RATE_LIMITED", "Provider rate limited the request.");
      if (!response.ok)
        throw new RateProviderError(
          "TEMPORARY_FAILURE",
          `Provider HTTP ${response.status}.`,
        );

      const body = await response.text();
      if (body.length > 512_000)
        throw new Error("Provider snapshot response is too large.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new Error("Provider snapshot JSON is malformed.");
      }
      if (!Array.isArray(parsed) || !parsed.length)
        throw new Error("Provider snapshot response is invalid.");
      const rateTokens = [
        ...body.matchAll(/"rate"\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?)(?=\s*[,}])/g),
      ];
      if (rateTokens.length !== parsed.length)
        throw new Error("Provider snapshot decimal tokens are invalid.");

      const byDate = new Map<string, Record<string, string>>();
      const seen = new Set<string>();
      parsed.forEach((value, index) => {
        if (
          !value ||
          Array.isArray(value) ||
          typeof value !== "object" ||
          Object.keys(value).sort().join(",") !== "base,date,quote,rate"
        )
          throw new Error("Provider snapshot row shape is invalid.");
        const row = value as Record<string, unknown>;
        if (
          row.base !== "EUR" ||
          typeof row.date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
          row.date > today ||
          typeof row.quote !== "string" ||
          !ecbCurrencies.has(row.quote) ||
          typeof row.rate !== "number"
        )
          throw new Error("Provider snapshot row is invalid.");
        const key = `${row.date}:${row.quote}`;
        if (seen.has(key)) throw new Error("Provider snapshot row is duplicated.");
        seen.add(key);
        const rates = byDate.get(row.date) ?? {};
        rates[row.quote] = rateTokens[index][1];
        byDate.set(row.date, rates);
      });

      const observedAt = current.toISOString();
      const expiresAt = new Date(current.getTime() + 30 * 24 * 60 * 60_000).toISOString();
      const value = ledgerFxReferenceSnapshotBundleSchema.parse({
        provider: "ECB",
        policyVersion: "ECB_LOCAL_SNAPSHOT_V1",
        baseCurrency: "EUR",
        snapshots: [...byDate.entries()]
          .sort(([left], [right]) => right.localeCompare(left))
          .slice(0, 32)
          .map(([referenceDate, rates]) => ({
            referenceDate,
            rates,
            observedAt,
            expiresAt,
          })),
        sourceReference:
          "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
        providerReference: url.toString(),
      });
      snapshotCache = { expiresAt: current.getTime() + 60 * 60_000, value };
      return { ...value, snapshots: value.snapshots.slice(0, workingDays) };
    },
  };
}
