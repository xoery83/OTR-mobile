import type { Trip } from "@/domain/trip/types";
import { validateCalendarDate, nextCalendarDate } from "@/domain/trip/dayReadModel";

type TripListMetadata = Readonly<{
  id: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string | null;
}>;
export type TripGroups<T = Trip> = Readonly<{
  active: readonly T[];
  upcoming: readonly T[];
  undated: readonly T[];
  past: readonly T[];
}>;

const knownDate = (value: string | null): value is string => {
  if (!value) return false;
  try {
    validateCalendarDate(value);
    return true;
  } catch {
    return false;
  }
};

// A missing or invalid bound is undated; no lifecycle state is inferred from it.
export function groupLocalTrips<T extends TripListMetadata>(
  trips: readonly T[],
  today: string,
  acceptedTodayTripIds: ReadonlySet<string> = new Set(),
): TripGroups<T> {
  validateCalendarDate(today);
  const groups: { active: T[]; upcoming: T[]; undated: T[]; past: T[] } = {
    active: [],
    upcoming: [],
    undated: [],
    past: [],
  };
  for (const trip of trips) {
    const start = trip.startDate;
    const end = trip.endDate;
    if (!knownDate(start) || !knownDate(end) || end < start) {
      groups.undated.push(trip);
    } else if (acceptedTodayTripIds.has(trip.id)) {
      groups.active.push(trip);
    } else if (start > today) {
      groups.upcoming.push(trip);
    } else if (end < today) {
      groups.past.push(trip);
    } else {
      groups.active.push(trip);
    }
  }
  groups.active.sort(
    (a, b) => a.startDate!.localeCompare(b.startDate!) || a.id.localeCompare(b.id),
  );
  groups.upcoming.sort(
    (a, b) => a.startDate!.localeCompare(b.startDate!) || a.id.localeCompare(b.id),
  );
  groups.undated.sort(
    (a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.id.localeCompare(b.id),
  );
  groups.past.sort(
    (a, b) => b.endDate!.localeCompare(a.endDate!) || a.id.localeCompare(b.id),
  );
  return groups;
}

// A named accepted Day can be up to two calendar dates away from the device's
// local date across the full UTC−12…UTC+14 offset span. This only bounds reads;
// the accepted projection's own zone determines whether Open Today is valid.
export function possibleTodayTrips(trips: readonly Trip[], deviceToday: string): Trip[] {
  validateCalendarDate(deviceToday);
  const shifted = (days: number) => {
    const date = new Date(`${deviceToday}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const earliest = shifted(-2),
    latest = shifted(2);
  return trips.filter(
    (trip) =>
      knownDate(trip.startDate) &&
      knownDate(trip.endDate) &&
      trip.endDate >= trip.startDate &&
      trip.startDate <= latest &&
      trip.endDate >= earliest,
  );
}

export function wholeTripCalendarDates(
  trip: { startDate: string | null; endDate: string | null } | null,
  candidates: readonly string[],
  selected: string,
): string[] {
  const dates = new Set<string>([validateCalendarDate(selected)]);
  for (const date of candidates) {
    if (knownDate(date)) dates.add(date);
  }
  if (knownDate(trip?.startDate ?? null) && knownDate(trip?.endDate ?? null)) {
    const start = trip!.startDate!,
      end = trip!.endDate!;
    if (end >= start) {
      for (let date = start; ; date = nextCalendarDate(date)) {
        dates.add(date);
        if (date === end) break;
      }
    }
  }
  return [...dates].sort();
}
