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
  if (
    previousStart?.local_time &&
    previousStart.local_date &&
    previousStart.local_date !== date
  )
    return { ...result, reason: "CROSS_DAY" };
  const a = minutes(end),
    b = minutes(start),
    previousMinute = minutes(previousStart);
  const time = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const suggest = (value: number, reason: InsertionTimeSuggestion["reason"]) =>
    value >= 0 && value < 1440
      ? { ...result, startTime: time(value), reason }
      : { ...result, reason: "CROSS_DAY" as const };
  const midpoint = (lower: number, upper: number): InsertionTimeSuggestion => {
    if (lower >= upper) return { ...result, reason: "OVERLAP" };
    const middle = (lower + upper) / 2;
    const rounded = Math.round(middle / 5) * 5;
    return suggest(
      rounded > lower && rounded < upper ? rounded : Math.floor(middle),
      "MID_GAP",
    );
  };
  if (
    (a !== null || previousMinute !== null) &&
    b !== null &&
    (previousZone ?? null) !== (start?.zone_id ?? null)
  )
    return { ...result, reason: "ZONE_MISMATCH" };
  if (a !== null && b !== null && a >= b) return { ...result, reason: "OVERLAP" };
  if (side === "BEFORE") {
    if (b === null) return result;
    const lower = a ?? previousMinute;
    if (
      lower !== null &&
      ((previousMinute !== null && b - previousMinute <= 70) || b - lower <= 70)
    )
      return midpoint(lower, b);
    return suggest(b - 60, "BEFORE_NEXT");
  }
  // A missing end gets an advisory 30-minute allowance, never a persisted duration.
  const effectiveEnd = a ?? (previousMinute === null ? null : previousMinute + 30);
  if (effectiveEnd === null) return result;
  if (b !== null && b - effectiveEnd <= 70) {
    // An estimated end cannot turn two point events into a proven overlap.
    return midpoint(a === null && effectiveEnd >= b ? previousMinute! : effectiveEnd, b);
  }
  return suggest(effectiveEnd + 20, "PREVIOUS_END");
}
