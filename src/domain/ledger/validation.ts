import { assertMoney, assertSameCurrency } from "./money";
import type { ExpenseAggregate } from "./types";

export type ExpenseValidationIssue = {
  code: string;
  field: string;
};

export function validateExpenseAggregate(
  expense: ExpenseAggregate,
  journeyMemberIds: ReadonlySet<string>,
): ExpenseValidationIssue[] {
  const issues: ExpenseValidationIssue[] = [];
  try {
    assertMoney(expense.original, "Original amount");
  } catch {
    issues.push({ code: "INVALID_ORIGINAL_MONEY", field: "original" });
  }
  if (expense.original.minor <= 0) {
    issues.push({ code: "AMOUNT_NOT_POSITIVE", field: "original.minor" });
  }
  if (!journeyMemberIds.has(expense.payerMemberId)) {
    issues.push({ code: "INVALID_PAYER", field: "payerMemberId" });
  }
  const participantIds = expense.participants.map((item) => item.memberId);
  if (
    participantIds.length === 0 ||
    new Set(participantIds).size !== participantIds.length
  ) {
    issues.push({ code: "INVALID_PARTICIPANTS", field: "participants" });
  }
  if (participantIds.some((id) => !journeyMemberIds.has(id))) {
    issues.push({ code: "PARTICIPANT_OUTSIDE_JOURNEY", field: "participants" });
  }
  const splitIds = expense.splits.map((split) => split.memberId);
  if (
    splitIds.length !== participantIds.length ||
    splitIds.some((id) => !participantIds.includes(id)) ||
    new Set(splitIds).size !== splitIds.length
  ) {
    issues.push({ code: "SPLIT_PARTICIPANT_MISMATCH", field: "splits" });
  }
  if (
    expense.splits.some((split) => !Number.isSafeInteger(split.originalMinor)) ||
    expense.splits.reduce((sum, split) => sum + split.originalMinor, 0) !==
      expense.original.minor
  ) {
    issues.push({ code: "ORIGINAL_SPLIT_MISMATCH", field: "splits.originalMinor" });
  }
  if (expense.valuation) {
    try {
      assertSameCurrency(expense.original, expense.valuation.original);
      assertMoney(expense.valuation.settlement, "Settlement valuation");
    } catch {
      issues.push({ code: "VALUATION_CURRENCY_MISMATCH", field: "valuation" });
    }
    if (expense.valuation.original.minor !== expense.original.minor) {
      issues.push({ code: "VALUATION_ORIGINAL_MISMATCH", field: "valuation.original" });
    }
    const settlementTotal = expense.splits.reduce(
      (sum, split) => sum + (split.settlementMinor ?? 0),
      0,
    );
    if (
      expense.splits.some((split) => split.settlementMinor === null) ||
      settlementTotal !== expense.valuation.settlement.minor
    ) {
      issues.push({ code: "SETTLEMENT_SPLIT_MISMATCH", field: "splits.settlementMinor" });
    }
  } else if (expense.status === "ACCEPTED") {
    issues.push({ code: "VALUATION_REQUIRED", field: "valuation" });
  }
  if (
    expense.status === "RATE_REQUIRED" &&
    (expense.valuation !== null ||
      expense.splits.some((split) => split.settlementMinor !== null))
  ) {
    issues.push({ code: "RATE_REQUIRED_HAS_VALUATION", field: "valuation" });
  }
  return issues;
}
