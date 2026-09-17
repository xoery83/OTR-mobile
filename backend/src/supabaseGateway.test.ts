import { describe, expect, it } from "vitest";

import {
  createSupabaseDevGateway,
  normalizeSettlementSource,
  safeEconomicDateEdit,
} from "./supabaseGateway";

const productionUrl = "https://bobwhxjxqpehzecwmwqe.supabase.co";

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
