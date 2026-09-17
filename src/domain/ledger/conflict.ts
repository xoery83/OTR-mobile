import type {
  ExpenseBusinessStatus,
  ExpenseParticipant,
  ExpenseSettlementParticipation,
  ExpenseSplit,
  Money,
  SettlementValuationSnapshot,
} from "./types";

export type LedgerConflictFieldGroup =
  "FINANCIAL_CORE" | "DESCRIPTIVE" | "LINKS" | "EVIDENCE" | "LIFECYCLE";

export type Stage4EditableExpense = {
  title: string;
  description: string | null;
  category: string;
  occurredAt: string;
  economicDate?: string | null;
  payerMemberId: string;
  original: Money;
  businessStatus: Exclude<ExpenseBusinessStatus, "DELETED">;
  settlementParticipation?: ExpenseSettlementParticipation;
  participants: ExpenseParticipant[];
  splits: ExpenseSplit[];
  valuation: Omit<SettlementValuationSnapshot, "id"> | null;
};

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function changedExpenseGroups(
  left: Stage4EditableExpense,
  right: Stage4EditableExpense,
): LedgerConflictFieldGroup[] {
  const groups: LedgerConflictFieldGroup[] = [];
  if (
    !same(
      [
        left.original,
        left.economicDate ?? null,
        left.payerMemberId,
        left.participants,
        left.splits,
        left.valuation,
        left.settlementParticipation ?? "INCLUDED",
      ],
      [
        right.original,
        right.economicDate ?? null,
        right.payerMemberId,
        right.participants,
        right.splits,
        right.valuation,
        right.settlementParticipation ?? "INCLUDED",
      ],
    )
  ) {
    groups.push("FINANCIAL_CORE");
  }
  if (
    !same(
      [left.title, left.description, left.category, left.occurredAt],
      [right.title, right.description, right.category, right.occurredAt],
    )
  ) {
    groups.push("DESCRIPTIVE");
  }
  if (left.businessStatus !== right.businessStatus) groups.push("LIFECYCLE");
  return groups;
}

export function sameStage4Expense(
  left: Stage4EditableExpense,
  right: Stage4EditableExpense,
) {
  return changedExpenseGroups(left, right).length === 0;
}
