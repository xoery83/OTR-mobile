import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { createCoreFlightRenderer } from "./coreFlightRenderer";
const seen = vi.hoisted(() => ({ rows: [] as any[], grids: [] as any[], open: vi.fn() }));
vi.mock("./FlightJourneyView", () => ({
  FlightLegRow: (p: any) => {
    seen.rows.push(p);
    return createElement("div");
  },
}));
vi.mock("./FlightFidelityGrid", () => ({
  FlightFidelityGrid: (p: any) => {
    seen.grids.push(p);
    return createElement("div");
  },
}));
vi.mock("./flightAirportActions", () => ({
  flightAirportContext: () => "FUTURE",
  flightAirportTargets: (f: any) =>
    f.supplemental.endpoints.ORIGIN.name
      ? { map: "actual-map", navigate: "actual-directions" }
      : null,
  openFlightAirport: seen.open,
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
function fixture() {
  return {
    version: 2,
    accountId: "actor",
    tripId: "trip",
    source: { authority: "SERVER_ACCEPTED" },
    items: [
      {
        itemId: "flight",
        tripId: "trip",
        itemRevision: 2,
        family: "P2",
        hidden: false,
        status: "planned",
        localState: "ACCEPTED",
      },
    ],
    events: [
      {
        id: "flight",
        semantic_revision: 2,
        title: "NZ123",
        temporal_shape: "TRANSPORT",
        boundaries: [
          {
            role: "ORIGIN",
            local_date: "2026-10-29",
            local_time: "12:00:00",
            zone_id: "Pacific/Auckland",
          },
          {
            role: "DESTINATION",
            local_date: "2026-10-29",
            local_time: "13:00:00",
            zone_id: "Pacific/Auckland",
          },
        ],
      },
    ],
    flightFacts: {
      flight: {
        qualification: "SPARSE",
        flightNumberLiteral: "NZ123",
        services: [],
        endpoints: {
          ORIGIN: { code: "AKL", name: "Auckland Airport", terminal: "D" },
          DESTINATION: { code: "NSN", name: "Nelson Airport", terminal: null },
        },
      },
    },
  } as any;
}
function props(depth: "B" | "F" | "I" = "F") {
  return {
    row: {
      item: { event: { id: "flight" } },
      coreRowKeys: [
        { itemId: "flight", projectionRole: "ORIGIN", localDate: "2026-10-29" },
        { itemId: "flight", projectionRole: "DESTINATION", localDate: "2026-10-29" },
      ],
    },
    depth,
    onDepth: vi.fn(),
    context: "TODAY",
    container: undefined,
    nextFocused: true,
    withinMarker: createElement("i"),
  } as any;
}
function render(p = fixture(), options = {}, depth: "B" | "F" | "I" = "F") {
  const v = props(depth);
  const node = createCoreFlightRenderer(p, options)(v);
  if (node) renderToStaticMarkup(node);
  return v;
}
beforeEach(() => {
  seen.rows = [];
  seen.grids = [];
  seen.open.mockClear();
});
it("accepted authored Sparse uses existing FlightLegRow with real fields, Details revision and airport actions", () => {
  const onOpenFlight = vi.fn();
  render(fixture(), { onOpenFlight });
  expect(seen.rows).toHaveLength(1);
  const row = seen.rows[0];
  expect(row.focused).toBe(true);
  expect(row.pending).toBe(false);
  expect(row.hideDivider).toBe(true);
  expect(row.leg.flight).toMatchObject({
    qualification: "SPARSE",
    services: [],
    numberLiteral: "NZ123",
    supplemental: {
      endpoints: { ORIGIN: { code: "AKL", name: "Auckland Airport", terminal: "D" } },
    },
  });
  row.onOpen();
  expect(onOpenFlight).toHaveBeenCalledWith("flight", 2);
  row.leg.map();
  row.leg.navigate();
  expect(seen.open.mock.calls).toEqual([["actual-map"], ["actual-directions"]]);
  expect(row.onLongPress).toBeUndefined();
  expect(row.move).toBeUndefined();
});
it("Browse/Focus preserves native focus toggle and immersive fallback when action absent", () => {
  let p = render(fixture(), {}, "B");
  seen.rows[0].onFocus();
  expect(p.onDepth).toHaveBeenCalledWith("F");
  seen.rows = [];
  p = render();
  seen.rows[0].onFocus();
  expect(p.onDepth).toHaveBeenCalledWith("B");
  seen.rows[0].onOpen();
  expect(p.onDepth).toHaveBeenCalledWith("I");
  render(fixture(), {}, "I");
  expect(seen.grids[0]).toMatchObject({ immersive: true });
});
it.each([
  "revision",
  "trip",
  "hidden",
  "cancelled",
  "family",
  "missingEvent",
  "missingFacts",
])("fails closed on %s projection mismatch", (key) => {
  const p = fixture();
  if (key === "revision") p.events[0].semantic_revision = 3;
  if (key === "trip") p.items[0].tripId = "other";
  if (key === "hidden") p.items[0].hidden = true;
  if (key === "cancelled") p.items[0].status = "cancelled";
  if (key === "family") p.items[0].family = "P1";
  if (key === "missingEvent") p.events = [];
  if (key === "missingFacts") p.flightFacts = {};
  render(p);
  expect(seen.rows).toHaveLength(0);
});
it("leaves Qualified Source services to the existing unchanged fallback", () => {
  const p = fixture();
  p.flightFacts.flight.qualification = "QUALIFIED";
  p.flightFacts.flight.services = [
    { service_literal: "NZ456", attribution: "MARKETING" },
  ];
  render(p);
  expect(seen.rows).toHaveLength(0);
  expect(p.flightFacts.flight.services).toHaveLength(1);
  expect(p.flightFacts.flight.qualification).toBe("QUALIFIED");
});
it("does not add airport actions when the actual airport name is absent", () => {
  const p = fixture();
  p.flightFacts.flight.endpoints.ORIGIN.name = null;
  render(p);
  expect(seen.rows[0].leg.map).toBeUndefined();
});
it("pending marker uses existing local projection scope; unrelated row cannot consume facts", () => {
  const p = fixture();
  p.source.localTargetIds = ["flight"];
  render(p);
  expect(seen.rows[0].pending).toBe(true);
  const row = props();
  row.row.coreRowKeys[0].itemId = "other";
  expect(createCoreFlightRenderer(p)(row)).toBeNull();
});

it("derives map context from the real departure airport zone when Trip context is unknown", () => {
  const projection = fixture();
  const p = props();
  p.context = "UNKNOWN";
  renderToStaticMarkup(
    createCoreFlightRenderer(projection, { instant: "2026-10-28T00:00:00Z" })(p),
  );
  expect(seen.rows[0].context).toBe("FUTURE");
});
