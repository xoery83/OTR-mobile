import { expect, it } from "vitest";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import {
  boundaryZone,
  explicitBoundaryZones,
  viewContext,
  flightPresentation,
  eventClock,
  eventLocation,
} from "./presentation";
import { placeNow } from "@/domain/trip/experience/nowIndicator";
import { event, projection } from "./faroeNegative.test.fixtures";

it("explicit zone choices retain unresolved authored zones without inferring a default or comparable clock", () => {
  const e = event("a", "SPAN", "2026-10-10T00:00:00Z", "2026-10-10T01:00:00Z");
  e.boundaries[0].zone_id = "Asia/Tokyo";
  e.boundaries[0].instant = null;
  e.boundaries[1].zone_id = "Europe/Paris";
  const before = JSON.stringify(e);
  expect(explicitBoundaryZones(projection(e))).toEqual(["Asia/Tokyo", "Europe/Paris"]);
  expect(JSON.stringify(e)).toBe(before);
  e.boundaries[0].zone_id = "+09:00";
  e.boundaries[1].zone_id = "Mars/Olympus";
  expect(explicitBoundaryZones(projection(e))).toEqual([]);
});

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

it("retains authored minute plans and named places without qualifying an instant", () => {
  const e = event("plan", "POINT", null, null);
  e.boundaries[0] = {
    ...e.boundaries[0],
    role: "START",
    local_time: "09:15:00",
    clock_precision: -1,
    quality: "ESTIMATED",
    civil_resolution: "PENDING",
    instant: null,
  };
  e.authored_label = "Kiyomizu temple";
  expect(eventClock(e)).toBe("09:15");
  expect(eventLocation(e)).toBe("Kiyomizu temple");
  expect(itemsForLocalDate(projection(e), "2026-10-10", "UTC").timed).toHaveLength(0);
  e.boundaries[0].quality = "UNKNOWN";
  expect(eventClock(e)).toBeNull();
  e.authored_address_line1 = "Authorized street";
  expect(eventLocation(e)).toBe("Authorized street");
});
