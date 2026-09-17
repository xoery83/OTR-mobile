import { describe, expect, it } from "vitest";

import {
  createSupabaseDevGateway,
  normalizeSettlementSource,
  safeEconomicDateEdit,
  rateQuoteRowToDto,
} from "./supabaseGateway";

const productionUrl = "https://bobwhxjxqpehzecwmwqe.supabase.co";

describe("B2 decimal projection", () => {
  it("takes generated numeric text rather than a rounded PostgREST JSON number", () => {
    const quote = rateQuoteRowToDto({
      id: "quote",
      journey_id: "journey",
      quote_currency: "EUR",
      base_currency: "NZD",
      decimal_rate: 1.9808,
      decimal_rate_text: "1.980800000000000001",
      effective_date: "2026-07-15",
      economic_date: "2026-07-15",
      reference_date: "2026-07-15",
      policy_version: "ECB_DAILY_V1",
      observed_at: "2026-09-17T00:00:00Z",
      provider: "ECB",
      provider_reference: "api",
      source_reference: "source",
      expires_at: "2026-10-17T00:00:00Z",
    });
    expect(quote.decimalRate).toBe("1.980800000000000001");
  });
});

describe("normalizeSettlementSource", () => {
  it("keeps PostgreSQL numeric valuation rates canonical as strings", () => {
    const source = {
      expenses: [{ valuation: { decimalRate: 2 } }],
    } as unknown as Parameters<typeof normalizeSettlementSource>[0];

    expect(normalizeSettlementSource(source).expenses[0]?.valuation?.decimalRate).toBe(
      "2",
    );
  });
});

describe("economic date compatibility", () => {
  it("invalidates a cross-currency valuation when an old edit omits the date", () => {
    const current = {
      economicDate: "2026-07-15",
      occurredAt: "2026-07-15T00:30:00Z",
    } as Parameters<typeof safeEconomicDateEdit>[0];
    const submitted = {
      occurredAt: current.occurredAt,
      businessStatus: "ACCEPTED" as const,
      valuation: { policy: "REFERENCE_RATE" as const },
      splits: [{ settlementMinor: 100 }],
    } as Parameters<typeof safeEconomicDateEdit>[1];
    expect(safeEconomicDateEdit(current, submitted)).toMatchObject({
      economicDate: null,
      businessStatus: "RATE_REQUIRED",
      valuation: null,
      splits: [{ settlementMinor: null }],
    });
    expect(
      safeEconomicDateEdit(
        { ...current, economicDate: null },
        {
          ...submitted,
          economicDate: null,
          valuation: { ...submitted.valuation!, policy: "SAME_CURRENCY" },
        },
      ).valuation?.policy,
    ).toBe("SAME_CURRENCY");
  });
});

describe("Supabase Dev gateway target guard", () => {
  it("rejects the Production project before creating a client", () => {
    expect(() =>
      createSupabaseDevGateway({
        url: productionUrl,
        publishableKey: "synthetic",
        secretKey: "synthetic",
      }),
    ).toThrow("approved Supabase Dev project");
  });
});
