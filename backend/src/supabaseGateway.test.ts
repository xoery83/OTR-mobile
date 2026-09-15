import { describe, expect, it } from "vitest";

import { createSupabaseDevGateway, normalizeSettlementSource } from "./supabaseGateway";

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
