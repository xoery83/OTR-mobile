import type { LedgerExpenseDatabase } from "./ledgerExpenseRepository";

export function canEditLedgerExpense(role: string | null | undefined, locked: boolean) {
  return !locked && (role === "owner" || role === "group_member");
}

export async function assertLedgerExpenseEditable(
  database: LedgerExpenseDatabase,
  userId: string,
  journeyId: string,
  expenseId: string,
  serverId: string | null,
) {
  const actor = await database.getFirstAsync<{ role: string | null }>(
    "SELECT role FROM ledger_actor_context WHERE user_id = ? AND journey_id = ?",
    userId,
    journeyId,
  );
  if (!canEditLedgerExpense(actor?.role, false))
    throw new Error("Expense write access is required.");
  const frozen = await database.getFirstAsync<{ found: number }>(
    `SELECT 1 AS found FROM ledger_settlement_inputs input
     JOIN ledger_settlements settlement ON settlement.id = input.settlement_id
     WHERE input.expense_id IN (?, ?) AND settlement.status IN
       ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED') LIMIT 1`,
    expenseId,
    serverId,
  );
  if (frozen)
    throw new Error("This Expense belongs to a completed settlement and is read-only.");
}
