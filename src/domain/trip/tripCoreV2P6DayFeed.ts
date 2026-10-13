import { itinerary_eventsSchema } from "./tripCoreV2";
import { coreStoredBoundary } from "./tripCoreV2Temporal";
import { projectCoreDay } from "./tripCoreV2Day";
import { projectCoreItem } from "./tripCoreV2Views";
import { projectCoreP5Feed } from "./tripCoreV2P5DayFeed";
import type { CoreFlightDayProjection } from "./tripCoreV2DayFeed";
import type { CoreActor, CoreGraph, CoreRow } from "./tripCoreV2Mutation";
import {
  unresolvedCandidates,
  type DayBoundary,
  type DayEvent,
  type DayItem,
} from "./dayReadModel";

const spatialKeys = [
  "authored_label",
  "authored_text",
  "authored_address",
  "accepted_address",
  "accepted_latitude",
  "accepted_longitude",
  "accepted_place_id",
  "spatial_provenance_refs",
  "location_input_revision",
  "authored_address_line1",
  "authored_address_line2",
  "authored_address_locality",
  "authored_address_region",
  "authored_address_postal_code",
  "authored_address_country",
  "accepted_address_line1",
  "accepted_address_line2",
  "accepted_address_locality",
  "accepted_address_region",
  "accepted_address_postal_code",
  "accepted_address_country",
] as const;
const spatial = (row: CoreRow) =>
  Object.fromEntries(spatialKeys.map((key) => [key, row[key] ?? null])) as Omit<
    DayBoundary,
    "role" | keyof ReturnType<typeof coreStoredBoundary>
  >;

// Additive accepted read: P6 presentation never changes Core occurrence or TNS authority.
export function projectCoreP6Feed(
  graph: CoreGraph,
  actor: CoreActor,
  certificate: CoreFlightDayProjection["source"] & { generation: number },
  participatingPersonIds: readonly string[],
): CoreFlightDayProjection {
  const base = projectCoreP5Feed(graph, actor, certificate, participatingPersonIds);
  const items = graph.itinerary_events
    .filter((row) => row.experience_family === "P6")
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
        (row) => ["P1", "P2", "P3", "P4", "P5", "P6"].includes(row.family),
      );
      const day = allDay.filter((row) => row.family === "P6");
      const timed = [...query.timed],
        nonComparable = [...query.nonComparable];
      for (const event of events) {
        const rows = day.filter((row) => row.itemRef === event.id);
        if (!rows.length) continue;
        const anchor =
          rows.find((row) => row.position === "TIMELINE")?.displayTime?.instant ?? null;
        const item: DayItem = {
          event,
          roles: rows.map((row) =>
            row.rowKey.projectionRole === "END" ? "END" : "START",
          ),
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
