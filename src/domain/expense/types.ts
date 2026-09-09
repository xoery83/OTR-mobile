export type ExpenseSyncStatus = "PENDING_CREATE" | "SYNCING" | "SYNCED" | "FAILED";

export type Expense = {
  id: string;
  serverId: string | null;
  tripId: string;
  title: string;
  amountMinor: number;
  currencyCode: string;
  paidByMemberId: string | null;
  occurredAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: ExpenseSyncStatus;
  syncVersion: number;
};

export type CreateExpenseInput = {
  tripId: string;
  title: string;
  amountMinor: number;
  currencyCode: string;
  paidByMemberId?: string | null;
  occurredAt?: string | null;
};
