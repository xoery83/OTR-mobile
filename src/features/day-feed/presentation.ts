import {
  acceptedBoundaryAnchor,
  instantMicroseconds,
  localCalendarDate,
  validateCalendarDate,
  type DayEvent,
  type DayProjection,
} from "@/domain/trip/dayReadModel";
import type { FlightService } from "@/domain/trip/flightAdmission";
export type Depth = "B" | "F" | "I";
export type FlightPresentation = {
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
): FlightPresentation | null {
  if (
    event.temporal_shape !== "TRANSPORT" ||
    !(event.event_type === "flight" || services.length)
  )
    return null;
  const facts = (role: "ORIGIN" | "DESTINATION") => ({
    code: null,
    terminal: null,
    name: event.boundaries.find((b) => b.role === role)?.authored_label ?? null,
  });
  return {
    canonical: event,
    services,
    supplemental: {
      endpoints: { ORIGIN: facts("ORIGIN"), DESTINATION: facts("DESTINATION") },
    },
  };
}
export function eventClock(event: DayEvent) {
  return (
    event.boundaries
      .find(
        (b) =>
          ["START", "ORIGIN"].includes(b.role) &&
          b.quality === "EXACT" &&
          b.clock_precision !== null &&
          b.clock_precision >= 0,
      )
      ?.local_time?.slice(0, 5) ?? null
  );
}
export const eventLocation = (e: DayEvent) =>
  e.accepted_address_line1 ??
  e.authored_address_line1 ??
  e.accepted_address ??
  e.authored_address;
export function boundaryZone(projection: DayProjection) {
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
export function viewContext(date: string, zone: string) {
  validateCalendarDate(date);
  // An explicit named query zone is mandatory; an offset or empty value is not a view context.
  if (!zone.trim() || zone !== zone.trim() || /^[+-]/.test(zone))
    throw new Error("DAY_ZONE_INVALID");
  localCalendarDate("2000-01-01T00:00:00Z", zone);
  return { date, zone };
}
