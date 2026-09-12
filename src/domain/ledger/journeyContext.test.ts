import { describe, expect, it } from "vitest";

import {
  chooseJourneyEntry,
  isJourneyCandidate,
  myLedgerPeriodBounds,
  type LedgerJourneyContext,
} from "./journeyContext";

const journey = (
  journeyId: string,
  startDate: string | null,
  endDate: string | null,
): LedgerJourneyContext => ({
  journeyId,
  title: journeyId,
  startDate,
  endDate,
  settlementCurrency: "NZD",
  settlementScale: 2,
});

describe("Stage 6 Journey context", () => {
  it("uses the approved partial-date candidate rules", () => {
    expect(
      isJourneyCandidate(journey("both", "2026-09-01", "2026-09-12"), "2026-09-12"),
    ).toBe(true);
    expect(isJourneyCandidate(journey("start", "2026-09-01", null), "2026-09-12")).toBe(
      true,
    );
    expect(isJourneyCandidate(journey("end", null, "2026-09-12"), "2026-09-12")).toBe(
      true,
    );
    expect(isJourneyCandidate(journey("none", null, null), "2026-09-12")).toBe(false);
  });

  it("prefers a valid persisted candidate and never guesses among several", () => {
    const journeys = [journey("a", "2026-09-01", null), journey("b", null, "2026-09-30")];
    expect(chooseJourneyEntry(journeys, "2026-09-12", "b")).toEqual({
      kind: "JOURNEY",
      journeyId: "b",
    });
    expect(chooseJourneyEntry(journeys, "2026-09-12", null)).toEqual({
      kind: "CHOOSE",
      candidateIds: ["a", "b"],
    });
    expect(chooseJourneyEntry([journey("x", null, null)], "2026-09-12", null)).toEqual({
      kind: "MY_LEDGER",
    });
  });

  it("keeps an explicit manual selection during refresh without auto-selecting it later", () => {
    const manual = [journey("historical", "2026-01-10", "2026-01-12")];
    expect(chooseJourneyEntry(manual, "2026-09-12", "historical", "historical")).toEqual({
      kind: "JOURNEY",
      journeyId: "historical",
    });
    expect(chooseJourneyEntry(manual, "2026-09-12", "historical")).toEqual({
      kind: "MY_LEDGER",
    });
  });

  it("turns local periods into explicit UTC bounds", () => {
    const now = new Date(2026, 8, 12, 12);
    expect(myLedgerPeriodBounds("30D", now).to).toBe(now.toISOString());
    expect(myLedgerPeriodBounds("YEAR", now).from).toBe(
      new Date(2026, 0, 1).toISOString(),
    );
    expect(myLedgerPeriodBounds("ALL", now)).toEqual({ from: null, to: null });
  });
});
