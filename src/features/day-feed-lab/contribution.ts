import type { DayProjection } from "@/domain/trip/dayReadModel";
import { localCalendarDate, validateCalendarDate } from "@/domain/trip/dayReadModel";
import type { FlightService } from "@/domain/trip/flightAdmission";
import type { DayStreamPorts } from "@/features/day-feed/composition";
import type {
  DayFeedQuery,
  DayRowRenderer,
} from "@/features/day-feed/rendererContribution";

export type FixtureContribution<T = unknown> = Readonly<{
  version: "day-feed-lab/1";
  synthetic: true;
  id: string;
  title: string;
  dateRange: Readonly<{ start: string; end: string }>;
  dates: readonly string[];
  selectedDate: string;
  zone: string;
  instant: string;
  projection: DayProjection;
  services: Record<string, FlightService[]>;
  metadata: Readonly<{ summary: string; expected: readonly string[] }>;
  supplemental?: T;
  query?: (date: string, zone: string) => DayFeedQuery;
  renderer?: DayRowRenderer;
  ports?: Omit<DayStreamPorts, "focus" | "immersive">;
}>;
export function collectFixtureContributions(
  entries: readonly FixtureContribution[],
): readonly FixtureContribution[] {
  const trips = new Set<string>();
  for (const e of entries) {
    if (
      e.version !== "day-feed-lab/1" ||
      e.synthetic !== true ||
      !e.id ||
      trips.has(e.id)
    )
      throw new Error("DAY_LAB_CONTRIBUTION");
    trips.add(e.id);
    validateCalendarDate(e.dateRange.start);
    validateCalendarDate(e.dateRange.end);
    localCalendarDate(e.instant, e.zone);
    if (
      !Number.isFinite(Date.parse(e.instant)) ||
      e.projection.tripId !== e.id ||
      e.projection.version !== 1 ||
      !e.dates.length ||
      !e.dates.includes(e.selectedDate) ||
      new Set(e.dates).size !== e.dates.length ||
      e.dateRange.start > e.dateRange.end ||
      e.dates.some(
        (date, index) =>
          validateCalendarDate(date) < e.dateRange.start ||
          date > e.dateRange.end ||
          (index > 0 && e.dates[index - 1] >= date),
      ) ||
      new Set(e.projection.events.map((event) => event.id)).size !==
        e.projection.events.length ||
      (e.ports?.scope &&
        (e.ports.scope.accountId !== e.projection.accountId ||
          e.ports.scope.tripId !== e.id))
    )
      throw new Error("DAY_LAB_CONTRIBUTION");
  }
  return entries;
}
