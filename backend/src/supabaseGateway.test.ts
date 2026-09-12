import { describe, expect, it } from "vitest";

import { normalizeSettlementSource } from "./supabaseGateway";

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
