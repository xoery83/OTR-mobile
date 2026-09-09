import type { SyncableRecord } from "@/domain/sync/syncStatus";

export type LedgerConflictField =
  "amount" | "payer" | "currency" | "participants" | "splits";

export type Expense = SyncableRecord & {
  tripId: string;
  title: string;
  originalAmount: number;
  originalCurrency: string;
  settlementAmount: number;
  settlementCurrency: string;
  payerMemberId: string | null;
};
