import { expect, it } from "vitest";
import {
  itinerary_eventsSchema,
  itinerary_reservationsSchema,
  itinerary_transport_endpointsSchema,
  trip_booking_item_linksSchema,
} from "./tripCoreV2";
import { emptyCoreGraph } from "./tripCoreV2Mutation";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import { projectCoreP5Feed } from "./tripCoreV2P5DayFeed";

const tripId = "d0000000-0000-4000-8000-000000000005";
const accountId = "d0000000-0000-4000-8000-000000000001";
const bookingId = "d0000000-0000-4000-8000-000000000010";
const ids = [
  "d0000000-0000-4000-8000-000000000011",
  "d0000000-0000-4000-8000-000000000012",
];
const actor = {
  tripId,
  accountId,
  personId: null,
  personIds: [],
  active: true,
  canManageShared: false,
};
const certificate = {
  generation: 1,
  epoch: "synthetic",
  revision: "1",
  accessRevision: 1,
  actorPersonBindingHash: "synthetic",
  participatingRosterHash: "synthetic",
  manifestSha256: "synthetic",
};
const defaultRow = <T extends { shape: Record<string, unknown> }>(schema: T) =>
  Object.fromEntries(Object.keys(schema.shape).map((key) => [key, null]));

it("keeps two explicitly shared-Booking P5 Segments as separate Day items", () => {
  const graph = emptyCoreGraph();
  graph.itinerary_events = ids.map((id, index) =>
    itinerary_eventsSchema.parse({
      ...defaultRow(itinerary_eventsSchema),
      id,
      trip_id: tripId,
      owner_account_id: accountId,
      semantic_revision: 1,
      visibility: "PRIVATE",
      created_at: "2027-01-01T00:00:00Z",
      updated_at: "2027-01-01T00:00:00Z",
      field_state: {},
      business_contract_version: 2,
      experience_family: "P5",
      temporal_contract_version: 1,
      temporal_shape: "TRANSPORT",
      title: `Segment ${index + 1}`,
      event_type: "transport",
      status: "planned",
      participation_mode: "SELF",
      participant_scope: "ASSIGNED",
    }),
  );
  graph.itinerary_transport_endpoints = ids.flatMap((id) =>
    (["ORIGIN", "DESTINATION"] as const).map((role) =>
      itinerary_transport_endpointsSchema.parse({
        ...defaultRow(itinerary_transport_endpointsSchema),
        ...coreDateBoundary(role === "ORIGIN" ? "2027-01-15" : "2027-01-16"),
        event_id: id,
        trip_id: tripId,
        role,
        authored_label: role === "ORIGIN" ? "Origin station" : "Destination station",
      }),
    ),
  );
  graph.itinerary_reservations = [
    itinerary_reservationsSchema.parse({
      ...defaultRow(itinerary_reservationsSchema),
      id: bookingId,
      trip_id: tripId,
      revision: 1,
      owner_account_id: accountId,
      visibility: "PRIVATE",
      created_at: "2027-01-01T00:00:00Z",
      updated_at: "2027-01-01T00:00:00Z",
      field_state: {},
      business_contract_version: 2,
      title: "One booking",
      commercial_status: "ACTIVE",
    }),
  ];
  graph.trip_booking_item_links = ids.map((id) =>
    trip_booking_item_linksSchema.parse({
      trip_id: tripId,
      booking_id: bookingId,
      item_id: id,
      active: true,
      linked_by: accountId,
      linked_at: "2027-01-01T00:00:00Z",
    }),
  );

  const projection = projectCoreP5Feed(graph, actor, certificate, []);
  expect(projection.items.filter((item) => item.family === "P5")).toHaveLength(2);
  expect(
    projection.items
      .filter((item) => item.family === "P5")
      .map((item) => item.bookingSummaries[0]?.id),
  ).toEqual([bookingId, bookingId]);
  expect(
    projection
      .query("2027-01-15", "Pacific/Auckland")
      .coreRows.map((row) => [row.itemRef, row.rowKey.projectionRole]),
  ).toEqual([
    [ids[0], "ORIGIN"],
    [ids[1], "ORIGIN"],
  ]);
  expect(projection.query("2027-01-15", "UTC").unresolved).toEqual([]);
  expect(projection.query("2027-01-16", "UTC").coreRows).toHaveLength(2);
  expect(projection.query("2027-01-17", "UTC").coreRows).toEqual([]);
});
