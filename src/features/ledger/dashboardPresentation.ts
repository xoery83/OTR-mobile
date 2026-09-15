import type { LedgerJourneyContext } from "@/domain/ledger/journeyContext";
import type { ReportingScope } from "@/domain/ledger/reporting";

import { formatLedgerMoney } from "./format";

export function journeyLifecycleLabel(
  journey: Pick<LedgerJourneyContext, "startDate" | "endDate">,
  today: string,
) {
  const start = journey.startDate?.slice(0, 10) ?? null;
  const end = journey.endDate?.slice(0, 10) ?? null;
  if (start && start > today) return "Upcoming";
  if (end && end < today) return "Past";
  if (start && end && start <= today && today <= end) return "Active";
  return null;
}

export function settlementPositionLabel(minor: number) {
  if (minor < 0) return "You owe";
  if (minor > 0) return "You are owed";
  return "All settled";
}

export function spendingPercentage(part: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, Math.round((part / total) * 100))) : 0;
}

export function expenseAmountPresentation(
  expense: {
    componentMinor: number | null;
    originalCurrency: string;
    originalMinor: number;
    originalScale: number;
    participantCount: number;
    settlementCurrency: string;
    settlementMinor: number | null;
    settlementParticipation: "INCLUDED" | "EXCLUDED";
    settlementScale: number;
  },
  scope: ReportingScope,
) {
  const settlement =
    expense.settlementMinor === null
      ? null
      : formatLedgerMoney(
          expense.settlementMinor,
          expense.settlementCurrency,
          expense.settlementScale,
        );
  const primaryMinor =
    scope === "MINE" ? expense.componentMinor : expense.settlementMinor;
  return {
    primary:
      primaryMinor === null
        ? "—"
        : formatLedgerMoney(
            primaryMinor,
            expense.settlementCurrency,
            expense.settlementScale,
          ),
    total:
      scope === "MINE" && settlement && expense.componentMinor !== expense.settlementMinor
        ? `Total ${settlement}`
        : null,
    original:
      expense.originalCurrency === expense.settlementCurrency
        ? null
        : formatLedgerMoney(
            expense.originalMinor,
            expense.originalCurrency,
            expense.originalScale,
          ),
    splitLabel:
      expense.settlementParticipation === "INCLUDED" && expense.participantCount > 1
        ? "Split"
        : null,
  };
}
