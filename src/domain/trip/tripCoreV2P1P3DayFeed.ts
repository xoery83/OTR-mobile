import {
  itinerary_eventsSchema,
  itinerary_transport_endpointsSchema,
} from "./tripCoreV2";
import { coreBoundarySchema, coreStoredBoundary } from "./tripCoreV2Temporal";
import { projectCoreDisplayDay } from "./tripCoreV2DayFeed";
import { projectCoreItem } from "./tripCoreV2Views";
import { projectCoreFlightFeed, type CoreFlightDayProjection } from "./tripCoreV2DayFeed";
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

// Additive read2 bridge; owning Core rows qualify every occurrence and Base.
export function projectCoreP1P3Feed(
  graph: CoreGraph,
  actor: CoreActor,
  certificate: CoreFlightDayProjection["source"] & { generation: number },
  participatingPersonIds: readonly string[],
): CoreFlightDayProjection {
  const flight = projectCoreFlightFeed(graph, actor, certificate, participatingPersonIds);
  const items = graph.itinerary_events
    .filter((row) => ["P1", "P3"].includes(String(row.experience_family)))
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
    const boundaries: DayBoundary[] = [
      { ...spatial(row), ...coreStoredBoundary(row, "start"), role: "START" },
      ...(row.end_local_date
        ? [
            {
              ...spatial(row),
              ...coreStoredBoundary(row, "end"),
              role: "END" as const,
            },
          ]
        : []),
    ];
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
  return {
    ...flight,
    items: [...flight.items, ...items],
    events: [...flight.events, ...events],
    query(date, zone) {
      const query = flight.query(date, zone);
      const day = projectCoreDisplayDay(graph, actor, date, certificate).filter((r) =>
        ["P1", "P2", "P3"].includes(r.family),
      );
      const timed = [...query.timed],
        nonComparable = [...query.nonComparable];
      for (const event of events) {
        const rows = day.filter((r) => r.itemRef === event.id);
        if (!rows.length) continue;
        const roles: DayBoundary["role"][] = [];
        for (const row of rows) {
          const role = row.rowKey.projectionRole;
          if (["START", "CHECKIN"].includes(role)) roles.push("START");
          else if (["END", "CHECKOUT"].includes(role)) roles.push("END");
        }
        const base = rows.some((r) => r.position === "BASE");
        const anchor =
          rows.find((r) => r.position === "TIMELINE")?.displayTime?.instant ?? null;
        const item: DayItem = {
          event,
          roles,
          anchor,
          occupancy: base,
          occupancyBasis: base ? "CALENDAR_NIGHTS" : null,
        };
        (anchor === null ? nonComparable : timed).push(item);
      }
      for (const list of [timed, nonComparable])
        list.sort(
          (a, b) =>
            day.findIndex((r) => r.itemRef === a.event.id) -
            day.findIndex((r) => r.itemRef === b.event.id),
        );
      return {
        ...query,
        timed,
        nonComparable,
        coreRows: day,
        unresolved: [...query.unresolved, ...unresolvedCandidates({ events })],
      };
    },
  };
}
