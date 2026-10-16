import { instantMicroseconds, localCalendarDate } from "./dayReadModel";
import type { CoreDayRow } from "./tripCoreV2Day";
import type { CoreFlightDayProjection } from "./tripCoreV2DayFeed";

export type TodayClock = Readonly<{ now: string; zone: string | null }>;
export type TodaysJourney = {
  date: string;
  zone: string;
  primary: CoreDayRow | null;
  primaryKind: "UPCOMING" | "PLANS" | "FREE";
  later: CoreDayRow[];
  tonight: CoreDayRow | null;
  multipleStays: boolean;
};

// Use the owning Day order and exact time facts; no NOW/Focus or attendance inference.
export function selectTodaysJourney(
  projection: CoreFlightDayProjection,
  clock: TodayClock,
): TodaysJourney | null {
  if (!clock.zone || clock.zone !== clock.zone.trim() || /^[+-]/.test(clock.zone))
    return null;
  const date = localCalendarDate(clock.now, clock.zone);
  const now = instantMicroseconds(clock.now);
  const query = projection.query(date, clock.zone);
  const eligible = query.coreRows.filter(
    (row) => row.family !== "P3" && !["cancelled", "skipped"].includes(row.status),
  );
  const trustedUpcoming = (row: CoreDayRow) =>
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
    .sort((a, b) => query.coreRows.indexOf(a) - query.coreRows.indexOf(b));
  const upcoming = rows.filter(trustedUpcoming).sort((a, b) => {
    const left = instantMicroseconds(a.displayTime!.instant!);
    const right = instantMicroseconds(b.displayTime!.instant!);
    return left < right ? -1 : left > right ? 1 : 0;
  })[0];
  const primary = upcoming ?? rows[0] ?? null;
  const start = primary ? rows.indexOf(primary) + 1 : 0;
  const stays = query.coreRows.filter((row, index, all) => {
    if (row.family !== "P3" || all.findIndex((r) => r.itemRef === row.itemRef) !== index)
      return false;
    const event = projection.events.find((event) => event.id === row.itemRef);
    const from = event?.boundaries.find((b) => b.role === "START")?.local_date;
    const until = event?.boundaries.find((b) => b.role === "END")?.local_date;
    return !!from && !!until && from <= date && date < until;
  });
  return {
    date,
    zone: clock.zone,
    primary,
    primaryKind: upcoming ? "UPCOMING" : primary ? "PLANS" : "FREE",
    later: rows.slice(start, start + 3),
    tonight: stays.length === 1 ? stays[0] : null,
    multipleStays: stays.length > 1,
  };
}
