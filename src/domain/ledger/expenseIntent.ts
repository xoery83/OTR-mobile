import type { Stage4EditableExpense } from "./conflict";
import type { ExpenseSplit, Money, ValuationPolicy } from "./types";

export type ExpenseUserSplit = Omit<
  ExpenseSplit,
  "settlementMinor" | "roundingAdjustmentMinor"
>;
export type ExpenseUserPatch = {
  descriptive?: Partial<
    Pick<Stage4EditableExpense, "title" | "description" | "category" | "occurredAt">
  >;
  financial?: Partial<
    Pick<
      Stage4EditableExpense,
      "original" | "economicDate" | "payerMemberId" | "settlementParticipation"
    >
  >;
  participantSplit?: {
    participants?: Stage4EditableExpense["participants"];
    splits?: ExpenseUserSplit[];
  };
};
export type ExpenseTypedIntent =
  | { type: "CREATE"; expense: Stage4EditableExpense }
  | { type: "UPDATE"; patch: ExpenseUserPatch }
  | {
      type: "APPLY_VALUATION";
      valuation: {
        localValuationId: string;
        localRateSnapshotId: string | null;
        policy: Exclude<ValuationPolicy, "LEGACY_IMPORTED">;
        economicDate?: string | null;
        settingsRevision?: number;
        rateAcceptance?: import("./rateAcceptance").DisplayedRateBinding;
        rateQuoteId: string | null;
        paymentRecordId: string | null;
        manualRate: string | null;
        reason: string | null;
        previewSettlement: Money;
      };
    }
  | { type: "DELETE" }
  | {
      type: "RESTORE";
      businessStatus: Stage4EditableExpense["businessStatus"];
    };

export function utcInstant(value: string): string {
  // Historical date-only occurredAt is UTC midnight; economicDate stays separate.
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/i.exec(
      value,
    );
  if (
    !match ||
    !Number.isFinite(Date.parse(value)) ||
    Number(match[2]) < 1 ||
    Number(match[2]) > 12 ||
    Number(match[3]) < 1 ||
    Number(match[3]) >
      new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate()
  )
    throw new Error("Expense timestamp must be a valid UTC instant.");
  return new Date(value).toISOString();
}

export function userSplitInput(splits: readonly ExpenseSplit[]): ExpenseUserSplit[] {
  return splits
    .map(({ memberId, method, originalMinor, weightUnits, percentageUnits }) => ({
      memberId,
      method,
      originalMinor,
      weightUnits,
      percentageUnits,
    }))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
}

export function sameExpenseValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length && left.every((v, i) => sameExpenseValue(v, right[i]))
    );
  if (left && right && typeof left === "object" && typeof right === "object") {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    const keys = Object.keys(a).sort();
    return (
      sameExpenseValue(keys, Object.keys(b).sort()) &&
      keys.every((key) => sameExpenseValue(a[key], b[key]))
    );
  }
  return false;
}

function participants(value: Stage4EditableExpense) {
  return [...value.participants].sort((a, b) => a.memberId.localeCompare(b.memberId));
}

export function expenseFinancialInput(value: Stage4EditableExpense) {
  return {
    original: value.original,
    economicDate: value.economicDate ?? null,
    payerMemberId: value.payerMemberId,
    settlementParticipation: value.settlementParticipation ?? "INCLUDED",
    participants: participants(value),
    splits: userSplitInput(value.splits),
  };
}

export function buildExpenseUserPatch(
  base: Stage4EditableExpense,
  submitted: Stage4EditableExpense,
): ExpenseUserPatch {
  const descriptive: NonNullable<ExpenseUserPatch["descriptive"]> = {};
  for (const key of ["title", "description", "category"] as const) {
    if (base[key] !== submitted[key])
      Object.assign(descriptive, { [key]: submitted[key] });
  }
  if (utcInstant(base.occurredAt) !== utcInstant(submitted.occurredAt))
    descriptive.occurredAt = utcInstant(submitted.occurredAt);
  const financial: NonNullable<ExpenseUserPatch["financial"]> = {};
  const a = expenseFinancialInput(base);
  const b = expenseFinancialInput(submitted);
  for (const key of [
    "original",
    "economicDate",
    "payerMemberId",
    "settlementParticipation",
  ] as const) {
    if (!sameExpenseValue(a[key], b[key])) Object.assign(financial, { [key]: b[key] });
  }
  const participantSplit: NonNullable<ExpenseUserPatch["participantSplit"]> = {};
  if (!sameExpenseValue(a.participants, b.participants))
    participantSplit.participants = b.participants;
  if (!sameExpenseValue(a.splits, b.splits)) participantSplit.splits = b.splits;
  return {
    ...(Object.keys(descriptive).length ? { descriptive } : {}),
    ...(Object.keys(financial).length ? { financial } : {}),
    ...(Object.keys(participantSplit).length ? { participantSplit } : {}),
  };
}

export function isEmptyExpensePatch(patch: ExpenseUserPatch): boolean {
  return [patch.descriptive, patch.financial, patch.participantSplit].every(
    (group) => !group || Object.keys(group).length === 0,
  );
}

// This is eligibility, not authorization: the locked Backend must verify history.
export function expensePatchEligibility(input: {
  base: Stage4EditableExpense;
  current: Stage4EditableExpense;
  patch: ExpenseUserPatch;
  verifiedHistoricalBase: boolean;
  deleted?: boolean;
}): "EQUIVALENT" | "DESCRIPTIVE_REBASE" | "CONFLICT" | "UNVERIFIED_BASE" {
  if (!input.verifiedHistoricalBase) return "UNVERIFIED_BASE";
  if (input.deleted) return "CONFLICT";
  if (isEmptyExpensePatch(input.patch)) {
    return sameExpenseValue(
      expenseFinancialInput(input.base),
      expenseFinancialInput(input.current),
    )
      ? "EQUIVALENT"
      : "CONFLICT";
  }
  if (input.patch.financial || input.patch.participantSplit) return "CONFLICT";
  if (
    !sameExpenseValue(
      expenseFinancialInput(input.base),
      expenseFinancialInput(input.current),
    )
  )
    return "CONFLICT";
  const automaticAcceptance =
    input.base.businessStatus === "RATE_REQUIRED" &&
    input.current.businessStatus === "ACCEPTED" &&
    input.current.valuation?.policy === "REFERENCE_RATE" &&
    input.current.valuation.referenceEvidence?.automatic === true;
  if (
    (!sameExpenseValue(input.base.valuation, input.current.valuation) ||
      input.base.businessStatus !== input.current.businessStatus) &&
    !automaticAcceptance
  )
    return "CONFLICT";
  let equivalent = true;
  for (const key of Object.keys(input.patch.descriptive ?? {}) as (keyof NonNullable<
    ExpenseUserPatch["descriptive"]
  >)[]) {
    const normalize = (value: unknown) =>
      key === "occurredAt" ? utcInstant(String(value)) : value;
    const target = normalize(input.patch.descriptive![key]);
    const current = normalize(input.current[key]);
    if (sameExpenseValue(target, current)) continue;
    equivalent = false;
    if (!sameExpenseValue(normalize(input.base[key]), current)) return "CONFLICT";
  }
  return equivalent ? "EQUIVALENT" : "DESCRIPTIVE_REBASE";
}

// Never rewrite the attempted payload/key. This only produces a recovery candidate.
export function legacyExpenseIntentCandidate(input: {
  operationType: string;
  base?: Stage4EditableExpense | null;
  submitted?: Stage4EditableExpense | null;
}): ExpenseTypedIntent | null {
  if (input.operationType === "LEDGER_DELETE_EXPENSE") return { type: "DELETE" };
  if (input.operationType === "LEDGER_RESTORE_EXPENSE")
    return input.submitted
      ? { type: "RESTORE", businessStatus: input.submitted.businessStatus }
      : null;
  if (input.operationType === "LEDGER_CREATE_EXPENSE")
    return input.submitted ? { type: "CREATE", expense: input.submitted } : null;
  if (input.operationType !== "LEDGER_UPDATE_EXPENSE" || !input.base || !input.submitted)
    return null;
  // A full aggregate may hide a valuation/lifecycle choice; do not invent a patch.
  if (
    !sameExpenseValue(input.base.valuation, input.submitted.valuation) ||
    input.base.businessStatus !== input.submitted.businessStatus
  )
    return null;
  return { type: "UPDATE", patch: buildExpenseUserPatch(input.base, input.submitted) };
}
