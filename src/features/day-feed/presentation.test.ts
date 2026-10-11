import { expect, it } from "vitest";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { boundaryZone, viewContext, flightPresentation } from "./presentation";
import { placeNow } from "@/domain/trip/experience/nowIndicator";
import { event, projection } from "./faroeNegative.test.fixtures";

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
