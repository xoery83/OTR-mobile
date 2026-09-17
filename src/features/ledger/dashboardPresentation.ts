import type { LedgerJourneyContext } from "@/domain/ledger/journeyContext";
import type { ReportingBucket, ReportingScope } from "@/domain/ledger/reporting";

import { formatLedgerMoney } from "./format";

export type JourneyPickerItem = LedgerJourneyContext & {
  hasActor: boolean;
  memberCount: number;
};

export type JourneyPickerSection = {
  data: (JourneyPickerItem & { status: "ACTIVE" | "UPCOMING" | "PAST" })[];
  title: "Active" | "Upcoming" | "Past";
};

export function spendingMembers(
  members: { id: string; label: string }[],
  spending: ReportingBucket[],
) {
  const totals = new Map(spending.map((bucket) => [bucket.key, bucket.totalMinor]));
  return [...members].sort(
    (a, b) =>
      (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.label.localeCompare(b.label),
  );
}

export function shortMemberName(label: string) {
  return label.trim().split(/\s+/)[0] || "Traveller";
}

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

const developmentJourneyPattern =
  /\b(test|fixture|synthetic|simulator|acceptance|compatibility|blocker|smoke|prototype|legacy|replay)\b|^stage\s*\d/i;

export function journeyPickerSections(
  journeys: JourneyPickerItem[],
  today: string,
  selectedJourneyId: string | null,
  query = "",
  includeDevelopment = false,
): JourneyPickerSection[] {
  const needle = query.trim().toLocaleLowerCase();
  const groups: Record<JourneyPickerSection["title"], JourneyPickerSection["data"]> = {
    Active: [],
    Upcoming: [],
    Past: [],
  };
  for (const journey of journeys) {
    const lifecycle = journeyLifecycleLabel(journey, today);
    if (
      !lifecycle ||
      !journey.hasActor ||
      journey.memberCount < 1 ||
      (!includeDevelopment && developmentJourneyPattern.test(journey.title)) ||
      (needle && !journey.title.toLocaleLowerCase().includes(needle))
    )
      continue;
    const status = lifecycle.toUpperCase() as "ACTIVE" | "UPCOMING" | "PAST";
    groups[lifecycle].push({ ...journey, status });
  }
  groups.Active.sort(
    (left, right) =>
      Number(right.journeyId === selectedJourneyId) -
        Number(left.journeyId === selectedJourneyId) ||
      (left.endDate ?? "9999").localeCompare(right.endDate ?? "9999") ||
      left.title.localeCompare(right.title),
  );
  groups.Upcoming.sort(
    (left, right) =>
      (left.startDate ?? "9999").localeCompare(right.startDate ?? "9999") ||
      left.title.localeCompare(right.title),
  );
  groups.Past.sort(
    (left, right) =>
      (right.endDate ?? "").localeCompare(left.endDate ?? "") ||
      left.title.localeCompare(right.title),
  );
  return (["Active", "Upcoming", "Past"] as const)
    .filter((title) => groups[title].length)
    .map((title) => ({ title, data: groups[title] }));
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
    originalComponentMinor: number | null;
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
  const originalMinor =
    scope === "MINE" ? expense.originalComponentMinor : expense.originalMinor;
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
        : originalMinor === null
          ? "—"
          : formatLedgerMoney(
              originalMinor,
              expense.originalCurrency,
              expense.originalScale,
            ),
    splitLabel:
      expense.settlementParticipation === "INCLUDED" && expense.participantCount > 1
        ? "Split"
        : null,
  };
}
