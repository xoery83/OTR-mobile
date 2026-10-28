import type { createTripDayFeedReader } from "@/data/repositories/tripDayFeedRepository";
import type { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import {
  unresolvedDayHeaderDestination,
  type DayHeaderDestination,
} from "./dayHeaderPresentation";

type Item = NonNullable<ReturnType<typeof projectCoreItem>>;
type Read = Awaited<ReturnType<ReturnType<typeof createTripDayFeedReader>["trip"]>>;
export type DayHeaderDestinationRead = {
  tripId: string;
  accountId: string;
  generation: number;
  items: readonly Item[];
};
export function dayHeaderDestinationRead(
  read: Read | null,
): DayHeaderDestinationRead | null {
  if (!read) return null;
  const tripId = read.observed?.projection.tripId ?? read.localManual?.scope.tripId;
  if (!tripId) return null;
  const local = read.localManual?.items ?? [],
    localIds = new Set(local.map((item) => item.itemId));
  const accepted =
    read.observed?.projection.version === 2 ? read.observed.projection.items : [];
  return {
    ...read.scope,
    tripId,
    items: [...accepted.filter((item) => !localIds.has(item.itemId)), ...local],
  };
}
type Area = { identity: string; label: string };
function acceptedArea(item: Item): Area | null {
  const place = item.place,
    refs = place?.spatialProvenanceRefs;
  // Coordinates qualify navigation, not a city; only the reviewed owning input can qualify these fields.
  if (
    !place ||
    refs?.source !== "MANUAL_USER_REVIEWED_APPLE_SELECTION_V1" ||
    refs.acceptance !== "USER_CONFIRMED_SAVE" ||
    !Number.isSafeInteger(place.locationInputRevision) ||
    refs.input_revision !== String(place.locationInputRevision)
  )
    return null;
  const locality = place.acceptedAddressLocality?.trim(),
    region = place.acceptedAddressRegion?.trim(),
    country = place.acceptedAddressCountry?.trim();
  if (!country || (!locality && !region)) return null;
  return {
    identity: JSON.stringify([country, region ?? null, locality ?? null]),
    label: locality || region!,
  };
}
export function resolveDayHeaderDestination(
  read: DayHeaderDestinationRead,
  date: string,
): DayHeaderDestination {
  try {
    validateCalendarDate(date);
  } catch {
    return unresolvedDayHeaderDestination;
  }
  const stays = read.items.flatMap((item) => {
    if (
      item.tripId !== read.tripId ||
      item.family !== "P3" ||
      item.hidden ||
      ["cancelled", "skipped"].includes(String(item.status)) ||
      item.visibility !== "GROUP" ||
      item.participation.mode !== "WHOLE_GROUP"
    )
      return [];
    const schedule = item.schedule as {
      start?: { localDate?: string };
      end?: { localDate?: string };
    };
    const start = schedule.start?.localDate,
      end = schedule.end?.localDate;
    try {
      validateCalendarDate(start!);
      validateCalendarDate(end!);
    } catch {
      return [];
    }
    if (!start || !end || start > date || end < date || end < start) return [];
    return [{ start, end, area: acceptedArea(item) }];
  });
  // No fabricated explicit-Day, transport-Journey order or confirmed-activity port.
  if (!stays.length || stays.some((stay) => !stay.area))
    return unresolvedDayHeaderDestination;
  const places = new Map(stays.map((stay) => [stay.area!.identity, stay.area!]));
  const single = (area: Area): DayHeaderDestination => ({
    kind: "single",
    source: "stay",
    label: area.label,
  });
  if (places.size === 1) return single(places.values().next().value!);
  const departures = stays.filter((stay) => stay.start < date && stay.end === date);
  const arrivals = stays.filter((stay) => stay.start === date && stay.end > date);
  if (departures.length + arrivals.length !== stays.length)
    return unresolvedDayHeaderDestination;
  const from = new Map(departures.map((stay) => [stay.area!.identity, stay.area!]));
  const to = new Map(arrivals.map((stay) => [stay.area!.identity, stay.area!]));
  if (from.size !== 1 || to.size !== 1) return unresolvedDayHeaderDestination;
  const origin = from.values().next().value!,
    destination = to.values().next().value!;
  // The approved bilingual route separator formats business place labels, not inferred movement.
  return origin.identity === destination.identity
    ? single(origin)
    : {
        kind: "route",
        source: "stay",
        label: [origin.label, destination.label].join(" → "),
      };
}
