import {
  itinerary_eventsSchema,
  itinerary_transport_endpointsSchema,
} from "./tripCoreV2";
import { coreBoundarySchema, coreStoredBoundary } from "./tripCoreV2Temporal";
import { projectCoreDisplayDay } from "./tripCoreV2DayFeed";
import { projectCoreItem } from "./tripCoreV2Views";
import { projectCoreP4Feed } from "./tripCoreV2P4DayFeed";
import type { CoreFlightDayProjection } from "./tripCoreV2DayFeed";
import type { CoreActor, CoreGraph, CoreRow } from "./tripCoreV2Mutation";
import {
  unresolvedCandidates,
  type DayBoundary,
  type DayEvent,
  type DayItem,
} from "./dayReadModel";

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

// P5 is an additive accepted read. Every Segment keeps its Core item identity;
// Booking relationships never collapse separate events into one Feed item.
export function projectCoreP5Feed(
  graph: CoreGraph,
  actor: CoreActor,
  certificate: CoreFlightDayProjection["source"] & { generation: number },
  participatingPersonIds: readonly string[],
): CoreFlightDayProjection {
  const base = projectCoreP4Feed(graph, actor, certificate, participatingPersonIds);
  const items = graph.itinerary_events
    .filter((row) => row.experience_family === "P5")
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
    const root = itinerary_eventsSchema.parse(
      graph.itinerary_events.find((row) => row.id === item.itemId),
    );
    const boundaries: DayBoundary[] = graph.itinerary_transport_endpoints
      .filter((row) => row.event_id === item.itemId)
      .map((row) => {
        const endpoint = itinerary_transport_endpointsSchema.parse(row);
        return {
          ...spatial(endpoint),
          ...coreStoredBoundary(endpoint),
          role: endpoint.role,
        };
      });
    return {
      ...spatial(root),
      id: root.id,
      semantic_revision: root.semantic_revision,
      title: root.title,
      event_type: root.event_type,
      status: root.status,
      order_index: root.order_index,
      trip_day_id: root.trip_day_id,
      temporal_shape: root.temporal_shape,
      participant_scope: root.participant_scope,
      timing_label: root.timing_label,
      timing_provenance_ref: null,
      is_estimated_time: boundaries.some((boundary) => boundary.quality === "ESTIMATED"),
      boundaries,
    };
  });
  return {
    ...base,
    items: [...base.items, ...items],
    events: [...base.events, ...events],
    query(date, zone) {
      const query = base.query(date, zone);
      const allDay = projectCoreDisplayDay(graph, actor, date, certificate).filter(
        (row) => ["P1", "P2", "P3", "P4", "P5"].includes(row.family),
      );
      const day = allDay.filter((row) => row.family === "P5");
      const timed = [...query.timed],
        nonComparable = [...query.nonComparable];
      for (const event of events) {
        const rows = day.filter((row) => row.itemRef === event.id);
        if (!rows.length) continue;
        const roles: DayBoundary["role"][] = rows.map((row) =>
          row.rowKey.projectionRole === "DESTINATION" ? "DESTINATION" : "ORIGIN",
        );
        const anchor =
          rows.find((row) => row.position === "TIMELINE")?.displayTime?.instant ?? null;
        const item: DayItem = {
          event,
          roles,
          anchor,
          occupancy: false,
          occupancyBasis: null,
        };
        (anchor === null ? nonComparable : timed).push(item);
      }
      const order = (item: DayItem) =>
        allDay.findIndex(
          (row) =>
            row.itemRef === item.event.id &&
            (row.family !== "P4" ||
              row.rowKey.projectionRole ===
                (item.roles[0] === "END" ? "RETURN" : "PICKUP")),
        );
      timed.sort((a, b) => order(a) - order(b));
      nonComparable.sort((a, b) => order(a) - order(b));
      return {
        ...query,
        timed,
        nonComparable,
        coreRows: allDay,
        unresolved: [
          ...query.unresolved,
          ...unresolvedCandidates({ events }).filter(
            (event) => !event.boundaries.some((boundary) => boundary.local_date),
          ),
        ],
      };
    },
  };
}
