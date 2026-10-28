import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import type { CoreBoundaryView, CorePlaceView } from "@/domain/trip/tripCoreV2Day";
import type { TicketedActivityFacts } from "./TicketedActivityRow";
const optional = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
export function activityPlannedClock(boundary: CoreBoundaryView | undefined) {
  return boundary?.localTime &&
    typeof boundary.precision === "number" &&
    boundary.precision >= -1 &&
    ["EXACT", "ESTIMATED"].includes(boundary.quality ?? "")
    ? { time: boundary.localTime.slice(0, 5), plannedUnresolved: !boundary.comparable }
    : undefined;
}
export function activityFactsFromItem(
  item: CoreFlightDayProjection["items"][number],
): TicketedActivityFacts | null {
  if (item.family !== "P6" || item.hidden) return null;
  const { start, end } = item.schedule as {
    start?: CoreBoundaryView;
    end?: CoreBoundaryView;
  };
  if (!start?.localDate) return null;
  return {
    family: "P6",
    title: String(item.title),
    pending: item.localState === "PENDING",
    start: {
      date: start.localDate,
      ...activityPlannedClock(start),
      ...(start.zoneId ? { zone: start.zoneId } : {}),
    },
    ...(end?.localDate
      ? {
          end: {
            date: end.localDate,
            ...activityPlannedClock(end),
            ...(end.zoneId ? { zone: end.zoneId } : {}),
          },
        }
      : {}),
    ...(item.place ? { venue: item.place as CorePlaceView } : {}),
    ...(item.details.entryPlace
      ? { entryPlace: item.details.entryPlace as CorePlaceView }
      : {}),
    ...(optional(item.details.sessionLabel)
      ? { session: optional(item.details.sessionLabel) }
      : {}),
    ...(optional(item.details.admissionNote)
      ? {
          admissionLine: optional(item.details.admissionNote),
          instructions: optional(item.details.admissionNote),
        }
      : {}),
    ...(optional(item.description) ? { note: optional(item.description) } : {}),
    ...(item.participation.mode === "WHOLE_GROUP"
      ? { participationMode: "WHOLE_GROUP" }
      : {}),
  };
}
