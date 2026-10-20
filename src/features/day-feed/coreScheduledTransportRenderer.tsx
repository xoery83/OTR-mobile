import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import type { CoreBoundaryView, CorePlaceView } from "@/domain/trip/tripCoreV2Day";
import { bindRenderer } from "./rendererContribution";
import {
  ScheduledTransportRow,
  type ScheduledTransportFacts,
} from "./ScheduledTransportRow";

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
export function createCoreScheduledTransportRenderer(
  projection: CoreFlightDayProjection,
) {
  const facts: Record<string, ScheduledTransportFacts> = {};
  for (const item of projection.items) {
    if (item.family !== "P5" || item.hidden) continue;
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
    if (!origin?.time?.localDate || !destination?.time?.localDate) continue;
    const service = item.details.service as Record<string, unknown> | undefined;
    facts[item.itemId] = {
      family: "P5",
      origin: {
        date: origin.time.localDate,
        ...(knownTransportClock(origin.time)
          ? {
              time: knownTransportClock(origin.time),
              plannedUnresolved: !origin.time.comparable,
            }
          : {}),
        ...(origin.place ? { place: origin.place } : {}),
      },
      destination: {
        date: destination.time.localDate,
        ...(knownTransportClock(destination.time)
          ? {
              time: knownTransportClock(destination.time),
              plannedUnresolved: !destination.time.comparable,
            }
          : {}),
        ...(destination.place ? { place: destination.place } : {}),
      },
      title: String(item.title),
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
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P5",
    facts,
    render: ScheduledTransportRow,
  });
}
