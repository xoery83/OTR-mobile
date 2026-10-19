import {
  itinerary_eventsSchema,
  itinerary_transport_endpointsSchema,
  itinerary_transport_servicesSchema,
} from "./tripCoreV2";
import { coreBoundarySchema, coreStoredBoundary } from "./tripCoreV2Temporal";
import { projectCoreDay, type CoreDayRow } from "./tripCoreV2Day";
import { projectCoreItem } from "./tripCoreV2Views";
import type { CoreActor, CoreGraph, CoreRow } from "./tripCoreV2Mutation";
import {
  validateCalendarDate,
  dayViewContext,
  type DayViewContext,
  unresolvedCandidates,
  type DayBoundary,
  type DayEvent,
  type DayQuery,
} from "./dayReadModel";
import type { FlightService } from "./flightAdmission";

export type CoreFlightFacts = {
  qualification: "SPARSE" | "QUALIFIED";
  flightNumberLiteral: string;
  services: FlightService[];
  endpoints: Record<
    "ORIGIN" | "DESTINATION",
    { code: string | null; name: string | null; terminal: string | null }
  >;
};
export type CoreFlightDayProjection = {
  version: 2;
  accountId: string;
  tripId: string;
  generation: number;
  source: {
    epoch: string;
    revision: string;
    accessRevision: number;
    actorPersonBindingHash: string;
    participatingRosterHash: string;
    manifestSha256: string;
  };
  events: DayEvent[];
  items: NonNullable<ReturnType<typeof projectCoreItem>>[];
  flightFacts: Record<string, CoreFlightFacts>;
  query(
    date: string,
    context: string | DayViewContext,
  ): DayQuery & { coreRows: CoreDayRow[] };
};
const spatialKeys = Object.keys(itinerary_transport_endpointsSchema.shape).filter(
  (key) =>
    ![...Object.keys(coreBoundarySchema.shape), "event_id", "trip_id", "role"].includes(
      key,
    ),
);
const spatial = (row: CoreRow) =>
  Object.fromEntries(spatialKeys.map((key) => [key, row[key] ?? null])) as Omit<
    DayBoundary,
    keyof typeof coreBoundarySchema.shape | "role"
  >;

// Presentation bridge only; v2 certificates never masquerade as SQLite47/v1 admission.
export function projectCoreFlightFeed(
  graph: CoreGraph,
  actor: CoreActor,
  certificate: CoreFlightDayProjection["source"] & { generation: number },
  participatingPersonIds: readonly string[],
): CoreFlightDayProjection {
  const items = graph.itinerary_events
    .filter((row) => row.experience_family === "P2")
    .map((row) =>
      projectCoreItem(graph, actor, String(row.id), {
        rosterHash: certificate.participatingRosterHash,
        participatingPersonIds,
      }),
    )
    .filter(
      (item): item is NonNullable<typeof item> =>
        item !== null &&
        !item.hidden &&
        !["cancelled", "skipped"].includes(String(item.status)),
    );
  const events = items.map((item): DayEvent => {
    const row = itinerary_eventsSchema.parse(
      graph.itinerary_events.find((r) => r.id === item.itemId),
    );
    const boundaries: DayBoundary[] =
      row.temporal_shape === "TRANSPORT"
        ? graph.itinerary_transport_endpoints
            .filter((r) => r.event_id === item.itemId)
            .map((r) => {
              const endpoint = itinerary_transport_endpointsSchema.parse(r);
              return {
                ...spatial(endpoint),
                ...coreStoredBoundary(endpoint),
                role: endpoint.role,
              };
            })
        : [{ ...spatial(row), ...coreStoredBoundary(row, "start"), role: "ORIGIN" }];
    return {
      ...spatial(row),
      id: row.id,
      semantic_revision: row.semantic_revision,
      title: row.title,
      event_type: row.event_type,
      status: row.status,
      order_index: row.order_index,
      trip_day_id: row.trip_day_id,
      temporal_shape: row.temporal_shape,
      participant_scope: row.participant_scope,
      timing_label: row.timing_label,
      timing_provenance_ref: null,
      is_estimated_time: boundaries.some((b) => b.quality === "ESTIMATED"),
      boundaries,
    };
  });
  const flightFacts = Object.fromEntries(
    items.map((item) => {
      const intent = graph.trip_flight_intents.find((r) => r.event_id === item.itemId)!;
      const facts = (role: "ORIGIN" | "DESTINATION") => {
        const endpoint = graph.itinerary_transport_endpoints.find(
          (r) => r.event_id === item.itemId && r.role === role,
        );
        const details = graph.trip_endpoint_details.find(
          (r) => r.event_id === item.itemId && r.role === role,
        );
        return {
          code: (details?.airport_code as string | null) ?? null,
          name: (endpoint?.authored_label as string | null) ?? null,
          terminal: (details?.terminal as string | null) ?? null,
        };
      };
      const services = graph.itinerary_transport_services
        .filter((r) => r.event_id === item.itemId)
        .sort((a, b) => String(a.service_key).localeCompare(String(b.service_key)))
        .map((r) => {
          const {
            event_id: _,
            trip_id: __,
            ...service
          } = itinerary_transport_servicesSchema.parse(r);
          return service as FlightService;
        });
      return [
        item.itemId,
        {
          qualification: intent.qualification as CoreFlightFacts["qualification"],
          flightNumberLiteral: String(intent.flight_number_literal),
          services,
          endpoints: { ORIGIN: facts("ORIGIN"), DESTINATION: facts("DESTINATION") },
        },
      ];
    }),
  );
  const projection: CoreFlightDayProjection = {
    version: 2,
    accountId: actor.accountId,
    tripId: actor.tripId,
    generation: certificate.generation,
    source: {
      epoch: certificate.epoch,
      revision: certificate.revision,
      accessRevision: certificate.accessRevision,
      actorPersonBindingHash: certificate.actorPersonBindingHash,
      participatingRosterHash: certificate.participatingRosterHash,
      manifestSha256: certificate.manifestSha256,
    },
    events,
    items,
    flightFacts,
    query(date, zone) {
      validateCalendarDate(date);
      const context = dayViewContext(zone);
      const day = projectCoreDay(graph, actor, date, certificate.generation).filter(
        (r) => r.family === "P2",
      );
      const timed: DayQuery["timed"] = [],
        nonComparable: DayQuery["nonComparable"] = [];
      for (const event of events) {
        const rows = day.filter((r) => r.itemRef === event.id);
        if (!rows.length) continue;
        const roles = rows.map(
          (r) => r.rowKey.projectionRole as "ORIGIN" | "DESTINATION",
        );
        const anchor =
          rows.find((r) => r.position === "TIMELINE")?.displayTime?.instant ?? null;
        (anchor === null ? nonComparable : timed).push({
          event,
          roles,
          anchor,
          occupancy: false,
          occupancyBasis: null,
        });
      }
      // Keep the owning Day order, including created_at and microsecond ties.
      for (const list of [timed, nonComparable])
        list.sort(
          (a, b) =>
            day.findIndex((r) => r.itemRef === a.event.id) -
            day.findIndex((r) => r.itemRef === b.event.id),
        );
      return {
        date,
        ...context,
        timed,
        nonComparable,
        coreRows: day,
        unresolved: unresolvedCandidates({ events }),
      };
    },
  };
  return projection;
}
