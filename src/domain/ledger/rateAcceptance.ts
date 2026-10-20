import { sameExpenseValue, expenseFinancialInput } from "./expenseIntent";
import { parseDecimalRatio } from "./money";
import type { Stage4EditableExpense } from "./conflict";
import type { Money, SettlementValuationSnapshot } from "./types";

export type DisplayedRateBinding = {
  revision: number;
  serverRevision: number;
  original: Money;
  economicDate: string;
  settlement: Money;
  decimalRate: string;
  referenceDate: string;
};
export function sameRate(a: string | null | undefined, b: string) {
  if (!a) return false;
  try {
    const x = parseDecimalRatio(a),
      y = parseDecimalRatio(b);
    return x.numerator * y.denominator === y.numerator * x.denominator;
  } catch {
    return false;
  }
}
export function rateBindingMatches(
  binding: DisplayedRateBinding,
  expense: { original: Money; economicDate?: string | null },
  currency: string,
  scale: number,
) {
  return (
    sameExpenseValue(binding.original, expense.original) &&
    binding.economicDate === expense.economicDate &&
    binding.settlement.currency === currency &&
    binding.settlement.scale === scale
  );
}
export function compatibleReferenceValue(
  binding: DisplayedRateBinding,
  valuation: SettlementValuationSnapshot | Stage4EditableExpense["valuation"],
) {
  return (
    !!valuation &&
    valuation.policy === "REFERENCE_RATE" &&
    valuation.referenceEvidence?.automatic === true &&
    sameExpenseValue(valuation.original, binding.original) &&
    sameExpenseValue(valuation.settlement, binding.settlement) &&
    sameRate(valuation.decimalRate, binding.decimalRate)
  );
}
// Authorization still requires immutable server history and the locked SQL gate.
export function valuationRebaseEligible(
  base: Stage4EditableExpense,
  current: Stage4EditableExpense,
  binding: DisplayedRateBinding,
) {
  return (
    base.businessStatus === "RATE_REQUIRED" &&
    !base.valuation &&
    current.businessStatus === "ACCEPTED" &&
    current.valuation?.referenceEvidence?.automatic === true &&
    sameExpenseValue(expenseFinancialInput(base), expenseFinancialInput(current)) &&
    rateBindingMatches(
      binding,
      base,
      binding.settlement.currency,
      binding.settlement.scale,
    ) &&
    compatibleReferenceValue(binding, current.valuation)
  );
}
