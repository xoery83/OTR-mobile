import { validateCalendarDate, type DayEvent } from "@/domain/trip/dayReadModel";
export type InsertionTimeSuggestion = {
  startDate: string;
  startTime: string | null;
  reason:
    | "MID_GAP"
    | "PREVIOUS_END"
    | "BEFORE_NEXT"
    | "OVERLAP"
    | "UNKNOWN"
    | "ZONE_MISMATCH"
    | "CROSS_DAY";
  previousItemId: string | null;
  nextItemId: string | null;
};
// Form defaults only. Never infers a duration, free capacity, timezone proof or instant.
export function p1InsertionTime(
  rows: readonly DayEvent[],
  referenceId: string,
  side: "BEFORE" | "AFTER",
  date: string,
): InsertionTimeSuggestion {
  const index = rows.findIndex((row) => row.id === referenceId),
    gap = index + (side === "AFTER" ? 1 : 0);
  const previous = index < 0 ? undefined : rows[gap - 1],
    next = index < 0 ? undefined : rows[gap];
  const result: InsertionTimeSuggestion = {
    startDate: date,
    startTime: null,
    reason: "UNKNOWN",
    previousItemId: previous?.id ?? null,
    nextItemId: next?.id ?? null,
  };
  try {
    validateCalendarDate(date);
  } catch {
    return result;
  }
  if (index < 0) return result;
  const endpoint = (event: DayEvent | undefined, roles: string[]) =>
    event?.boundaries.find((b) => roles.includes(b.role));
  const end = endpoint(previous, ["END", "DESTINATION"]),
    start = endpoint(next, ["START", "ORIGIN"]);
  if (
    [end, start].some(
      (boundary) =>
        boundary?.local_time && boundary.local_date && boundary.local_date !== date,
    )
  )
    return { ...result, reason: "CROSS_DAY" };
  const minutes = (boundary: typeof start) =>
    boundary?.local_date === date &&
    /^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(boundary.local_time ?? "")
      ? Number(boundary!.local_time!.slice(0, 2)) * 60 +
        Number(boundary!.local_time!.slice(3, 5))
      : null;
  const previousStart = endpoint(previous, ["START", "ORIGIN"]);
  const previousZone = end?.zone_id ?? previousStart?.zone_id;
  if (previousZone && start?.zone_id && previousZone !== start.zone_id)
    return { ...result, reason: "ZONE_MISMATCH" };
  const a = minutes(end),
    b = minutes(start);
  const time = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  if (a !== null && b !== null) {
    if ((end?.zone_id ?? null) !== (start?.zone_id ?? null))
      return { ...result, reason: "ZONE_MISMATCH" };
    if (a >= b) return { ...result, reason: "OVERLAP" };
    const middle = (a + b) / 2,
      rounded = Math.round(middle / 10) * 10;
    const suggestion = rounded >= a && rounded < b ? rounded : Math.floor(middle);
    return { ...result, startTime: time(suggestion), reason: "MID_GAP" };
  }
  if (a !== null) return { ...result, startTime: time(a), reason: "PREVIOUS_END" };
  if (b !== null) {
    const candidate = Math.max(0, b - 30);
    const previousMinute = minutes(previousStart);
    if (previousMinute !== null && candidate <= previousMinute)
      return { ...result, reason: "UNKNOWN" };
    if (
      previousMinute !== null &&
      (previousStart?.zone_id ?? null) !== (start?.zone_id ?? null)
    )
      return { ...result, reason: "ZONE_MISMATCH" };
    return { ...result, startTime: time(candidate), reason: "BEFORE_NEXT" };
  }
  return result;
}
