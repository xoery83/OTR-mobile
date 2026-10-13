import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import { bindRenderer } from "./rendererContribution";
import { StayRow, type StayFacts } from "./StayRow";

// Read-only presentation. Original files, guests, photos, Ledger and mutations need
// their owning capability before their optional StayRow actions can be supplied.
export function createCoreStayRenderer(projection: CoreFlightDayProjection) {
  const facts: Record<string, StayFacts> = {};
  for (const item of projection.items) {
    if (item.family !== "P3" || item.hidden) continue;
    const event = projection.events.find((entry) => entry.id === item.itemId);
    const schedule = item.schedule as {
      start?: { localDate?: string };
      end?: { localDate?: string };
    };
    const start = schedule.start?.localDate,
      end = schedule.end?.localDate,
      nights = item.details.nights;
    if (
      !event ||
      event.temporal_shape !== "STAY" ||
      !start ||
      !end ||
      typeof nights !== "number" ||
      !Number.isSafeInteger(nights) ||
      nights < 1
    )
      continue;
    facts[item.itemId] = {
      family: "P3",
      checkin: start,
      checkout: end,
      nights,
      ...(typeof item.details.propertyName === "string"
        ? { propertyName: item.details.propertyName }
        : {}),
      ...(typeof item.details.permittedCheckoutBy === "string"
        ? { checkoutBy: item.details.permittedCheckoutBy }
        : {}),
      ...(event.accepted_address_locality || event.authored_address_locality
        ? { area: event.accepted_address_locality ?? event.authored_address_locality! }
        : {}),
    };
  }
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P3",
    facts,
    render: StayRow,
  });
}
