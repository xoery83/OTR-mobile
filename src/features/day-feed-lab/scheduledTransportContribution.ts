import {
  itinerary_eventsSchema,
  itinerary_reservationsSchema,
  itinerary_transport_endpointsSchema,
  itinerary_transport_servicesSchema,
  trip_booking_item_linksSchema,
  trip_endpoint_detailsSchema,
} from "@/domain/trip/tripCoreV2";
import { emptyCoreGraph, type CoreActor } from "@/domain/trip/tripCoreV2Mutation";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { projectCoreP5Feed } from "@/domain/trip/tripCoreV2P5DayFeed";
import { createCoreScheduledTransportRenderer } from "@/features/day-feed/coreScheduledTransportRenderer";
import { t } from "@/ui/locale";
import { scenario } from "./fixtureFacts";
import type { FixtureContribution } from "./contribution";

type Period = "FUTURE" | "TODAY" | "PAST";
const suffix = { FUTURE: "1", TODAY: "2", PAST: "3" } as const;
const instant = {
  FUTURE: "2027-01-14T12:00:00Z",
  TODAY: "2027-01-15T12:00:00Z",
  PAST: "2027-01-18T12:00:00Z",
} as const;
const defaults = <T extends { shape: Record<string, unknown> }>(schema: T) =>
  Object.fromEntries(Object.keys(schema.shape).map((key) => [key, null]));
const clock = (date: string, hour: string) => ({
  ...coreDateBoundary(date),
  local_time: `${hour}:00:00`,
  clock_precision: 0,
  quality: "EXACT",
  basis: "SOURCE_INSTANT",
  zone_id: "UTC",
  source_instant: `${date}T${hour}:00:00Z`,
  source_instant_precision: 0,
  instant: `${date}T${hour}:00:00Z`,
  civil_resolution: "UNIQUE",
});

// Private synthetic Lab evidence; no accepted storage or Ticket opener is forged.
export function scheduledTransportContribution(period: Period): FixtureContribution {
  const ending = suffix[period];
  const tripId = `d1000000-0000-4000-8000-00000000000${ending}`;
  const accountId = "d1000000-0000-4000-8000-000000000000";
  const bookingId = `d1000000-0000-4000-8000-00000000001${ending}`;
  const ids = [
    `d1000000-0000-4000-8000-00000000002${ending}`,
    `d1000000-0000-4000-8000-00000000003${ending}`,
  ];
  const actor: CoreActor = {
    accountId,
    tripId,
    personId: null,
    personIds: [],
    active: true,
    canManageShared: false,
  };
  const graph = emptyCoreGraph();
  graph.itinerary_events = ids.map((id, index) =>
    itinerary_eventsSchema.parse({
      ...defaults(itinerary_eventsSchema),
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
      title: t(index ? "p5Lab.segmentB" : "p5Lab.segmentA"),
      event_type: "transport",
      status: "planned",
      participation_mode: "SELF",
      participant_scope: "ASSIGNED",
    }),
  );
  graph.itinerary_transport_endpoints = ids.flatMap((id, index) =>
    (["ORIGIN", "DESTINATION"] as const).map((role) =>
      itinerary_transport_endpointsSchema.parse({
        ...defaults(itinerary_transport_endpointsSchema),
        ...clock(
          role === "ORIGIN" ? "2027-01-15" : "2027-01-16",
          role === "ORIGIN" ? "09" : "11",
        ),
        event_id: id,
        trip_id: tripId,
        role,
        authored_label: t(
          role === "ORIGIN"
            ? index
              ? "p5Lab.originB"
              : "p5Lab.originA"
            : "p5Lab.destination",
        ),
      }),
    ),
  );
  graph.trip_endpoint_details = ids.map((id) =>
    trip_endpoint_detailsSchema.parse({
      ...defaults(trip_endpoint_detailsSchema),
      event_id: id,
      trip_id: tripId,
      role: "ORIGIN",
      platform: t("p5Lab.platform"),
    }),
  );
  graph.itinerary_transport_services = ids.map((id) =>
    itinerary_transport_servicesSchema.parse({
      ...defaults(itinerary_transport_servicesSchema),
      event_id: id,
      trip_id: tripId,
      service_key: `synthetic:${id.slice(-2)}`,
      transport_subtype: "TRAIN",
      attribution: "OPERATING",
      operator_namespace: "NAME",
      operator_issuer: "synthetic",
      operator_value: "synthetic-rail",
      operator_literal: t("p5Lab.operator"),
      service_number: "S1",
      service_literal: "S1",
    }),
  );
  graph.itinerary_reservations = [
    itinerary_reservationsSchema.parse({
      ...defaults(itinerary_reservationsSchema),
      id: bookingId,
      trip_id: tripId,
      revision: 1,
      owner_account_id: accountId,
      visibility: "PRIVATE",
      created_at: "2027-01-01T00:00:00Z",
      updated_at: "2027-01-01T00:00:00Z",
      field_state: {},
      business_contract_version: 2,
      title: t("p5Lab.booking"),
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
  const projection = projectCoreP5Feed(
    graph,
    actor,
    {
      generation: 1,
      epoch: "synthetic",
      revision: "1",
      accessRevision: 1,
      actorPersonBindingHash: "synthetic",
      participatingRosterHash: "synthetic",
      manifestSha256: "synthetic",
    },
    [],
  );
  const base = scenario(tripId, t(`p5Lab.scenario.${period}`), projection.events);
  return {
    ...base,
    projection: { ...base.projection, accountId },
    dateRange: { start: "2027-01-15", end: "2027-01-16" },
    dates: ["2027-01-15", "2027-01-16"],
    selectedDate: "2027-01-15",
    instant: instant[period],
    metadata: {
      summary: t("p5Lab.proof"),
      expected: ["SEPARATE_SEGMENTS", "BOARDING_BEFORE_TICKET", "NO_GAP"],
    },
    query: projection.query,
    renderer: createCoreScheduledTransportRenderer(projection),
  };
}
