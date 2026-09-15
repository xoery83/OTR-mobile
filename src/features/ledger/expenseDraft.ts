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
