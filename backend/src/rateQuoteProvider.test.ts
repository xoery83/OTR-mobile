import { describe, expect, it, vi } from "vitest";

import { fetchTrustedRateQuote, historicalRatePolicyVersion } from "./rateQuoteProvider";

const request = {
  economicDate: "2026-07-15",
  quoteCurrency: "EUR",
  settlementCurrency: "NZD",
  policyVersion: historicalRatePolicyVersion as typeof historicalRatePolicyVersion,
} as const;
const candidate = {
  decimalRate: "1.980800000000000001",
  referenceDate: "2026-07-15",
  provider: "ECB",
  providerReference:
    "https://api.frankfurter.dev/v2/providers/ecb/rate/EUR/NZD?date=2026-07-15",
  sourceReference: "https://www.ecb.europa.eu/",
};

describe("trusted historical rate boundary", () => {
  it("preserves weekday precision and direction", async () => {
    const fetch = vi.fn(async () => candidate);
    await expect(
      fetchTrustedRateQuote({ fetch }, request, "2026-09-17"),
    ).resolves.toEqual(candidate);
    expect(fetch).toHaveBeenCalledWith(request);
  });

  it("allows weekend, holiday and exactly seven days, but not eight", async () => {
    const fetch = async () => ({ ...candidate, referenceDate: "2026-07-10" });
    for (const economicDate of ["2026-07-12", "2026-07-13", "2026-07-17"])
      await expect(
        fetchTrustedRateQuote({ fetch }, { ...request, economicDate }, "2026-09-17"),
      ).resolves.toMatchObject({ referenceDate: "2026-07-10" });
    await expect(
      fetchTrustedRateQuote(
        { fetch },
        { ...request, economicDate: "2026-07-18" },
        "2026-09-17",
      ),
    ).rejects.toMatchObject({ category: "NO_REFERENCE_WITHIN_POLICY" });
  });

  it("rejects future or unpublished current-day rates", async () => {
    const fetch = vi.fn(async () => candidate);
    await expect(
      fetchTrustedRateQuote(
        { fetch },
        { ...request, economicDate: "2026-09-18" },
        "2026-09-17",
      ),
    ).rejects.toMatchObject({ category: "NOT_YET_AVAILABLE" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      fetchTrustedRateQuote(
        { fetch: async () => ({ ...candidate, referenceDate: "2026-09-16" }) },
        { ...request, economicDate: "2026-09-17" },
        "2026-09-17",
      ),
    ).rejects.toMatchObject({ category: "NOT_YET_AVAILABLE" });
  });

  it("accepts the previous ECB working day when today is a weekend", async () => {
    await expect(
      fetchTrustedRateQuote(
        { fetch: async () => ({ ...candidate, referenceDate: "2026-09-18" }) },
        { ...request, economicDate: "2026-09-20" },
        "2026-09-20",
      ),
    ).resolves.toMatchObject({ referenceDate: "2026-09-18" });
  });

  it("never requests same-currency or unknown date", async () => {
    const fetch = vi.fn(async () => candidate);
    for (const changed of [{ settlementCurrency: "EUR" }, { economicDate: "" }])
      await expect(
        fetchTrustedRateQuote({ fetch }, { ...request, ...changed }),
      ).rejects.toThrow(/invalid/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects zero, negative, impossible or future reference date", async () => {
    for (const change of [
      { decimalRate: "0" },
      { decimalRate: "-1" },
      { referenceDate: "2026-02-30" },
      { referenceDate: "2026-07-16" },
      { provider: "" },
    ])
      await expect(
        fetchTrustedRateQuote(
          { fetch: async () => ({ ...candidate, ...change }) },
          request,
          "2026-09-17",
        ),
      ).rejects.toThrow();
  });
});
