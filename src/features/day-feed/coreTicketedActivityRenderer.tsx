import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import type { CoreBoundaryView, CorePlaceView } from "@/domain/trip/tripCoreV2Day";
import { bindRenderer } from "./rendererContribution";
import { TicketedActivityRow, type TicketedActivityFacts } from "./TicketedActivityRow";

const optional = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

// Preserve authored local planned clocks even when the Core instant is not yet
// comparable. The row labels that state; it never changes TNS placement.
export function activityPlannedClock(boundary: CoreBoundaryView | undefined) {
  return boundary?.localTime &&
    typeof boundary.precision === "number" &&
    boundary.precision >= 0 &&
    ["EXACT", "ESTIMATED"].includes(boundary.quality ?? "")
    ? { time: boundary.localTime.slice(0, 5), plannedUnresolved: !boundary.comparable }
    : undefined;
}

// The accepted Core item has schedule, place, generic admission text and
// Booking association. It has no typed required-arrival clock, authorized
// original opener, per-person seat, Photo or Ledger capability to bind here.
export function coreTicketedActivityFacts(
  projection: CoreFlightDayProjection,
): Record<string, TicketedActivityFacts> {
  const facts: Record<string, TicketedActivityFacts> = {};
  for (const item of projection.items) {
    if (item.family !== "P6" || item.hidden) continue;
    const start = (item.schedule as { start?: CoreBoundaryView }).start;
    if (!start?.localDate) continue;
    const details = item.details;
    const clock = activityPlannedClock(start);
    facts[item.itemId] = {
      family: "P6",
      title: String(item.title),
      start: {
        date: start.localDate,
        ...(clock
          ? { time: clock.time, plannedUnresolved: clock.plannedUnresolved }
          : {}),
      },
      ...(item.place ? { venue: item.place as CorePlaceView } : {}),
      ...(details.entryPlace ? { entryPlace: details.entryPlace as CorePlaceView } : {}),
      ...(optional(details.sessionLabel)
        ? { session: optional(details.sessionLabel) }
        : {}),
      ...(optional(details.admissionNote)
        ? { admissionLine: optional(details.admissionNote) }
        : {}),
    };
  }
  return facts;
}

export function createCoreTicketedActivityRenderer(projection: CoreFlightDayProjection) {
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P6",
    facts: coreTicketedActivityFacts(projection),
    render: TicketedActivityRow,
  });
}
