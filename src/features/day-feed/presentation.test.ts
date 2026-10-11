import { expect, it } from "vitest";
import {
  type DayBoundary,
  type DayEvent,
  type DayProjection,
  itemsForLocalDate,
} from "@/domain/trip/dayReadModel";
import { boundaryZone, viewContext, flightPresentation } from "./presentation";
import { placeNow } from "@/domain/trip/experience/nowIndicator";
const blankBoundary = {
  instant: null,
  local_date: null,
  local_time: null,
  clock_precision: null,
  quality: null,
  basis: null,
  zone_id: null,
  supplied_offset_seconds: null,
  source_instant: null,
  source_instant_precision: null,
  civil_resolution: null,
  resolution_offset_seconds: null,
  interpretation_key: null,
  interpretation_input_sha256: null,
  provenance_refs: null,
  authored_label: null,
  authored_text: null,
  authored_address: null,
  accepted_address: null,
  accepted_latitude: null,
  accepted_longitude: null,
  accepted_place_id: null,
  spatial_provenance_refs: null,
  location_input_revision: null,
  authored_address_line1: null,
  authored_address_line2: null,
  authored_address_locality: null,
  authored_address_region: null,
  authored_address_postal_code: null,
  authored_address_country: null,
  accepted_address_line1: null,
  accepted_address_line2: null,
  accepted_address_locality: null,
  accepted_address_region: null,
  accepted_address_postal_code: null,
  accepted_address_country: null,
};
function boundary(
  role: DayBoundary["role"],
  instant: string | null = null,
  fields: Partial<DayBoundary> = {},
): DayBoundary {
  return {
    ...blankBoundary,
    role,
    instant,
    quality: instant ? "EXACT" : "UNKNOWN",
    basis: instant ? "SOURCE_INSTANT" : "DERIVED_CIVIL",
    source_instant: instant,
    ...fields,
  };
}
function event(
  id = "a",
  shape: DayEvent["temporal_shape"] = "POINT",
  start: string | null = null,
  end: string | null = null,
): DayEvent {
  return {
    ...blankBoundary,
    id,
    semantic_revision: 1,
    title: id,
    event_type: "activity",
    status: "planned",
    order_index: null,
    trip_day_id: null,
    temporal_shape: shape,
    participant_scope: "UNASSIGNED",
    timing_label: null,
    timing_provenance_ref: null,
    is_estimated_time: false,
    boundaries:
      shape === "TRANSPORT"
        ? [boundary("ORIGIN", start), boundary("DESTINATION", end)]
        : [boundary("START", start), boundary("END", end)],
  };
}
function projection(...events: DayEvent[]): DayProjection {
  return {
    accountId: "a",
    tripId: "t",
    version: 1,
    generation: 1,
    source: { epochId: "e", revision: "1", fingerprint: "hash", appliedGeneration: 1 },
    events,
  };
}

it("requires explicit date and named zone, including leap and invalid contexts", () => {
  expect(viewContext("2024-02-29", "Pacific/Auckland").zone).toBe("Pacific/Auckland");
  for (const [date, zone] of [
    ["2023-02-29", "UTC"],
    ["2026-10-10", ""],
    ["2026-10-10", "+12:00"],
    ["2026-10-10", "Mars/Olympus"],
  ])
    expect(() => viewContext(date, zone)).toThrow();
});
it("prefills only an unambiguous accepted zone and never invents a Trip zone", () => {
  const e = event("a", "SPAN", "2026-10-10T00:00:00Z", "2026-10-10T01:00:00Z");
  expect(boundaryZone(projection(e))).toBeNull();
  e.boundaries.forEach((b) => {
    b.zone_id = "Pacific/Auckland";
  });
  expect(boundaryZone(projection(e))).toBe("Pacific/Auckland");
  e.boundaries[1].zone_id = "America/Los_Angeles";
  expect(boundaryZone(projection(e))).toBeNull();
});
it("does not infer Flight from adjacency, labels or transport shape", () => {
  const e = event("a", "TRANSPORT", "2026-10-10T00:00:00Z", "2026-10-10T01:00:00Z");
  expect(flightPresentation(e, [])).toBeNull();
  e.event_type = "flight";
  const flight = flightPresentation(e, [])!;
  expect(flight.services).toEqual([]);
  expect(flight.supplemental.endpoints.ORIGIN.code).toBeNull();
  expect(flight.supplemental.endpoints.ORIGIN.terminal).toBeNull();
});
it("keeps NOW independent from manual Focus and reports within/between without reordering", () => {
  const p = projection(
    event("a", "SPAN", "2026-10-10T00:00:00Z", "2026-10-10T01:00:00Z"),
  );
  p.events[0].boundaries.forEach((b) => {
    b.source_instant_precision = 0;
  });
  const query = itemsForLocalDate(p, "2026-10-10", "UTC"),
    rows = [...query.timed, ...query.nonComparable];
  const focus = null,
    bytes = JSON.stringify(rows);
  expect(placeNow(query, rows, "2026-10-10T00:30:00Z").mode).toBe("WITHIN_EVENT_WINDOW");
  expect(placeNow(query, rows, "2026-10-10T01:00:00Z").mode).toBe("BETWEEN_EVENTS");
  expect(focus).toBeNull();
  expect(JSON.stringify(rows)).toBe(bytes);
});
