import {
  itinerary_eventsSchema,
  itinerary_transport_endpointsSchema,
} from "./tripCoreV2";
import { coreBoundarySchema, coreStoredBoundary } from "./tripCoreV2Temporal";
import { projectCoreDay } from "./tripCoreV2Day";
import { projectCoreItem } from "./tripCoreV2Views";
import { projectCoreP1P3Feed } from "./tripCoreV2P1P3DayFeed";
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

// Additive accepted-read projection. Core owns dates, visibility and endpoint roles.
export function projectCoreP4Feed(
  graph: CoreGraph,
  actor: CoreActor,
  certificate: CoreFlightDayProjection["source"] & { generation: number },
  participatingPersonIds: readonly string[],
): CoreFlightDayProjection {
  const base = projectCoreP1P3Feed(graph, actor, certificate, participatingPersonIds);
  const items = graph.itinerary_events
    .filter((row) => row.experience_family === "P4")
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
    const boundaries: DayBoundary[] = [
      { ...spatial(root), ...coreStoredBoundary(root, "start"), role: "START" },
      ...(root.end_local_date
        ? [{ ...spatial(root), ...coreStoredBoundary(root, "end"), role: "END" as const }]
        : []),
    ];
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
      const allDay = projectCoreDay(graph, actor, date, certificate.generation).filter(
        (row) => ["P1", "P2", "P3", "P4"].includes(row.family),
      );
      const day = allDay.filter((row) => row.family === "P4");
      const timed = [...query.timed],
        nonComparable = [...query.nonComparable];
      for (const event of events) {
        const rows = day.filter((row) => row.itemRef === event.id);
        if (!rows.length) continue;
        const roles: DayBoundary["role"][] = rows.map((row) =>
          row.rowKey.projectionRole === "RETURN" ? "END" : "START",
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
        allDay.findIndex((row) => row.itemRef === item.event.id);
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
