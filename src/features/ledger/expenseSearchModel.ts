import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import type { ReportingScope } from "@/domain/ledger/reporting";
import { formatLedgerMoney } from "./format";

export type ExpenseSearchView =
  | { type: "mine"; memberId: string }
  | { type: "person"; memberId: string }
  | { type: "group"; memberId: string; paidMemberId?: string };

export function expenseSearchView(params: {
  memberId?: string;
  selectedMemberId?: string;
  paidMemberId?: string;
  scope?: ReportingScope;
}): ExpenseSearchView {
  if (params.paidMemberId)
    return {
      type: "group",
      memberId: params.memberId ?? "",
      paidMemberId: params.paidMemberId,
    };
  if (params.selectedMemberId)
    return params.selectedMemberId === params.memberId
      ? { type: "mine", memberId: params.selectedMemberId }
      : { type: "person", memberId: params.selectedMemberId };
  if (params.scope === "GROUP") return { type: "group", memberId: params.memberId ?? "" };
  return { type: "mine", memberId: params.memberId ?? "" };
}

export function expenseSearchAmounts(row: LedgerReportListItem, view: ExpenseSearchView) {
  const group = view.type === "group";
  const journeyMinor = group ? row.settlementMinor : row.componentMinor;
  const originalMinor = group ? row.originalMinor : row.originalComponentMinor;
  return {
    primary:
      journeyMinor === null
        ? "Journey value unavailable"
        : formatLedgerMoney(journeyMinor, row.settlementCurrency, row.settlementScale),
    secondary:
      (journeyMinor === null || row.originalCurrency !== row.settlementCurrency) &&
      originalMinor !== null
        ? formatLedgerMoney(originalMinor, row.originalCurrency, row.originalScale)
        : null,
  };
}
