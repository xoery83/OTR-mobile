import type { projectCoreItem } from "./tripCoreV2Views";
import type { CoreBoundaryView, CorePlaceView } from "./tripCoreV2Day";
import { validateCalendarDate } from "./dayReadModel";

export type SearchCategory = "ALL" | "TRIPS" | "ITINERARY";
export type SearchInput = {
  query: string;
  tripId: string | null;
  category: SearchCategory;
};
export type SearchResult = {
  category: Exclude<SearchCategory, "ALL">;
  id: string;
  tripId: string;
  tripName: string;
  title: string;
  date: string | null;
  family: string | null;
  rank: number;
};
export type SearchTrip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
};
export type SearchItem = NonNullable<ReturnType<typeof projectCoreItem>>;
const normalize = (s: string) =>
  s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const identifier = (s: string) => normalize(s).replace(/[\s-]/g, "");
function rank(
  query: string,
  id: string,
  title: string,
  fields: string[],
  identifiers: string[] = [],
  description?: string,
) {
  const q = normalize(query);
  if (!q) return null;
  if ([id, ...identifiers].some((value) => identifier(q) === identifier(value))) return 0;
  const name = normalize(title);
  if (q === name) return 1;
  if (name.startsWith(q)) return 2;
  if ([name, ...fields.map(normalize)].some((field) => field.includes(q))) return 3;
  if (description && normalize(description).includes(q)) return 5;
  return null;
}
export function searchDate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return validateCalendarDate(value);
  } catch {
    return null;
  }
}
export function matchSearchTrip(trip: SearchTrip, query: string): SearchResult | null {
  const score = rank(
    query,
    trip.id,
    trip.name,
    [trip.destination, searchDate(trip.start_date), searchDate(trip.end_date)].filter(
      (v): v is string => v !== null,
    ),
  );
  return score === null
    ? null
    : {
        category: "TRIPS",
        id: trip.id,
        tripId: trip.id,
        tripName: trip.name,
        title: trip.name,
        date: searchDate(trip.start_date),
        family: null,
        rank: score,
      };
}
export function itemSearchBoundary(item: SearchItem): CoreBoundaryView | undefined {
  const schedule = item.schedule as {
    start?: CoreBoundaryView;
    origin?: { time?: CoreBoundaryView };
  };
  return schedule.start ?? schedule.origin?.time;
}
export function matchSearchItem(
  item: SearchItem,
  trip: SearchTrip,
  query: string,
  canonicalDescription?: string,
): SearchResult | null {
  if (item.hidden || !["P1", "P2", "P3", "P4", "P5", "P6"].includes(item.family))
    return null;
  const schedule = item.schedule as {
    start?: CoreBoundaryView;
    end?: CoreBoundaryView;
    origin?: { place?: CorePlaceView; time?: CoreBoundaryView };
    destination?: { place?: CorePlaceView; time?: CoreBoundaryView };
  };
  const places = [
    item.place,
    schedule.origin?.place,
    schedule.destination?.place,
    item.details.pickupPlace,
    item.details.returnPlace,
    item.details.entryPlace,
  ] as (CorePlaceView | undefined)[];
  // Explicit allowlist of actor-readable Item fields. Never stringify details or
  // linked Booking/Ticket/Document summaries into matching/counts/snippets.
  const fields: string[] = places
    .flatMap((p) => [
      p?.authoredLabel,
      p?.authoredText,
      p?.authoredAddress,
      p?.acceptedAddress,
    ])
    .filter((v): v is string => typeof v === "string");
  for (const time of [
    schedule.start,
    schedule.end,
    schedule.origin?.time,
    schedule.destination?.time,
  ])
    if (time?.localDate) fields.push(time.localDate);
  for (const key of ["propertyName", "supplier", "sessionLabel", "category"])
    if (typeof item.details[key] === "string") fields.push(item.details[key] as string);
  const services = Array.isArray(item.details.services)
    ? item.details.services
    : item.details.service
      ? [item.details.service]
      : [];
  for (const service of services)
    for (const key of [
      "operatorLiteral",
      "operatorValue",
      "serviceNumber",
      "serviceLiteral",
      "transportSubtype",
    ]) {
      const value = (service as Record<string, unknown>)[key];
      if (typeof value === "string") fields.push(value);
    }
  const literals =
    item.family === "P2" && typeof item.details.flightNumberLiteral === "string"
      ? [item.details.flightNumberLiteral]
      : [];
  const score = rank(
    query,
    item.itemId,
    String(item.title),
    [...fields, ...literals],
    literals,
    canonicalDescription,
  );
  return score === null
    ? null
    : {
        category: "ITINERARY",
        id: item.itemId,
        tripId: trip.id,
        tripName: trip.name,
        title: String(item.title),
        date: searchDate(itemSearchBoundary(item)?.localDate),
        family: item.family,
        rank: score,
      };
}
export function searchPreset(
  entry: string | undefined,
  tripId: string | null,
): SearchInput {
  return {
    query: "",
    tripId: entry === "MY_TRIPS" ? null : tripId,
    category: entry === "MY_TRIPS" ? "TRIPS" : entry === "DAY" ? "ITINERARY" : "ALL",
  };
}
export function searchGroups(results: readonly SearchResult[], category: SearchCategory) {
  return (["TRIPS", "ITINERARY"] as const)
    .map((kind) => {
      const rows = results
        .filter((r) => r.category === kind)
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            a.tripId.localeCompare(b.tripId) ||
            a.id.localeCompare(b.id),
        );
      return {
        category: kind,
        count: rows.length,
        rows: category === "ALL" ? rows.slice(0, 3) : category === kind ? rows : [],
      };
    })
    .filter((group) => category !== "ALL" || group.count > 0);
}
