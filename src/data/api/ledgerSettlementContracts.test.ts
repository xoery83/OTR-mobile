import { describe, expect, it } from "vitest";

import {
  createPersonalSettlementPaymentRequestSchema,
  personalSettlementPaymentSchema,
  updatePersonalSettlementPaymentRequestSchema,
} from "./ledgerSettlementContracts";

const payment = {
  id: "74000000-0000-4000-8000-000000000001",
  counterpartyMemberId: "30000000-0000-4000-8000-000000000002",
  direction: "PAID" as const,
  amountMinor: 30_000,
  currency: "NZD",
  scale: 2,
  occurredAt: "2026-09-22T10:00:00+12:00",
};

describe("Settlement 2.0 Personal Payment contracts", () => {
  it.each(["PAID", "RECEIVED"] as const)(
    "accepts %s with optional equivalent and reference provenance",
    (direction) => {
      expect(
        createPersonalSettlementPaymentRequestSchema.parse({
          ...payment,
          direction,
          recordedEquivalentMinor: 17_250,
          recordedEquivalentCurrency: "AUD",
          recordedEquivalentScale: 2,
          referenceRateDecimal: "0.575",
          referenceRateDate: "2026-09-21",
          referenceSource: "ECB",
          referenceProvenance: { observedAt: "2026-09-22T00:00:00Z" },
        }),
      ).toMatchObject({ recordedEquivalentMinor: 17_250, referenceRateDecimal: "0.575" });
    },
  );

  it("accepts no FX metadata and preserves response owner identity", () => {
    expect(createPersonalSettlementPaymentRequestSchema.safeParse(payment).success).toBe(
      true,
    );
    expect(
      personalSettlementPaymentSchema.parse({
        ...payment,
        journeyId: "10000000-0000-4000-8000-000000000001",
        ownerUserId: "20000000-0000-4000-8000-000000000001",
        ownerMemberId: "30000000-0000-4000-8000-000000000001",
        revision: 1,
        createdAt: "2026-09-22T00:00:00Z",
        updatedAt: "2026-09-22T00:00:00Z",
        deletedAt: null,
      }),
    ).toMatchObject({ ownerMemberId: "30000000-0000-4000-8000-000000000001" });
  });

  it.each([
    [{ ...payment, amountMinor: 0 }, "amount"],
    [{ ...payment, currency: "nzd" }, "currency"],
    [{ ...payment, scale: 3 }, "ISO scale"],
    [{ ...payment, recordedEquivalentMinor: 100 }, "partial equivalent"],
    [{ ...payment, ownerUserId: "20000000-0000-4000-8000-000000000099" }, "owner"],
  ])("rejects malformed or authoritative client input (%s)", (value, _label) => {
    expect(createPersonalSettlementPaymentRequestSchema.safeParse(value).success).toBe(
      false,
    );
  });

  it("requires a base revision for update without accepting owner changes", () => {
    const { id: _id, ...update } = payment;
    expect(
      updatePersonalSettlementPaymentRequestSchema.safeParse({
        ...update,
        baseRevision: 1,
      }).success,
    ).toBe(true);
    expect(
      updatePersonalSettlementPaymentRequestSchema.safeParse({
        ...update,
        baseRevision: 1,
        ownerMemberId: "30000000-0000-4000-8000-000000000099",
      }).success,
    ).toBe(false);
  });
});
