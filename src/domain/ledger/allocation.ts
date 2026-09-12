import type { ExpenseSplit, ExpenseSplitMethod } from "./types";

export const PERCENTAGE_TOTAL_UNITS = 1_000_000;

type WeightedMember = { memberId: string; units: number };

function assertTotal(totalMinor: number): void {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    throw new Error("Allocation total must be a positive safe integer.");
  }
}

function allocate(totalMinor: number, members: WeightedMember[]): number[] {
  assertTotal(totalMinor);
  if (members.length === 0) throw new Error("At least one participant is required.");
  if (
    members.some((member) => !Number.isSafeInteger(member.units) || member.units <= 0)
  ) {
    throw new Error("Allocation units must be positive safe integers.");
  }
  const totalUnits = members.reduce((sum, member) => sum + member.units, 0);
  if (!Number.isSafeInteger(totalUnits))
    throw new Error("Allocation units exceed safe range.");

  const rawNumerators = members.map(
    (member) => BigInt(totalMinor) * BigInt(member.units),
  );
  const denominator = BigInt(totalUnits);
  const result = rawNumerators.map((value) => Number(value / denominator));
  let remaining = totalMinor - result.reduce((sum, value) => sum + value, 0);
  const order = rawNumerators
    .map((value, index) => ({
      index,
      remainder: value % denominator,
      id: members[index].memberId,
    }))
    .sort((a, b) => {
      if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  for (let index = 0; index < remaining; index += 1) result[order[index].index] += 1;
  return result;
}

function toSplits(
  members: WeightedMember[],
  original: number[],
  settlement: number[] | null,
  method: ExpenseSplitMethod,
  percentageUnits: number[] | null,
): ExpenseSplit[] {
  return members.map((member, index) => ({
    memberId: member.memberId,
    originalMinor: original[index],
    settlementMinor: settlement?.[index] ?? null,
    method,
    weightUnits: method === "HOUSEHOLD_SHARES" ? member.units : null,
    percentageUnits: percentageUnits?.[index] ?? null,
    roundingAdjustmentMinor: 0,
  }));
}

export function allocateEqual(
  originalMinor: number,
  settlementMinor: number | null,
  memberIds: string[],
): ExpenseSplit[] {
  const members = memberIds.map((memberId) => ({ memberId, units: 1 }));
  return toSplits(
    members,
    allocate(originalMinor, members),
    settlementMinor === null ? null : allocate(settlementMinor, members),
    "EQUAL_PERSON",
    null,
  );
}

export function allocateEqualHousehold(
  originalMinor: number,
  settlementMinor: number | null,
  members: { memberId: string; householdId: string }[],
): ExpenseSplit[] {
  const householdIds = [...new Set(members.map((member) => member.householdId))];
  const originalByHousehold = allocate(
    originalMinor,
    householdIds.map((householdId) => ({ memberId: householdId, units: 1 })),
  );
  const settlementByHousehold =
    settlementMinor === null
      ? null
      : allocate(
          settlementMinor,
          householdIds.map((householdId) => ({ memberId: householdId, units: 1 })),
        );

  return members.flatMap((member) => {
    const householdIndex = householdIds.indexOf(member.householdId);
    const householdMembers = members.filter(
      (candidate) => candidate.householdId === member.householdId,
    );
    const memberIds = householdMembers.map((candidate) => candidate.memberId);
    const memberIndex = memberIds.indexOf(member.memberId);
    return {
      memberId: member.memberId,
      originalMinor: allocate(
        originalByHousehold[householdIndex],
        householdMembers.map((candidate) => ({ memberId: candidate.memberId, units: 1 })),
      )[memberIndex],
      settlementMinor:
        settlementByHousehold === null
          ? null
          : allocate(
              settlementByHousehold[householdIndex],
              householdMembers.map((candidate) => ({
                memberId: candidate.memberId,
                units: 1,
              })),
            )[memberIndex],
      method: "EQUAL_HOUSEHOLD" as const,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    };
  });
}

export function allocateByWeightUnits(
  originalMinor: number,
  settlementMinor: number | null,
  members: WeightedMember[],
): ExpenseSplit[] {
  return toSplits(
    members,
    allocate(originalMinor, members),
    settlementMinor === null ? null : allocate(settlementMinor, members),
    "HOUSEHOLD_SHARES",
    null,
  );
}

export function allocateByPercentageUnits(
  originalMinor: number,
  settlementMinor: number | null,
  members: WeightedMember[],
): ExpenseSplit[] {
  const total = members.reduce((sum, member) => sum + member.units, 0);
  if (total !== PERCENTAGE_TOTAL_UNITS) {
    throw new Error(`Percentage units must total ${PERCENTAGE_TOTAL_UNITS}.`);
  }
  return toSplits(
    members,
    allocate(originalMinor, members),
    settlementMinor === null ? null : allocate(settlementMinor, members),
    "PERCENTAGE",
    members.map((member) => member.units),
  );
}

export function validateExactAllocation(totalMinor: number, amounts: number[]): void {
  assertTotal(totalMinor);
  if (
    amounts.length === 0 ||
    amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0) ||
    amounts.reduce((sum, amount) => sum + amount, 0) !== totalMinor
  ) {
    throw new Error("Exact allocation must reconcile to the total minor units.");
  }
}

export function allocateSettlementFromOriginal(
  settlementMinor: number,
  splits: ExpenseSplit[],
): ExpenseSplit[] {
  const values = allocate(
    settlementMinor,
    splits.map((split) => ({ memberId: split.memberId, units: split.originalMinor })),
  );
  return splits.map((split, index) => ({
    ...split,
    settlementMinor: values[index],
  }));
}
