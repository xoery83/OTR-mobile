import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import type { CoreBoundaryView, CorePlaceView } from "@/domain/trip/tripCoreV2Day";
import type { ScheduledTransportFacts } from "./ScheduledTransportRow";
export function knownTransportClock(boundary: CoreBoundaryView | undefined) {
  return ["EXACT", "ESTIMATED"].includes(boundary?.quality ?? "") &&
    typeof boundary?.precision === "number" &&
    boundary.precision >= -1 &&
    boundary?.localTime
    ? boundary?.localTime.slice(0, 5)
    : undefined;
}

const optional = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

// The accepted Core item supplies schedule, service, Booking association and
// actor-readable entitlements. It does not supply original-file openers,
// passenger identities, Photos or Ledger capability, so those stay absent.
export function transportFactsFromItem(
  item: CoreFlightDayProjection["items"][number],
): ScheduledTransportFacts | null {
  if (item.family !== "P5" || item.hidden) return null;
  const schedule = item.schedule as {
    origin?: {
      time?: CoreBoundaryView;
      place?: CorePlaceView;
      platform?: string;
      pier?: string;
      terminal?: string;
    };
    destination?: {
      time?: CoreBoundaryView;
      place?: CorePlaceView;
    };
  };
  const origin = schedule.origin,
    destination = schedule.destination;
  if (!origin?.time?.localDate) return null;
  const service = item.details.service as Record<string, unknown> | undefined;
  return {
    family: "P5",
    origin: {
      date: origin.time.localDate,
      ...(origin.time.zoneId ? { zone: origin.time.zoneId } : {}),
      ...(knownTransportClock(origin.time)
        ? {
            time: knownTransportClock(origin.time),
            plannedUnresolved: !origin.time.comparable,
          }
        : {}),
      ...(origin.place ? { place: origin.place } : {}),
    },
    destination: {
      ...(destination?.time?.localDate ? { date: destination.time.localDate } : {}),
      ...(destination?.time?.zoneId ? { zone: destination.time.zoneId } : {}),
      ...(knownTransportClock(destination?.time)
        ? {
            time: knownTransportClock(destination?.time),
            plannedUnresolved: !destination?.time?.comparable,
          }
        : {}),
      ...(destination?.place ? { place: destination.place } : {}),
    },
    title: String(item.title),
    pending: item.localState === "PENDING",
    ...(typeof item.description === "string" ? { note: item.description } : {}),
    ...(optional(service?.transportSubtype)
      ? { subtype: service!.transportSubtype as string }
      : {}),
    ...(optional(service?.operatorLiteral)
      ? { operator: service!.operatorLiteral as string }
      : {}),
    ...(optional(service?.serviceLiteral) || optional(service?.serviceNumber)
      ? {
          service: (optional(service?.serviceLiteral) ??
            optional(service?.serviceNumber))!,
        }
      : {}),
    ...(item.bookingSummaries.length === 1
      ? { bookingMarker: String(item.bookingSummaries[0].title) }
      : {}),
    boarding: {
      ...(optional(origin.platform) ? { platform: origin.platform!.trim() } : {}),
      ...(optional(origin.pier) ? { pier: origin.pier!.trim() } : {}),
    },
  };
}

export const transportPlaceLabel = (endpoint: { place?: CorePlaceView }) =>
  [
    endpoint.place?.authoredLabel,
    endpoint.place?.authoredText,
    endpoint.place?.acceptedAddress,
    endpoint.place?.authoredAddress,
  ].find((value) => value?.trim());
// Coordinates and accepted addresses can drive exact directions. Authored
// labels are keyword search only, never promoted to trusted coordinates.
export function transportMapUrl(
  endpoint: {
    place?: CorePlaceView;
    date?: string;
    time?: string;
    plannedUnresolved?: boolean;
  },
  directions: boolean,
): string | null {
  const place = endpoint.place;
  if (!place) return null;
  const exact =
    typeof place.latitude === "number" &&
    typeof place.longitude === "number" &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    Math.abs(place.latitude) <= 90 &&
    Math.abs(place.longitude) <= 180;
  if (exact)
    return directions
      ? `https://maps.apple.com/?daddr=${place.latitude},${place.longitude}`
      : `https://maps.apple.com/?ll=${place.latitude},${place.longitude}`;
  const address = place.acceptedAddress?.trim();
  if (address)
    return `https://maps.apple.com/?${directions ? "daddr" : "q"}=${encodeURIComponent(address)}`;
  if (directions) return null;
  const keyword = transportPlaceLabel(endpoint)?.trim();
  return keyword ? `https://maps.apple.com/?q=${encodeURIComponent(keyword)}` : null;
}
