import type { LedgerJourneyContext } from "@/domain/ledger/journeyContext";

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
