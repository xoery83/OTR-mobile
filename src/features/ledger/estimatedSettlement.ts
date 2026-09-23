import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import { allocateSettlementFromOriginal } from "@/domain/ledger/allocation";
import { buildTransferPlan } from "@/domain/ledger/settlement";

import type { DisplayEstimate } from "./displayEstimate";
import { proposedExpenseDate } from "./expenseDraft";

export function unpublishedEstimateMessage(
  pendingPublicationIds: Set<string>,
  estimatedServerIds: Set<string>,
) {
  const count = [...pendingPublicationIds].filter((id) =>
    estimatedServerIds.has(id),
  ).length;
  return count
    ? `${count} ${count === 1 ? "value is" : "values are"} still estimated. Final settlement will be available after the reference rate is published.`
    : null;
}

export function estimatedSettlement(
  expenses: LedgerExpense[],
  memberIds: string[],
  currency: string,
  scale: number,
  estimates: Map<string, DisplayEstimate>,
  conflictedIds: Set<string>,
  policy: string | null = null,
) {
  const net = new Map(memberIds.map((id) => [id, 0n]));
  const paid = new Map(memberIds.map((id) => [id, 0n]));
  const owed = new Map(memberIds.map((id) => [id, 0n]));
  const blockers: { expenseId: string; reason: string }[] = [];
  let estimatedCount = 0;
  for (const expense of expenses) {
    if (
      expense.status === "DELETED" ||
      expense.status === "DRAFT" ||
      expense.settlementParticipation === "EXCLUDED"
    )
      continue;
    if (conflictedIds.has(expense.id)) {
      blockers.push({ expenseId: expense.id, reason: "Conflicting edit needs review" });
      continue;
    }
    const estimate = estimates.get(expense.id);
    const amount =
      expense.status === "ACCEPTED"
        ? expense.valuation?.settlement
        : expense.status === "RATE_REQUIRED"
          ? estimate?.money
          : null;
    if (!amount || amount.currency !== currency || amount.scale !== scale) {
      blockers.push({
        expenseId: expense.id,
        reason: !expense.economicDate
          ? proposedExpenseDate(expense)
            ? "Save Expense date"
            : "Add date"
          : policy === "MANUAL_AGREED"
            ? "Review agreed rate"
            : policy === "ACTUAL_PAYER_COST"
              ? "Review payment value"
              : "Journey value needs attention",
      });
      continue;
    }
    const splits =
      expense.status === "ACCEPTED"
        ? expense.splits
        : allocateSettlementFromOriginal(amount.minor, expense.splits);
    if (
      !net.has(expense.payerMemberId) ||
      splits.some(
        (split) => !net.has(split.memberId) || split.settlementMinor === null,
      ) ||
      splits.reduce((sum, split) => sum + BigInt(split.settlementMinor ?? 0), 0n) !==
        BigInt(amount.minor)
    ) {
      blockers.push({ expenseId: expense.id, reason: "Expense split needs attention" });
      continue;
    }
    net.set(
      expense.payerMemberId,
      net.get(expense.payerMemberId)! + BigInt(amount.minor),
    );
    paid.set(
      expense.payerMemberId,
      paid.get(expense.payerMemberId)! + BigInt(amount.minor),
    );
    for (const split of splits) {
      net.set(split.memberId, net.get(split.memberId)! - BigInt(split.settlementMinor!));
      owed.set(
        split.memberId,
        owed.get(split.memberId)! + BigInt(split.settlementMinor!),
      );
    }
    if (expense.status === "RATE_REQUIRED" && estimate) estimatedCount++;
  }
  const balances = memberIds.map((memberId) => ({
    memberId,
    minor: Number(net.get(memberId)!),
    paidMinor: Number(paid.get(memberId)!),
    owedMinor: Number(owed.get(memberId)!),
    currency,
    scale,
  }));
  if (
    balances.some(
      (balance) =>
        !Number.isSafeInteger(balance.minor) ||
        !Number.isSafeInteger(balance.paidMinor) ||
        !Number.isSafeInteger(balance.owedMinor),
    )
  )
    throw new Error("Preview total is unsafe.");
  return {
    balances,
    transfers: buildTransferPlan(balances),
    estimatedCount,
    blockers,
  };
}
