import { assertMoney } from "./money";
import type {
  ExpenseAggregate,
  MemberBalance,
  Money,
  SettlementTransferPlan,
} from "./types";

export function calculateMemberBalances(
  expenses: ExpenseAggregate[],
  memberIds: string[],
  currency: string,
  scale: number,
): MemberBalance[] {
  const values = new Map(memberIds.map((memberId) => [memberId, 0]));
  for (const expense of expenses) {
    if (expense.status !== "ACCEPTED" || !expense.valuation) continue;
    const settlement = expense.valuation.settlement;
    assertMoney(settlement, "Settlement valuation");
    if (settlement.currency !== currency || settlement.scale !== scale) {
      throw new Error("Expense settlement currency does not match Journey.");
    }
    if (!values.has(expense.payerMemberId))
      throw new Error("Payer is not in settlement.");
    values.set(
      expense.payerMemberId,
      values.get(expense.payerMemberId)! + settlement.minor,
    );
    for (const split of expense.splits) {
      if (!values.has(split.memberId))
        throw new Error("Participant is not in settlement.");
      if (split.settlementMinor === null)
        throw new Error("Settlement split is unresolved.");
      values.set(split.memberId, values.get(split.memberId)! - split.settlementMinor);
    }
  }
  const balances = memberIds.map((memberId) => ({
    memberId,
    minor: values.get(memberId) ?? 0,
    currency,
    scale,
  }));
  if (balances.reduce((sum, balance) => sum + balance.minor, 0) !== 0) {
    throw new Error("Settlement balances do not net to zero.");
  }
  return balances;
}

export function buildTransferPlan(balances: MemberBalance[]): SettlementTransferPlan[] {
  if (balances.length === 0) return [];
  const currency = balances[0].currency;
  const scale = balances[0].scale;
  if (
    balances.some((balance) => balance.currency !== currency || balance.scale !== scale)
  ) {
    throw new Error("All balances must use one settlement currency.");
  }
  if (balances.reduce((sum, balance) => sum + balance.minor, 0) !== 0) {
    throw new Error("Settlement balances do not net to zero.");
  }
  const debtors = balances
    .filter((balance) => balance.minor < 0)
    .map((balance) => ({ memberId: balance.memberId, minor: -balance.minor }))
    .sort((a, b) => b.minor - a.minor || a.memberId.localeCompare(b.memberId));
  const creditors = balances
    .filter((balance) => balance.minor > 0)
    .map((balance) => ({ memberId: balance.memberId, minor: balance.minor }))
    .sort((a, b) => b.minor - a.minor || a.memberId.localeCompare(b.memberId));
  const transfers: SettlementTransferPlan[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const minor = Math.min(debtor.minor, creditor.minor);
    const amount: Money = { minor, currency, scale };
    transfers.push({
      fromMemberId: debtor.memberId,
      toMemberId: creditor.memberId,
      amount,
    });
    debtor.minor -= minor;
    creditor.minor -= minor;
    if (debtor.minor === 0) debtorIndex += 1;
    if (creditor.minor === 0) creditorIndex += 1;
  }
  return transfers;
}
