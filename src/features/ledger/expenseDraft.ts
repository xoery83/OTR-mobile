import {
  allocateByPercentageUnits,
  allocateByWeightUnits,
  allocateEqual,
  allocateEqualHousehold,
  allocateSettlementFromOriginal,
  PERCENTAGE_TOTAL_UNITS,
  validateExactAllocation,
} from "@/domain/ledger/allocation";
import type { ExpenseSplit, ExpenseSplitMethod } from "@/domain/ledger/types";
import { parseAmountToMinor } from "@/domain/expense/money";

export const EXPENSE_CATEGORIES = [
  "flight",
  "hotel",
  "car",
  "fuel",
  "food",
  "ticket",
  "shopping",
  "transport",
  "insurance",
  "groceries",
  "activity",
  "other",
] as const;

export type DraftMember = {
  id: string;
  displayName: string;
  householdId: string | null;
  shareUnits: number | null;
};

export function buildDraftSplits(input: {
  mode: ExpenseSplitMethod;
  originalMinor: number;
  settlementMinor: number | null;
  members: DraftMember[];
  exactMinor?: Record<string, number>;
  percentageUnits?: Record<string, number>;
}): ExpenseSplit[] {
  const ids = input.members.map((member) => member.id);
  if (input.mode === "EQUAL_PERSON")
    return allocateEqual(input.originalMinor, input.settlementMinor, ids);
  if (input.mode === "EQUAL_HOUSEHOLD") {
    if (input.members.some((member) => !member.householdId))
      throw new Error("Every selected participant needs a Household.");
    return allocateEqualHousehold(
      input.originalMinor,
      input.settlementMinor,
      input.members.map((member) => ({
        memberId: member.id,
        householdId: member.householdId!,
      })),
    );
  }
  if (input.mode === "HOUSEHOLD_SHARES") {
    if (input.members.some((member) => !member.shareUnits))
      throw new Error("Household share settings are missing.");
    return allocateByWeightUnits(
      input.originalMinor,
      input.settlementMinor,
      input.members.map((member) => ({
        memberId: member.id,
        units: member.shareUnits!,
      })),
    );
  }
  if (input.mode === "PERCENTAGE") {
    const percentages = input.percentageUnits ?? {};
    return allocateByPercentageUnits(
      input.originalMinor,
      input.settlementMinor,
      input.members.map((member) => ({
        memberId: member.id,
        units: percentages[member.id] ?? 0,
      })),
    );
  }
  const exact = input.members.map((member) => input.exactMinor?.[member.id] ?? -1);
  validateExactAllocation(input.originalMinor, exact);
  const splits = input.members.map<ExpenseSplit>((member, index) => ({
    memberId: member.id,
    originalMinor: exact[index],
    settlementMinor: null,
    method: "EXACT",
    weightUnits: null,
    percentageUnits: null,
    roundingAdjustmentMinor: 0,
  }));
  return input.settlementMinor === null
    ? splits
    : allocateSettlementFromOriginal(input.settlementMinor, splits);
}

export function parsePercentageUnits(value: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(value.trim());
  if (!match) return null;
  const units = Number(match[1]) * 10_000 + Number((match[2] ?? "").padEnd(4, "0"));
  return units >= 0 && units <= PERCENTAGE_TOTAL_UNITS ? units : null;
}

export function formatMinorInput(minor: number, scale: number) {
  const value = String(minor).padStart(scale + 1, "0");
  return scale === 0 ? value : `${value.slice(0, -scale)}.${value.slice(-scale)}`;
}

export function parseCurrencyAmount(value: string, scale: number, allowZero = false) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.slice(scale).replace(/0/g, "")) return null;
  const normalized = scale
    ? `${match[1]}.${fraction.slice(0, scale).padEnd(scale, "0")}`
    : match[1];
  if (allowZero && /^0+$/.test(match[1]) && (!fraction || /^0+$/.test(fraction)))
    return 0;
  return parseAmountToMinor(normalized, scale);
}

export function correctedCurrencyDraft<T extends { currency: string; amount: string }>(
  draft: T,
  currency: string,
): T {
  return { ...draft, currency };
}

export function preservesExpenseValuation(
  previous: {
    original: { minor: number; currency: string; scale: number };
    occurredAt: string;
    economicDate?: string | null;
  },
  original: { minor: number; currency: string; scale: number },
  selectedDate: string,
  selectedEconomicDate: string | null = previous.economicDate ?? null,
) {
  return (
    previous.original.minor === original.minor &&
    previous.original.currency === original.currency &&
    previous.original.scale === original.scale &&
    (previous.economicDate ?? previous.occurredAt.slice(0, 10)) === selectedDate &&
    (previous.economicDate ?? null) === selectedEconomicDate
  );
}
