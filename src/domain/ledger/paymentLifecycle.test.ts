import { describe, expect, it } from "vitest";

import {
  assertRepaymentProposition,
  deriveTransferPaymentState,
} from "./paymentLifecycle";

const nzd = (minor: number) => ({ minor, currency: "NZD", scale: 2 });

describe("Settlement Payment lifecycle", () => {
  it("keeps awaiting separate from confirmed debt reduction", () => {
    expect(
      deriveTransferPaymentState(10_000, [
        {
          status: "CONFIRMED",
          assertedDischargeMinor: 2_000,
          dischargeMinor: 2_000,
        },
        {
          status: "AWAITING_CONFIRMATION",
          assertedDischargeMinor: 3_000,
          dischargeMinor: null,
        },
      ]),
    ).toEqual({
      confirmedDischargeMinor: 2_000,
      confirmedRemainingMinor: 8_000,
      awaitingAmountMinor: 3_000,
      availableToReportMinor: 5_000,
      status: "AWAITING_CONFIRMATION",
    });
  });

  it("validates the complete cross-currency proposition", () => {
    expect(() =>
      assertRepaymentProposition(
        {
          payment: { minor: 3_000, currency: "EUR", scale: 2 },
          assertedDischarge: nzd(5_400),
          repaymentValuation: {
            decimalRate: "1.8",
            source: "MANUAL_AGREED",
            sourceLabel: "Traveller agreement",
            effectiveAt: "2026-09-12T00:00:00.000Z",
            reason: "Agreed before transfer",
          },
          feeTreatment: {
            fee: { minor: 50, currency: "EUR", scale: 2 },
            borneBy: "DEBTOR",
          },
        },
        nzd(10_000),
      ),
    ).not.toThrow();
  });

  it("rejects overbooking and discharge on a terminal non-confirmed Payment", () => {
    expect(() =>
      deriveTransferPaymentState(1_000, [
        {
          status: "AWAITING_CONFIRMATION",
          assertedDischargeMinor: 1_001,
          dischargeMinor: null,
        },
      ]),
    ).toThrow("exceeds");
    expect(() =>
      deriveTransferPaymentState(1_000, [
        { status: "DISPUTED", assertedDischargeMinor: 500, dischargeMinor: 500 },
      ]),
    ).toThrow("Only confirmed");
  });
});
