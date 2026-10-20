import {
  acceptedBoundaryAnchor,
  instantMicroseconds,
  localCalendarDate,
  dayViewContext,
  type DayViewContext,
  validateCalendarDate,
  type DayEvent,
  type DayProjection,
} from "@/domain/trip/dayReadModel";
import type { FlightService } from "@/domain/trip/flightAdmission";
import type { CoreFlightFacts } from "@/domain/trip/tripCoreV2DayFeed";
export type Depth = "B" | "F" | "I";
export type FlightPresentation = {
  qualification?: CoreFlightFacts["qualification"];
  canonical: DayEvent;
  services: FlightService[];
  supplemental: {
    endpoints: Record<
      "ORIGIN" | "DESTINATION",
      { code: string | null; name: string | null; terminal: string | null }
    >;
  };
};
export const endpoint = (f: FlightPresentation, role: "ORIGIN" | "DESTINATION") =>
  f.canonical.boundaries.find((b) => b.role === role);
export const flightNumber = (f: FlightPresentation) =>
  (f.services.find((s) => s.attribution === "MARKETING") ?? f.services[0])
    ?.service_literal ?? null;
export function durationMinutes(f: FlightPresentation) {
  const a = endpoint(f, "ORIGIN"),
    b = endpoint(f, "DESTINATION");
  if (!a || !b || a.quality !== "EXACT" || b.quality !== "EXACT") return null;
  const start = acceptedBoundaryAnchor(a),
    end = acceptedBoundaryAnchor(b);
  if (!start || !end) return null;
  const minutes =
    Number(instantMicroseconds(end) - instantMicroseconds(start)) / 60000000;
  return Number.isSafeInteger(minutes) && minutes >= 0 ? minutes : null;
}
export function flightPresentation(
  event: DayEvent,
  services: FlightService[],
  facts?: CoreFlightFacts,
): FlightPresentation | null {
  if (
    facts?.qualification === "SPARSE" ||
    event.temporal_shape !== "TRANSPORT" ||
    !(
      facts?.qualification === "QUALIFIED" ||
      event.event_type === "flight" ||
      services.length
    )
  )
    return null;
  const endpointFacts = (role: "ORIGIN" | "DESTINATION") => ({
    code: null,
    terminal: null,
    name: event.boundaries.find((b) => b.role === role)?.authored_label ?? null,
  });
  return {
    canonical: event,
    ...(facts ? { qualification: facts.qualification } : {}),
    services: facts?.services ?? services,
    supplemental: {
      endpoints: facts?.endpoints ?? {
        ORIGIN: endpointFacts("ORIGIN"),
        DESTINATION: endpointFacts("DESTINATION"),
      },
    },
  };
}
export function eventClock(event: DayEvent) {
  return (
    event.boundaries
      .find(
        (b) =>
          ["START", "ORIGIN"].includes(b.role) &&
          ["EXACT", "ESTIMATED"].includes(b.quality ?? "") &&
          b.clock_precision !== null &&
          b.clock_precision >= -1,
      )
      ?.local_time?.slice(0, 5) ?? null
  );
}
export const eventLocation = (e: DayEvent) =>
  e.accepted_address_line1 ??
  e.authored_address_line1 ??
  e.accepted_address ??
  e.authored_address ??
  e.authored_label;
export function boundaryZone(projection: Pick<DayProjection, "events">) {
  const accepted = projection.events
    .flatMap((e) => e.boundaries)
    .filter((b) => acceptedBoundaryAnchor(b));
  if (!accepted.length || accepted.some((b) => !b.zone_id)) return null;
  const zones = new Set(accepted.map((b) => b.zone_id!));
  if (zones.size !== 1) return null;
  const zone = [...zones][0];
  try {
    localCalendarDate(new Date().toISOString(), zone);
    return zone;
  } catch {
    return null;
  }
}
export function viewContext(date: string, context: string | DayViewContext) {
  validateCalendarDate(date);
  return { date, ...dayViewContext(context) };
}
// Explicit presentation choices only: an authored named zone is not a Trip-time authority.
export function explicitBoundaryZones(projection: Pick<DayProjection, "events">) {
  const zones = new Set<string>();
  for (const event of projection.events) {
    for (const boundary of event.boundaries) {
      if (!boundary.zone_id) continue;
      try {
        viewContext("2000-01-01", boundary.zone_id);
        zones.add(boundary.zone_id);
      } catch {
        // Unknown/invalid zones do not become a selectable presentation context.
      }
    }
  }
  return [...zones].sort();
}
