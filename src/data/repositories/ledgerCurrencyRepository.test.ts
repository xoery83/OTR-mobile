import { describe, expect, it } from "vitest";

import type { RateQuote } from "@/domain/ledger/types";
import { cachedRateLookup } from "./ledgerRateLookup";

const input = {
  quoteCurrency: "ISK",
  baseCurrency: "CNY",
  requestedDate: "2026-09-15",
};

const quote: RateQuote = {
  id: "40000000-0000-4000-8000-000000000001",
  journeyId: "10000000-0000-4000-8000-000000000001",
  quoteCurrency: "ISK",
  baseCurrency: "CNY",
  decimalRate: "0.0578",
  effectiveDate: "2026-09-14",
  economicDate: "2026-09-15",
  referenceDate: "2026-09-14",
  policyVersion: "ECB_DAILY_V1",
  observedAt: "2026-09-15T10:00:00.000Z",
  provider: "ECB",
  providerReference:
    "https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/CNY?date=2026-09-15",
  sourceReference:
    "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
  expiresAt: "2026-10-15T10:00:00.000Z",
};

describe("cached Journey rate lookup", () => {
  it("shows resolver-stamped nearest-date evidence and rejects expired cache", () => {
    expect(
      cachedRateLookup(input, [quote], Date.parse("2026-09-16T00:00:00Z")),
    ).toMatchObject({
      decimalRate: "0.0578",
      requestedDate: "2026-09-15",
      referenceDate: "2026-09-14",
      resolution: "NEAREST_AVAILABLE",
    });
    expect(cachedRateLookup(input, [quote], Date.parse(quote.expiresAt))).toBeNull();
  });
});
