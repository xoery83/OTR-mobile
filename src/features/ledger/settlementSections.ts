import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { Stage7Finalized, Stage7Preview } from "@/hooks/useStage7Settlement";

export type SettlementMember = { id: string; label: string };

export type SettlementExpenseRow = LedgerReportListItem & {
  splitMethod: LedgerExpense["splits"][number]["method"] | null;
};

export type SettlementCategory = {
  key: string;
  label: string;
  totalMinor: number;
  rows: SettlementExpenseRow[];
};

export type SettlementTransferView = {
  id: string | null;
  fromMemberId: string;
  toMemberId: string;
  amount: { minor: number; currency: string; scale: number };
  currency: string;
  scale: number;
  legacyPaymentCount: number;
};

export function buildSettlementCategories(
  rows: LedgerReportListItem[],
  expenses: LedgerExpense[],
  memberId: string | null,
): SettlementCategory[] {
  const raw = new Map(expenses.map((expense) => [expense.id, expense]));
  const grouped = new Map<string, SettlementCategory>();
  for (const row of rows) {
    if (row.componentMinor === null) continue;
    const category = grouped.get(row.category) ?? {
      key: row.category,
      label: row.category,
      totalMinor: 0,
      rows: [],
    };
    category.totalMinor += row.componentMinor;
    category.rows.push({
      ...row,
      splitMethod:
        raw.get(row.id)?.splits.find((split) => split.memberId === memberId)?.method ??
        raw.get(row.id)?.splits[0]?.method ??
        null,
    });
    grouped.set(row.category, category);
  }
  return [...grouped.values()].sort(
    (left, right) =>
      right.totalMinor - left.totalMinor || left.label.localeCompare(right.label),
  );
}

export function currentSettlementTransfers(
  finalized: Stage7Finalized | null,
  preview: Stage7Preview | null,
  display?: {
    transfers: {
      fromMemberId: string;
      toMemberId: string;
      amount: { minor: number; currency: string; scale: number };
    }[];
  } | null,
  lineage: Stage7Finalized[] = [],
): SettlementTransferView[] {
  if (finalized)
    return (lineage.length ? lineage : [finalized]).flatMap((version) =>
      version.transfers.map((transfer) => ({
        id: transfer.id,
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId,
        amount: transfer.amount,
        currency: version.settlementCurrency,
        scale: version.settlementScale,
        legacyPaymentCount: transfer.payments.length,
      })),
    );
  const source =
    preview?.state === "PREVIEW_READY" ? preview.transfers : display?.transfers;
  if (!source) return [];
  return source.map((transfer) => ({
    ...transfer,
    id: null,
    currency: transfer.amount.currency,
    scale: transfer.amount.scale,
    legacyPaymentCount: 0,
  }));
}

export function visibleSettlementTransfers<
  T extends { fromMemberId: string; toMemberId: string },
>(transfers: T[], actorMemberId: string | null, everyone: boolean, isOrganizer: boolean) {
  return everyone && isOrganizer
    ? transfers
    : transfers.filter(
        (transfer) =>
          transfer.fromMemberId === actorMemberId ||
          transfer.toMemberId === actorMemberId,
      );
}

export function visiblePersonalPayments(
  records: LocalPersonalPayment[],
  actorMemberId: string | null,
  everyone: boolean,
  isOrganizer: boolean,
) {
  return everyone && isOrganizer
    ? records
    : records.filter(
        (record) =>
          record.ownerMemberId === actorMemberId ||
          record.counterpartyMemberId === actorMemberId,
      );
}

export function memberName(members: SettlementMember[], id: string | null) {
  return members.find((member) => member.id === id)?.label ?? "Traveller";
}

export function splitLabel(method: SettlementExpenseRow["splitMethod"]) {
  return method?.startsWith("EQUAL") ? "Equal split" : method ? "Custom split" : "Split";
}
