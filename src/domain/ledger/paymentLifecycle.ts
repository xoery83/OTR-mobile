import { assertMoney, convertMoney } from "./money";
import type { Money } from "./types";

export type SettlementPaymentStatus =
  "AWAITING_CONFIRMATION" | "CONFIRMED" | "REJECTED" | "DISPUTED" | "CORRECTED";

export type RepaymentValuation = {
  decimalRate: string;
  source: "REFERENCE_RATE" | "MANUAL_AGREED";
  sourceLabel: string;
  effectiveAt: string;
  reason: string | null;
};

export type FeeTreatment = {
  fee: Money;
  borneBy: "DEBTOR" | "CREDITOR" | "SHARED";
};

export type RepaymentProposition = {
  payment: Money;
  assertedDischarge: Money;
  repaymentValuation: RepaymentValuation | null;
  feeTreatment: FeeTreatment | null;
};

export function assertRepaymentProposition(
  proposition: RepaymentProposition,
  obligation: Money,
) {
  assertMoney(obligation, "Transfer obligation");
  assertMoney(proposition.payment, "Payment");
  assertMoney(proposition.assertedDischarge, "Asserted discharge");
  if (proposition.payment.minor <= 0 || proposition.assertedDischarge.minor <= 0)
    throw new Error("Payment and asserted discharge must be positive.");
  if (
    proposition.assertedDischarge.currency !== obligation.currency ||
    proposition.assertedDischarge.scale !== obligation.scale
  ) {
    throw new Error("Asserted discharge must use Settlement money.");
  }

  const sameMoneyUnit =
    proposition.payment.currency === obligation.currency &&
    proposition.payment.scale === obligation.scale;
  if (sameMoneyUnit) {
    if (proposition.repaymentValuation)
      throw new Error("Same-currency repayment must not include a valuation.");
    if (proposition.payment.minor !== proposition.assertedDischarge.minor)
      throw new Error("Same-currency payment and discharge must match.");
  } else {
    const valuation = proposition.repaymentValuation;
    if (!valuation) throw new Error("Cross-currency repayment needs a valuation.");
    if (
      !valuation.sourceLabel.trim() ||
      !Number.isFinite(Date.parse(valuation.effectiveAt))
    )
      throw new Error("Repayment valuation provenance is invalid.");
    if (valuation.source === "MANUAL_AGREED" && !valuation.reason?.trim())
      throw new Error("Manual repayment valuation requires a reason.");
    const converted = convertMoney(
      proposition.payment,
      obligation.currency,
      obligation.scale,
      valuation.decimalRate,
    );
    if (converted.minor !== proposition.assertedDischarge.minor)
      throw new Error("Repayment valuation does not reproduce asserted discharge.");
  }

  if (proposition.feeTreatment) {
    assertMoney(proposition.feeTreatment.fee, "Repayment fee");
    if (proposition.feeTreatment.fee.minor < 0)
      throw new Error("Repayment fee cannot be negative.");
  }
}

export function deriveTransferPaymentState(
  obligationMinor: number,
  payments: {
    status: SettlementPaymentStatus;
    assertedDischargeMinor: number;
    dischargeMinor: number | null;
  }[],
) {
  if (!Number.isSafeInteger(obligationMinor) || obligationMinor <= 0)
    throw new Error("Transfer obligation is invalid.");
  let confirmedDischargeMinor = 0;
  let awaitingAmountMinor = 0;
  let disputed = false;
  for (const payment of payments) {
    if (!Number.isSafeInteger(payment.assertedDischargeMinor))
      throw new Error("Asserted discharge is invalid.");
    if (payment.status === "AWAITING_CONFIRMATION")
      awaitingAmountMinor += payment.assertedDischargeMinor;
    if (payment.status === "DISPUTED") disputed = true;
    if (payment.dischargeMinor !== null) {
      if (payment.status !== "CONFIRMED")
        throw new Error("Only confirmed Payment may own a discharge.");
      confirmedDischargeMinor += payment.dischargeMinor;
    }
  }
  const confirmedRemainingMinor = obligationMinor - confirmedDischargeMinor;
  const availableToReportMinor = confirmedRemainingMinor - awaitingAmountMinor;
  if (confirmedRemainingMinor < 0 || availableToReportMinor < 0)
    throw new Error("Transfer payment exceeds its obligation.");
  return {
    confirmedDischargeMinor,
    confirmedRemainingMinor,
    awaitingAmountMinor,
    availableToReportMinor,
    status: disputed
      ? ("DISPUTED" as const)
      : confirmedRemainingMinor === 0
        ? ("SETTLED" as const)
        : awaitingAmountMinor > 0
          ? ("AWAITING_CONFIRMATION" as const)
          : confirmedDischargeMinor > 0
            ? ("PARTIALLY_PAID" as const)
            : ("OPEN" as const),
  };
}
