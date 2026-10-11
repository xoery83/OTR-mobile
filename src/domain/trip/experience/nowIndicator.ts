import {
  acceptedBoundaryAnchor,
  civilBoundaryMicroseconds,
  instantMicroseconds,
  localCalendarDate,
  type DayBoundary,
  type DayItem,
  type DayQuery,
} from "../dayReadModel";

export type NowPlacement =
  | {
      mode: "HIDDEN";
      reason:
        "CONTEXT" | "OTHER_DAY" | "NO_TIMED_EVENTS" | "TIMING" | "ORDER" | "OVERLAP";
    }
  | { mode: "BETWEEN_EVENTS"; beforeIndex: number; instant: string; zone: string }
  | { mode: "WITHIN_EVENT_WINDOW"; eventId: string; instant: string; zone: string };

function exact(boundary: DayBoundary | undefined) {
  if (!boundary || boundary.quality !== "EXACT") return null;
  const precision =
    boundary.basis === "SOURCE_INSTANT"
      ? boundary.source_instant_precision
      : boundary.clock_precision;
  if (
    precision === null ||
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > 6
  )
    return null;
  if (
    boundary.basis === "DERIVED_CIVIL" &&
    !["UNIQUE", "FOLD_RESOLVED"].includes(boundary.civil_resolution ?? "")
  )
    return null;
  if (boundary.basis === "SOURCE_INSTANT" && !boundary.source_instant) return null;
  if (!boundary.basis) return null;
  const anchor = acceptedBoundaryAnchor(boundary);
  if (anchor && boundary.basis === "DERIVED_CIVIL") {
    const civil = civilBoundaryMicroseconds(boundary);
    if (civil === null || civil !== instantMicroseconds(anchor)) return null;
  }
  return anchor;
}

// Caller supplies whole rendered rows; NOW never sorts, chooses Focus or controls scrolling.
export function placeNow(
  query: DayQuery,
  rows: readonly DayItem[],
  now: string,
): NowPlacement {
  const hide = (
    reason: Extract<NowPlacement, { mode: "HIDDEN" }>["reason"],
  ): NowPlacement => ({ mode: "HIDDEN", reason });
  try {
    const current = instantMicroseconds(now);
    if (localCalendarDate(now, query.zone) !== query.date) return hide("OTHER_DAY");
    if (new Set(rows.map((r) => r.event.id)).size !== rows.length) return hide("ORDER");
    const members = [...query.timed, ...query.nonComparable];
    if (members.length !== rows.length || rows.some((r) => !members.includes(r)))
      return hide("ORDER");
    const timed: { id: string; index: number; start: bigint; end: bigint | null }[] = [];
    for (const [index, row] of rows.entries()) {
      const event = row.event;
      if (["CALENDAR", "ALL_DAY", "WINDOW"].includes(event.temporal_shape)) continue;
      const transport = event.temporal_shape === "TRANSPORT";
      const startRole = transport ? "ORIGIN" : "START";
      const endRole = transport ? "DESTINATION" : "END";
      if (
        event.boundaries.filter((b) => b.role === startRole).length !== 1 ||
        event.boundaries.filter((b) => b.role === endRole).length > 1
      )
        return hide("TIMING");
      const startBoundary = event.boundaries.find((b) => b.role === startRole);
      const endBoundary = event.boundaries.find((b) => b.role === endRole);
      const start = exact(startBoundary);
      if (!start || event.is_estimated_time) return hide("TIMING");
      const end = endBoundary ? exact(endBoundary) : null;
      if (
        endBoundary &&
        !end &&
        (endBoundary.instant || endBoundary.source_instant || endBoundary.local_time)
      )
        return hide("TIMING");
      const a = instantMicroseconds(start),
        b = end ? instantMicroseconds(end) : null;
      if (b !== null && b <= a) return hide("TIMING");
      if (timed.length && a < timed[timed.length - 1].start) return hide("ORDER");
      timed.push({ id: event.id, index, start: a, end: b });
    }
    if (!timed.length) return hide("NO_TIMED_EVENTS");
    const containing = timed.filter(
      (e) => e.end !== null && e.start <= current && current < e.end,
    );
    if (containing.length > 1) {
      // Keep the boundary of the connected overlap group stable as its clock advances.
      let first = containing[0];
      for (const prior of timed.slice(0, timed.indexOf(first)).reverse())
        if (prior.end !== null && prior.end > first.start) first = prior;
      return {
        mode: "BETWEEN_EVENTS",
        beforeIndex: first.index,
        instant: now,
        zone: query.zone,
      };
    }
    if (containing.length === 1)
      return {
        mode: "WITHIN_EVENT_WINDOW",
        eventId: containing[0].id,
        instant: now,
        zone: query.zone,
      };
    const next = timed.find((e) => e.start > current);
    return {
      mode: "BETWEEN_EVENTS",
      beforeIndex: next?.index ?? timed[timed.length - 1].index + 1,
      instant: now,
      zone: query.zone,
    };
  } catch {
    return hide("CONTEXT");
  }
}
