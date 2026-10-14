import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import type { CoreBoundaryView, CorePlaceView } from "@/domain/trip/tripCoreV2Day";
import { bindRenderer } from "./rendererContribution";
import { RentalRow, type RentalFacts } from "./RentalRow";

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
export function createCoreRentalRenderer(projection: CoreFlightDayProjection) {
  const facts: Record<string, RentalFacts> = {};
  for (const item of projection.items) {
    if (item.family !== "P4" || item.hidden) continue;
    const schedule = item.schedule as {
      start?: CoreBoundaryView;
      end?: CoreBoundaryView;
    };
    const start = schedule.start;
    if (!start?.localDate) continue;
    const details = item.details;
    const pickupPlace = details.pickupPlace as CorePlaceView | undefined;
    const returnPlace = details.returnPlace as CorePlaceView | undefined;
    const optional = (value: unknown) =>
      typeof value === "string" && value.trim() ? value : undefined;
    facts[item.itemId] = {
      family: "P4",
      pickup: {
        date: start.localDate,
        ...(knownRentalClock(start)
          ? { time: knownRentalClock(start), plannedUnresolved: !start.comparable }
          : {}),
        ...(pickupPlace ? { place: pickupPlace } : {}),
      },
      ...(schedule.end?.localDate
        ? {
            return: {
              date: schedule.end.localDate,
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
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P4",
    facts,
    render: RentalRow,
  });
}
