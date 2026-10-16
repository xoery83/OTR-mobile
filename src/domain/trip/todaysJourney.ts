import {
  instantMicroseconds,
  localCalendarDate,
  validateCalendarDate,
} from "./dayReadModel";
import type { CoreDayRow } from "./tripCoreV2Day";
import type { CoreFlightDayProjection } from "./tripCoreV2DayFeed";

export type TodayClock = Readonly<{
  now: string;
  zone: string | null;
  planningDate?: string | null;
}>;
export type TodaysJourney = {
  date: string;
  zone: string | null;
  primary: CoreDayRow | null;
  primaryKind: "UPCOMING" | "PLANS" | "FREE";
  later: CoreDayRow[];
  tonight: CoreDayRow | null;
  multipleStays: boolean;
};

// Unknown travel context needs an explicit planning date, never the phone's calendar.
export function journeyCalendarDate(clock: TodayClock): string | null {
  if (clock.zone === null) {
    if (!clock.planningDate) return null;
    validateCalendarDate(clock.planningDate);
    return clock.planningDate;
  }
  if (!clock.zone || clock.zone !== clock.zone.trim() || /^[+-]/.test(clock.zone))
    return null;
  return localCalendarDate(clock.now, clock.zone);
}

// Use the owning Day order and exact time facts; no NOW/Focus or attendance inference.
export function selectTodaysJourney(
  projection: CoreFlightDayProjection,
  clock: TodayClock,
): TodaysJourney | null {
  const date = journeyCalendarDate(clock);
  if (!date) return null;
  const query = projection.query(date, clock.zone ?? "");
  return selectTodaysJourneyRows(query.coreRows, clock.now, date, clock.zone, (id) => {
    const event = projection.events.find((event) => event.id === id);
    return {
      from: event?.boundaries.find((b) => b.role === "START")?.local_date,
      until: event?.boundaries.find((b) => b.role === "END")?.local_date,
    };
  });
}

// Both accepted Day and committed local manual Day use the same selection rules.
export function selectTodaysJourneyRows(
  coreRows: CoreDayRow[],
  nowText: string,
  date: string,
  zone: string | null,
  stayCoverage: (id: string) => { from?: string | null; until?: string | null },
): TodaysJourney {
  const now = instantMicroseconds(nowText);
  const eligible = coreRows.filter(
    (row) => row.family !== "P3" && !["cancelled", "skipped"].includes(row.status),
  );
  const trustedUpcoming = (row: CoreDayRow) =>
    zone !== null &&
    row.position === "TIMELINE" &&
    row.displayTime?.comparable === true &&
    row.displayTime.quality === "EXACT" &&
    !!row.displayTime.instant &&
    instantMicroseconds(row.displayTime.instant) >= now;
  // A transport can have two rows today; retain its next boundary without duplicating the item.
  const ids = [...new Set(eligible.map((row) => row.itemRef))];
  const rows = ids
    .map(
      (id) =>
        eligible.find((row) => row.itemRef === id && trustedUpcoming(row)) ??
        eligible.find((row) => row.itemRef === id)!,
    )
    .sort((a, b) => coreRows.indexOf(a) - coreRows.indexOf(b));
  const upcoming = rows.filter(trustedUpcoming).sort((a, b) => {
    const left = instantMicroseconds(a.displayTime!.instant!);
    const right = instantMicroseconds(b.displayTime!.instant!);
    return left < right ? -1 : left > right ? 1 : 0;
  })[0];
  const primary = upcoming ?? rows[0] ?? null;
  const start = primary ? rows.indexOf(primary) + 1 : 0;
  const stays = coreRows.filter((row, index, all) => {
    if (
      row.family !== "P3" ||
      ["cancelled", "skipped"].includes(row.status) ||
      all.findIndex((r) => r.itemRef === row.itemRef) !== index
    )
      return false;
    const { from, until } = stayCoverage(row.itemRef);
    return !!from && !!until && from <= date && date < until;
  });
  return {
    date,
    zone,
    primary,
    primaryKind: upcoming ? "UPCOMING" : primary ? "PLANS" : "FREE",
    later: rows.slice(start, start + 3),
    tonight: stays.length === 1 ? stays[0] : null,
    multipleStays: stays.length > 1,
  };
}
