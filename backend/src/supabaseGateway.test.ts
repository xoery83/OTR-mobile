import { describe, expect, it } from "vitest";

import {
  createSupabaseDevGateway,
  normalizeSettlementSource,
  safeEconomicDateEdit,
  rateQuoteRowToDto,
  eligibleReferenceCandidate,
  personalPaymentBackendError,
  personalPaymentRowToDto,
} from "./supabaseGateway";

describe("Phase C reference candidate eligibility", () => {
  const expense = {
    economicDate: "2026-07-12",
    original: { minor: 10000, currency: "EUR", scale: 2 },
  } as Parameters<typeof eligibleReferenceCandidate>[0];
  const quote: NonNullable<Parameters<typeof eligibleReferenceCandidate>[2]> = {
    id: "quote",
    journeyId: "journey",
    economicDate: "2026-07-12",
    referenceDate: "2026-07-10",
    effectiveDate: "2026-07-10",
    quoteCurrency: "EUR",
    baseCurrency: "NZD",
    policyVersion: "ECB_DAILY_V1",
    provider: "ECB",
    sourceReference:
      "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    providerReference:
      "https://api.frankfurter.dev/v2/providers/ecb/rate/EUR/NZD?date=2026-07-12",
    expiresAt: "2026-10-17T00:00:00Z",
    decimalRate: "1.9608",
    observedAt: "2026-09-17T00:00:00Z",
  };
  const now = new Date("2026-09-17T00:00:00Z");

  it("accepts a real Friday reference for a Sunday economic date", () => {
    expect(
      eligibleReferenceCandidate(
        expense,
        { economicDate: "2026-07-12" },
        quote,
        "NZD",
        now,
      ),
    ).toBe(true);
  });
  it.each([
    [{ economicDate: "2026-07-11" }, "request date"],
    [{ referenceDate: "2026-07-13", effectiveDate: "2026-07-13" }, "future reference"],
    [{ referenceDate: "2026-07-04", effectiveDate: "2026-07-04" }, "over seven days"],
    [{ baseCurrency: "USD" }, "old Journey currency"],
    [{ quoteCurrency: "USD" }, "wrong direction"],
    [{ provider: "OTHER" }, "unapproved source"],
    [{ expiresAt: "2026-09-16T00:00:00Z" }, "expired candidate"],
  ])("rejects %s (%s)", (change, _label) => {
    expect(
      eligibleReferenceCandidate(
        expense,
        { economicDate: "2026-07-12" },
        { ...quote, ...change },
        "NZD",
        now,
      ),
    ).toBe(false);
  });
  it("rejects a forged request economic date", () => {
    expect(
      eligibleReferenceCandidate(
        expense,
        { economicDate: "2026-07-15" },
        quote,
        "NZD",
        now,
      ),
    ).toBe(false);
  });
});

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

describe("Settlement 2.0 Personal Payment gateway projection", () => {
  it("maps the Phase 1A row without deriving the entered equivalent", () => {
    expect(
      personalPaymentRowToDto({
        id: "74000000-0000-4000-8000-000000000001",
        journey_id: "10000000-0000-4000-8000-000000000001",
        owner_user_id: "20000000-0000-4000-8000-000000000001",
        owner_member_id: "30000000-0000-4000-8000-000000000001",
        counterparty_member_id: "30000000-0000-4000-8000-000000000002",
        direction: "PAID",
        amount_minor: 30_000,
        currency: "NZD",
        scale: 2,
        occurred_at: "2026-09-22T00:00:00Z",
        note: null,
        recorded_equivalent_minor: 17_250,
        recorded_equivalent_currency: "AUD",
        recorded_equivalent_scale: 2,
        reference_rate_decimal: "0.575000000000000000",
        reference_rate_date: "2026-09-21",
        reference_source: "ECB",
        reference_provenance: { informational: true },
        revision: 1,
        created_at: "2026-09-22T00:00:00Z",
        updated_at: "2026-09-22T00:00:00Z",
        deleted_at: null,
      }),
    ).toMatchObject({
      recordedEquivalentMinor: 17_250,
      recordedEquivalentCurrency: "AUD",
      referenceRateDecimal: "0.575000000000000000",
    });
  });

  it.each([
    ["REVISION_CONFLICT", 409],
    ["IDEMPOTENCY_CONFLICT", 409],
    ["TRIP_WRITE_FORBIDDEN", 403],
    ["PERSONAL_PAYMENT_WRITE_FORBIDDEN", 403],
    ["ENTITY_NOT_FOUND", 404],
    ["PERSONAL_PAYMENT_SELF_COUNTERPARTY", 422],
  ])("maps %s to stable status %s", (message, status) => {
    expect(personalPaymentBackendError(message)).toMatchObject({
      message: expect.any(String),
      status,
    });
  });
});
