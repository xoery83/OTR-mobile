import { describe, expect, it, vi } from "vitest";

import { fetchTrustedRateQuote } from "./rateQuoteProvider";

describe("trusted rate provider boundary", () => {
  it("accepts one provenance-bearing candidate and rejects invalid provider data", async () => {
    const fetch = vi.fn(async () => ({
      decimalRate: "1.978",
      provider: "test-provider",
      providerReference: "quote-1",
    }));
    await expect(
      fetchTrustedRateQuote(
        { fetch },
        { quoteCurrency: "EUR", baseCurrency: "NZD", effectiveDate: "2026-09-12" },
      ),
    ).resolves.toMatchObject({ decimalRate: "1.978" });
    expect(fetch).toHaveBeenCalledOnce();
    await expect(
      fetchTrustedRateQuote(
        {
          fetch: async () => ({
            decimalRate: "0",
            provider: "test",
            providerReference: null,
          }),
        },
        { quoteCurrency: "EUR", baseCurrency: "NZD", effectiveDate: "2026-09-12" },
      ),
    ).rejects.toThrow(/positive/);
  });
});
