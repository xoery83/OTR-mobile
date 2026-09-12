export type LedgerJourneyContext = {
  journeyId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  settlementCurrency: string;
  settlementScale: number;
};

export type JourneyEntry =
  | { kind: "JOURNEY"; journeyId: string }
  | { kind: "CHOOSE"; candidateIds: string[] }
  | { kind: "MY_LEDGER" };

export function isJourneyCandidate(
  journey: Pick<LedgerJourneyContext, "startDate" | "endDate">,
  today: string,
) {
  if (journey.startDate && journey.endDate)
    return journey.startDate <= today && today <= journey.endDate;
  if (journey.startDate) return today >= journey.startDate;
  if (journey.endDate) return today <= journey.endDate;
  return false;
}

export function chooseJourneyEntry(
  journeys: LedgerJourneyContext[],
  today: string,
  persistedJourneyId: string | null,
  explicitJourneyId?: string,
): JourneyEntry {
  if (
    explicitJourneyId &&
    journeys.some((journey) => journey.journeyId === explicitJourneyId)
  ) {
    return { kind: "JOURNEY", journeyId: explicitJourneyId };
  }
  const candidates = journeys.filter((journey) => isJourneyCandidate(journey, today));
  if (
    persistedJourneyId &&
    candidates.some((journey) => journey.journeyId === persistedJourneyId)
  ) {
    return { kind: "JOURNEY", journeyId: persistedJourneyId };
  }
  if (candidates.length === 1)
    return { kind: "JOURNEY", journeyId: candidates[0].journeyId };
  if (candidates.length > 1)
    return {
      kind: "CHOOSE",
      candidateIds: candidates.map((journey) => journey.journeyId),
    };
  return { kind: "MY_LEDGER" };
}

export type MyLedgerPeriod = "30D" | "YEAR" | "ALL";

export function myLedgerPeriodBounds(period: MyLedgerPeriod, now: Date) {
  if (period === "ALL") return { from: null, to: null };
  const to = new Date(now);
  const from =
    period === "30D"
      ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      : new Date(now.getFullYear(), 0, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
