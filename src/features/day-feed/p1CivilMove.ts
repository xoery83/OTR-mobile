import type { LocalManualRead } from "@/data/repositories/tripLocalManualReadRepository";
import type { CoreBoundaryView } from "@/domain/trip/tripCoreV2Day";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import type { MoveItem, MoveProposal } from "./p1MoveTypes";
type Item = LocalManualRead["items"][number];
export function p1CivilMoveItem(item: Item | undefined) {
  if (!item) return undefined;
  const schedule = item.schedule as { start?: CoreBoundaryView; end?: CoreBoundaryView };
  const start = schedule.start,
    end = schedule.end;
  // The normal editor can change unresolved civil clocks. It cannot preserve qualified instants.
  if (
    item.family !== "P1" ||
    item.hidden ||
    ["cancelled", "skipped"].includes(String(item.status)) ||
    !start?.localDate ||
    [start, end].some((b) => b?.zoneId || b?.instant || b?.comparable) ||
    (!start.localTime && end?.localTime)
  )
    return undefined;
  return {
    id: item.itemId,
    title: String(item.title),
    availability: "AVAILABLE",
    date: start.localDate,
    time: start.localTime?.slice(0, 5) ?? null,
    endDate: end?.localDate ?? null,
    endTime: end?.localTime?.slice(0, 5) ?? null,
    zone: null,
    instant: null,
    endInstant: null,
  };
}
// UTC arithmetic is only a calendar calculator here; no computed value becomes a business instant.
const civilMinute = (date: string, time: string) =>
  Date.parse(`${date}T${time}:00Z`) / 60000;
export function p1CivilDuration(item: MoveItem) {
  if (!item.time || !item.endDate || !item.endTime) return null;
  const duration =
    civilMinute(item.endDate, item.endTime) - civilMinute(item.date, item.time);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}
export function p1CivilProposal(
  item: MoveItem,
  date: string,
  minute: number,
): MoveProposal {
  try {
    validateCalendarDate(date);
  } catch {
    return { status: "UNAVAILABLE" };
  }
  if (
    item.availability !== "AVAILABLE" ||
    item.zone ||
    item.instant ||
    item.endInstant ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute >= 1440
  )
    return { status: "UNAVAILABLE" };
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const duration = p1CivilDuration(item);
  const end =
    duration === null
      ? null
      : new Date((civilMinute(date, time) + duration) * 60000).toISOString();
  const endDate =
    end?.slice(0, 10) ??
    (item.endDate
      ? new Date(
          Date.parse(item.endDate + "T12:00:00Z") +
            Date.parse(date + "T12:00:00Z") -
            Date.parse(item.date + "T12:00:00Z"),
        )
          .toISOString()
          .slice(0, 10)
      : null);
  return {
    status: "READY",
    date,
    time,
    endDate,
    endTime: end?.slice(11, 16) ?? null,
    instant: null,
    endInstant: null,
    zone: null,
    precision: "MINUTE",
    durationMinutes: duration,
  };
}
