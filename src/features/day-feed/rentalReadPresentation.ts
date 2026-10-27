import { localCalendarDate } from "@/domain/trip/dayReadModel";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import type { CoreBoundaryView, CorePlaceView } from "@/domain/trip/tripCoreV2Day";
import type { RentalFacts } from "./RentalRow";
// Read-only accepted Core facts. Holder/driver, original openers, photos, Ledger
// values, stable vehicle ordinals and mutations need their owning capabilities.
export function knownRentalClock(boundary: CoreBoundaryView | undefined) {
  return ["EXACT", "ESTIMATED"].includes(boundary?.quality ?? "") &&
    typeof boundary?.precision === "number" &&
    boundary.precision >= -1 &&
    boundary?.localTime
    ? boundary?.localTime.slice(0, 5)
    : undefined;
}
export function rentalFactsFromItem(
  item: CoreFlightDayProjection["items"][number],
): RentalFacts | null {
  if (
    item.family !== "P4" ||
    item.hidden ||
    ["cancelled", "skipped"].includes(String(item.status))
  )
    return null;
  const schedule = item.schedule as {
    start?: CoreBoundaryView;
    end?: CoreBoundaryView;
  };
  const start = schedule.start;
  if (!start?.localDate) return null;
  const details = item.details;
  const pickupPlace = details.pickupPlace as CorePlaceView | undefined;
  const returnPlace = details.returnPlace as CorePlaceView | undefined;
  const optional = (value: unknown) =>
    typeof value === "string" && value.trim() ? value : undefined;
  return {
    family: "P4",
    pickup: {
      date: start.localDate,
      zone: start.zoneId,
      ...(knownRentalClock(start)
        ? { time: knownRentalClock(start), plannedUnresolved: !start.comparable }
        : {}),
      ...(pickupPlace ? { place: pickupPlace } : {}),
    },
    ...(schedule.end?.localDate
      ? {
          return: {
            date: schedule.end.localDate,
            zone: schedule.end.zoneId,
            ...(knownRentalClock(schedule.end)
              ? {
                  time: knownRentalClock(schedule.end),
                  plannedUnresolved: !schedule.end.comparable,
                }
              : {}),
            ...(returnPlace ? { place: returnPlace } : {}),
          },
        }
      : {}),
    ...(optional(details.supplier) ? { supplier: details.supplier as string } : {}),
    ...(optional(details.reservedCategory)
      ? { bookedClass: details.reservedCategory as string }
      : {}),
    ...(optional(details.actualVehicleModel)
      ? { actualModel: details.actualVehicleModel as string }
      : {}),
    ...(optional(details.verifiedPlate)
      ? { plate: details.verifiedPlate as string }
      : {}),
  };
}

// Relative display state follows the current endpoint's known zone, never an invented instant.
export function rentalTemporalContext(
  facts: RentalFacts,
  role: "PICKUP" | "RETURN",
  instant: string,
  floatingDate: string,
) {
  const endpoint = role === "RETURN" ? facts.return : facts.pickup;
  if (!endpoint) return "UNKNOWN";
  try {
    const today = endpoint.zone
      ? localCalendarDate(instant, endpoint.zone)
      : floatingDate;
    return endpoint.date < today ? "PAST" : endpoint.date === today ? "TODAY" : "FUTURE";
  } catch {
    return "UNKNOWN";
  }
}
