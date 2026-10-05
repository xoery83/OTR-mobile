// Projection facts are a domain contract. Repository validation maps the canonical DTO.
type DaySpatialFacts = {
  authored_label: string | null;
  authored_text: string | null;
  authored_address: string | null;
  accepted_address: string | null;
  accepted_latitude: number | null;
  accepted_longitude: number | null;
  accepted_place_id: string | null;
  spatial_provenance_refs: Record<string, string> | null;
  location_input_revision: number | null;
  authored_address_line1: string | null;
  authored_address_line2: string | null;
  authored_address_locality: string | null;
  authored_address_region: string | null;
  authored_address_postal_code: string | null;
  authored_address_country: string | null;
  accepted_address_line1: string | null;
  accepted_address_line2: string | null;
  accepted_address_locality: string | null;
  accepted_address_region: string | null;
  accepted_address_postal_code: string | null;
  accepted_address_country: string | null;
};
export type DayBoundary = DaySpatialFacts & {
  role: "START" | "END" | "ORIGIN" | "DESTINATION";
  instant: string | null;
  local_date: string | null;
  local_time: string | null;
  clock_precision: number | null;
  quality: "UNKNOWN" | "EXACT" | "ESTIMATED" | null;
  basis: "DERIVED_CIVIL" | "SOURCE_INSTANT" | null;
  zone_id: string | null;
  supplied_offset_seconds: number | null;
  source_instant: string | null;
  source_instant_precision: number | null;
  civil_resolution: "PENDING" | "UNIQUE" | "GAP" | "FOLD" | "FOLD_RESOLVED" | null;
  resolution_offset_seconds: number | null;
  interpretation_key: string | null;
  interpretation_input_sha256: string | null;
  provenance_refs: Record<string, string> | null;
};
export type DayEvent = DaySpatialFacts & {
  id: string;
  semantic_revision: number;
  title: string;
  event_type:
    | "flight"
    | "hotel"
    | "car"
    | "activity"
    | "shopping"
    | "meal"
    | "transport"
    | "note"
    | "other";
  status: "planned" | "skipped" | "completed" | "cancelled";
  order_index: number | null;
  trip_day_id: string | null;
  temporal_shape:
    "POINT" | "CALENDAR" | "ALL_DAY" | "SPAN" | "STAY" | "TRANSPORT" | "WINDOW";
  participant_scope: "UNASSIGNED" | "ASSIGNED" | "WHOLE_GROUP";
  timing_label: string | null;
  timing_provenance_ref: string | null;
  is_estimated_time: boolean;
  boundaries: DayBoundary[];
};
export type DayProjection = {
  accountId: string;
  tripId: string;
  version: 1;
  generation: number;
  source: {
    epochId: string;
    revision: string;
    fingerprint: string;
    appliedGeneration: number;
  };
  events: DayEvent[];
};
export type DayItem = {
  event: DayEvent;
  roles: DayBoundary["role"][];
  occupancy: boolean;
  occupancyBasis: "INSTANT_INTERVAL" | "NAMED_DAY" | "CALENDAR_NIGHTS" | null;
  anchor: string | null;
};
export type DayQuery = {
  date: string;
  zone: string;
  timed: DayItem[];
  nonComparable: DayItem[];
  unresolved: DayEvent[];
};

export function validateCalendarDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("DAY_DATE_INVALID");
  const d = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date)
    throw new Error("DAY_DATE_INVALID");
  return date;
}
export function nextCalendarDate(date: string): string {
  validateCalendarDate(date);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return validateCalendarDate(d.toISOString().slice(0, 10));
}
function calendar(zone: string) {
  // Require an explicit named context, including UTC; never use the device default.
  if (!zone || /^[+-]/.test(zone)) throw new Error("DAY_ZONE_INVALID");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
export function instantMicroseconds(instant: string): bigint {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      instant,
    );
  if (!match) throw new Error("DAY_INSTANT_INVALID");
  const [, date, h, m, s, fraction = "", offset] = match;
  validateCalendarDate(date);
  if (+h > 23 || +m > 59 || +s > 59) throw new Error("DAY_INSTANT_INVALID");
  let seconds = 0;
  if (offset !== "Z") {
    const hour = +offset.slice(1, 3),
      minute = +offset.slice(4, 6);
    if (hour > 18 || minute > 59 || (hour === 18 && minute !== 0))
      throw new Error("DAY_INSTANT_INVALID");
    seconds = (hour * 3600 + minute * 60) * (offset[0] === "+" ? 1 : -1);
  }
  return (
    BigInt(new Date(`${date}T${h}:${m}:${s}Z`).getTime()) * 1000n -
    BigInt(seconds) * 1000000n +
    BigInt(fraction.padEnd(6, "0"))
  );
}
function milliseconds(us: bigint) {
  // Floor negative instants too; sub-millisecond precision never rounds to the next day.
  return Number(us >= 0n ? us / 1000n : (us - 999n) / 1000n);
}
function formattedDate(format: Intl.DateTimeFormat, ms: number) {
  const parts = format.formatToParts(new Date(ms));
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
export function localCalendarDate(now: string, zone: string) {
  return formattedDate(calendar(zone), milliseconds(instantMicroseconds(now)));
}
function dayInterval(date: string, zone: string): [bigint, bigint] {
  const format = calendar(zone);
  const first = (label: string) => {
    const center = new Date(`${label}T00:00:00Z`).getTime();
    let lo = center - 3 * 86400000,
      hi = center + 3 * 86400000;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (formattedDate(format, mid) < label) lo = mid + 1;
      else hi = mid;
    }
    return BigInt(lo) * 1000n;
  };
  return [first(date), first(nextCalendarDate(date))];
}
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function authored(a: DayEvent, b: DayEvent) {
  if (a.order_index !== b.order_index) {
    if (a.order_index === null) return 1;
    if (b.order_index === null) return -1;
    return a.order_index < b.order_index ? -1 : 1;
  }
  return compareText(a.id, b.id);
}
export function civilBoundaryMicroseconds(boundary: DayBoundary): bigint | null {
  if (
    !boundary.local_date ||
    !boundary.local_time ||
    !boundary.zone_id ||
    boundary.resolution_offset_seconds === null ||
    !["UNIQUE", "FOLD_RESOLVED"].includes(boundary.civil_resolution ?? "")
  )
    return null;
  return (
    instantMicroseconds(`${boundary.local_date}T${boundary.local_time}Z`) -
    BigInt(boundary.resolution_offset_seconds) * 1000000n
  );
}
function anchor(boundary: DayBoundary): string | null {
  // Conflicting retained civil/source evidence does not claim a combined schedule.
  if (
    boundary.source_instant &&
    boundary.instant &&
    instantMicroseconds(boundary.source_instant) !== instantMicroseconds(boundary.instant)
  )
    return null;
  const civil = civilBoundaryMicroseconds(boundary);
  if (
    civil !== null &&
    boundary.source_instant &&
    civil !== instantMicroseconds(boundary.source_instant)
  )
    return null;
  return boundary.quality !== "UNKNOWN" && boundary.quality !== null
    ? boundary.instant
    : null;
}

function interval(event: DayEvent): [DayBoundary | undefined, DayBoundary | undefined] {
  return event.temporal_shape === "TRANSPORT"
    ? [
        event.boundaries.find((b) => b.role === "ORIGIN"),
        event.boundaries.find((b) => b.role === "DESTINATION"),
      ]
    : [
        event.boundaries.find((b) => b.role === "START"),
        event.boundaries.find((b) => b.role === "END"),
      ];
}
function hasUncertainty(event: DayEvent) {
  return (
    event.temporal_shape === "WINDOW" ||
    event.boundaries.some(
      (b) =>
        anchor(b) === null &&
        (b.role !== "END" || ["SPAN", "STAY"].includes(event.temporal_shape)),
    )
  );
}
export function unresolvedCandidates(projection: DayProjection): DayEvent[] {
  return projection.events.filter(hasUncertainty).sort(authored);
}
export function itemsForLocalDate(
  projection: DayProjection,
  date: string,
  zone: string,
): DayQuery {
  validateCalendarDate(date);
  const [dayStart, dayEnd] = dayInterval(date, zone);
  const namedDays = new Map<string, [bigint, bigint]>();
  const timed: DayItem[] = [],
    nonComparable: DayItem[] = [];
  for (const event of projection.events) {
    const roles: DayBoundary["role"][] = [];
    const anchors: string[] = [];
    for (const b of event.boundaries) {
      const time = anchor(b);
      if (time !== null) {
        const us = instantMicroseconds(time);
        if (us >= dayStart && us < dayEnd) {
          roles.push(b.role);
          anchors.push(time);
        }
      } else if (
        b.local_date === date &&
        !(event.temporal_shape === "ALL_DAY" && b.zone_id)
      )
        roles.push(b.role);
    }
    const [start, end] = interval(event);
    const a = start && anchor(start),
      b = end && anchor(end);
    let occupancy = false;
    let occupancyBasis: DayItem["occupancyBasis"] = null;
    if (event.temporal_shape === "ALL_DAY" && start?.local_date && start.zone_id) {
      const key = `${start.local_date}/${start.zone_id}`;
      let named = namedDays.get(key);
      if (!named) {
        named = dayInterval(start.local_date, start.zone_id);
        namedDays.set(key, named);
      }
      const [namedStart, namedEnd] = named;
      occupancy =
        namedStart < namedEnd &&
        dayStart < dayEnd &&
        namedStart < dayEnd &&
        namedEnd > dayStart;
      if (occupancy) occupancyBasis = "NAMED_DAY";
    }
    if (["SPAN", "STAY", "TRANSPORT"].includes(event.temporal_shape)) {
      if (a && b && start?.quality === "EXACT" && end?.quality === "EXACT")
        occupancy =
          instantMicroseconds(a) < instantMicroseconds(b) &&
          instantMicroseconds(a) < dayEnd &&
          instantMicroseconds(b) > dayStart &&
          dayStart < dayEnd;
      else if (
        (!a || !b) &&
        event.temporal_shape === "STAY" &&
        start?.local_date &&
        end?.local_date
      ) {
        occupancy = start.local_date <= date && date < end.local_date;
        if (occupancy) occupancyBasis = "CALENDAR_NIGHTS";
      }
      if (occupancy && occupancyBasis === null) occupancyBasis = "INSTANT_INTERVAL";
    }
    if (!roles.length && !occupancy) continue;
    // Occupancy-only items carry the real start anchor, never query midnight.
    if (!anchors.length && occupancyBasis === "INSTANT_INTERVAL" && a) anchors.push(a);
    anchors.sort((x, y) =>
      instantMicroseconds(x) < instantMicroseconds(y)
        ? -1
        : instantMicroseconds(x) > instantMicroseconds(y)
          ? 1
          : compareText(x, y),
    );
    const item = {
      event,
      roles: roles.sort(),
      occupancy,
      occupancyBasis,
      anchor: anchors[0] ?? null,
    };
    (item.anchor === null ? nonComparable : timed).push(item);
  }
  timed.sort((a, b) => {
    const x = instantMicroseconds(a.anchor!),
      y = instantMicroseconds(b.anchor!);
    return x < y ? -1 : x > y ? 1 : authored(a.event, b.event);
  });
  nonComparable.sort((a, b) => authored(a.event, b.event));
  return {
    date,
    zone,
    timed,
    nonComparable,
    unresolved: unresolvedCandidates(projection),
  };
}
export function today(projection: DayProjection, now: string, zone: string) {
  return itemsForLocalDate(projection, localCalendarDate(now, zone), zone);
}
export function tomorrow(projection: DayProjection, now: string, zone: string) {
  return itemsForLocalDate(
    projection,
    nextCalendarDate(localCalendarDate(now, zone)),
    zone,
  );
}
export function nextComparableEvent(
  projection: DayProjection,
  now: string,
  zone: string,
) {
  calendar(zone);
  const current = instantMicroseconds(now);
  const candidates = projection.events.flatMap((event) =>
    event.boundaries.flatMap((b) => {
      const time = anchor(b);
      return time !== null && instantMicroseconds(time) > current
        ? [{ event, role: b.role, anchor: time }]
        : [];
    }),
  );
  candidates.sort((a, b) => {
    const x = instantMicroseconds(a.anchor),
      y = instantMicroseconds(b.anchor);
    return x < y
      ? -1
      : x > y
        ? 1
        : authored(a.event, b.event) || compareText(a.role, b.role);
  });
  return { next: candidates[0] ?? null, unresolved: unresolvedCandidates(projection) };
}
