import { coreCanRead } from "./tripCoreV2Mutation";
import type { CoreActor, CoreGraph, CoreRow } from "./tripCoreV2Mutation";
import { coreStoredBoundary, type CoreBoundary } from "./tripCoreV2Temporal";
import { instantMicroseconds } from "./dayReadModel";
export type CoreBoundaryView = {
  comparable: boolean;
  localDate?: string;
  localTime?: string;
  precision?: number;
  quality?: string;
  basis?: string;
  zoneId?: string;
  instant?: string;
  civilResolution?: string;
};
export type CorePlaceView = {
  qualification: "TEXT_ONLY" | "QUALIFIED";
  authoredLabel?: string;
  authoredText?: string;
  authoredAddress?: string;
  acceptedAddress?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
};
export const closedItemCapabilities = {
  canEdit: false,
  canManageParticipation: false,
  canManageVisibility: false,
  canCancel: false,
  canHide: false,
  canRestore: false,
  canLinkBooking: false,
  canLinkEntitlement: false,
  canAttachDocument: false,
} as const;
export type CoreDayRow = {
  rowKey: { itemId: string; projectionRole: string; localDate: string };
  itemRevision: number;
  projectionVersion: 2;
  certificateGeneration: number;
  family: string;
  title: string;
  status: string;
  position: "TNS" | "TIMELINE" | "BASE";
  displayTime?: CoreBoundaryView;
  place?: CorePlaceView;
  itemRef: string;
  visualGroupKey?: string;
  capabilities: typeof closedItemCapabilities;
};
export function coreBoundaryView(time: CoreBoundary): CoreBoundaryView {
  const view: CoreBoundaryView = {
    comparable:
      time.instant !== null &&
      time.quality === "EXACT" &&
      (time.basis === "SOURCE_INSTANT" ||
        ["UNIQUE", "FOLD_RESOLVED"].includes(time.civil_resolution ?? "")),
  };
  const mapping = {
    local_date: "localDate",
    local_time: "localTime",
    clock_precision: "precision",
    quality: "quality",
    basis: "basis",
    zone_id: "zoneId",
    instant: "instant",
    civil_resolution: "civilResolution",
  } as const;
  for (const [key, target] of Object.entries(mapping))
    if (time[key as keyof CoreBoundary] !== null)
      (view as Record<string, unknown>)[target] = time[key as keyof CoreBoundary];
  return view;
}
export function corePlaceView(row: CoreRow): CorePlaceView | undefined {
  const view: CorePlaceView = {
    qualification:
      typeof row.accepted_place_id === "string" &&
      typeof row.accepted_latitude === "number" &&
      typeof row.accepted_longitude === "number"
        ? "QUALIFIED"
        : "TEXT_ONLY",
  };
  const mapping = {
    authored_label: "authoredLabel",
    authored_text: "authoredText",
    authored_address: "authoredAddress",
    accepted_address: "acceptedAddress",
    accepted_place_id: "placeId",
    accepted_latitude: "latitude",
    accepted_longitude: "longitude",
  } as const;
  for (const [key, target] of Object.entries(mapping))
    if (row[key] !== null && row[key] !== undefined)
      (view as Record<string, unknown>)[target] = row[key];
  return Object.keys(view).length === 1 ? undefined : view;
}
const applies = (g: CoreGraph, r: CoreRow, actor: CoreActor) =>
  r.participation_mode === "WHOLE_GROUP" ||
  (r.participation_mode === "SELF" &&
    (r.owner_account_id === actor.accountId ||
      (actor.personId !== null && r.self_person_id === actor.personId))) ||
  (r.participation_mode === "SELECTED_MEMBERS" &&
    g.trip_item_participants.some(
      (x) => x.item_id === r.id && x.active && x.person_id === actor.personId,
    ));
export function projectCoreDay(
  graph: CoreGraph,
  actor: CoreActor,
  localDate: string,
  certificateGeneration: number,
  history = false,
): CoreDayRow[] {
  const rows: CoreDayRow[] = [];
  const active = graph.itinerary_events.filter(
    (r) =>
      coreCanRead(graph, actor, "ITEM", r) &&
      (history ||
        (r.hidden_at === null && !["cancelled", "skipped"].includes(r.status as string))),
  );
  function add(
    item: CoreRow,
    role: string,
    time: CoreBoundary,
    place?: CoreRow,
    base = false,
  ) {
    if (time.local_date !== localDate) return;
    const display = coreBoundaryView(time);
    rows.push({
      rowKey: { itemId: item.id as string, projectionRole: role, localDate },
      itemRevision: item.semantic_revision as number,
      projectionVersion: 2,
      certificateGeneration,
      family: item.experience_family as string,
      title: item.title as string,
      status: item.status as string,
      position: base ? "BASE" : display.comparable ? "TIMELINE" : "TNS",
      ...(base ? {} : { displayTime: display }),
      ...(place && corePlaceView(place) ? { place: corePlaceView(place) } : {}),
      itemRef: item.id as string,
      capabilities: closedItemCapabilities,
    });
  }
  for (const item of active) {
    const family = item.experience_family,
      id = item.id;
    if (item.temporal_shape === "TRANSPORT") {
      for (const role of ["ORIGIN", "DESTINATION"]) {
        const endpoint = graph.itinerary_transport_endpoints.find(
          (x) => x.event_id === id && x.role === role,
        );
        if (endpoint) add(item, role, coreStoredBoundary(endpoint), endpoint);
      }
    } else if (family === "P3") {
      add(item, "CHECKIN", coreStoredBoundary(item, "start"), item);
      if (item.end_local_date)
        add(item, "CHECKOUT", coreStoredBoundary(item, "end"), item);
    } else if (family === "P4") {
      add(
        item,
        "PICKUP",
        coreStoredBoundary(item, "start"),
        graph.trip_rental_places.find((x) => x.event_id === id && x.role === "PICKUP"),
      );
      if (item.end_local_date)
        add(
          item,
          "RETURN",
          coreStoredBoundary(item, "end"),
          graph.trip_rental_places.find((x) => x.event_id === id && x.role === "RETURN"),
        );
    } else {
      add(
        item,
        family === "P2" ? "ORIGIN" : family === "P6" ? "ENTRY" : "START",
        coreStoredBoundary(item, "start"),
        family === "P6"
          ? (graph.trip_activity_entry_places.find((x) => x.event_id === id) ?? item)
          : item,
      );
      if (item.end_local_date && item.end_local_date !== item.start_local_date)
        add(item, "END", coreStoredBoundary(item, "end"), item);
    }
  }
  const nights = active.filter(
    (r) =>
      r.experience_family === "P3" &&
      typeof r.start_local_date === "string" &&
      typeof r.end_local_date === "string" &&
      r.start_local_date <= localDate &&
      localDate < r.end_local_date &&
      applies(graph, r, actor),
  );
  if (nights.length === 1 && nights[0].start_local_date !== localDate) {
    const item = nights[0],
      time = {
        ...coreStoredBoundary(item, "start"),
        local_date: localDate,
        local_time: null,
        clock_precision: null,
        instant: null,
        source_instant: null,
        source_instant_precision: null,
        quality: "UNKNOWN" as const,
        basis: "DERIVED_CIVIL" as const,
        civil_resolution: "PENDING" as const,
      };
    const hasActivity = rows.some((r) => r.family !== "P3");
    for (const role of hasActivity ? ["BASE_FROM", "BASE_RETURN"] : ["TONIGHT"])
      add(item, role, time, item, true);
  }
  for (const row of rows) {
    if (row.family !== "P4" || !row.displayTime?.comparable || !row.place) continue;
    const item = active.find((x) => x.id === row.itemRef)!;
    const placeKey = row.place.placeId ?? row.place.authoredLabel;
    if (!placeKey) continue;
    const key = [
      row.rowKey.projectionRole,
      localDate,
      instantMicroseconds(row.displayTime.instant!).toString(),
      row.displayTime.precision,
      placeKey,
      item.participation_mode,
      item.self_person_id ?? "",
      graph.trip_item_participants
        .filter((x) => x.item_id === item.id && x.active)
        .map((x) => x.person_id)
        .sort()
        .join(","),
    ].join("|");
    row.visualGroupKey = key;
  }
  for (const row of rows)
    if (
      row.visualGroupKey &&
      rows.filter((x) => x.visualGroupKey === row.visualGroupKey).length < 2
    )
      delete row.visualGroupKey;
  rows.sort((a, b) => {
    if (a.position !== b.position)
      return (
        ["TIMELINE", "TNS", "BASE"].indexOf(a.position) -
        ["TIMELINE", "TNS", "BASE"].indexOf(b.position)
      );
    if (a.position === "TIMELINE") {
      const ai = instantMicroseconds(a.displayTime!.instant!),
        bi = instantMicroseconds(b.displayTime!.instant!);
      if (ai !== bi) return ai < bi ? -1 : 1;
    }
    const ar = active.find((x) => x.id === a.itemRef)!,
      br = active.find((x) => x.id === b.itemRef)!;
    const ao = ar.order_index as number | null,
      bo = br.order_index as number | null;
    if (ao !== bo) return ao === null ? 1 : bo === null ? -1 : ao - bo;
    return (
      String(ar.created_at).localeCompare(String(br.created_at)) ||
      a.itemRef.localeCompare(b.itemRef) ||
      a.rowKey.projectionRole.localeCompare(b.rowKey.projectionRole)
    );
  });
  return rows;
}
export function coreNeutralInterval(
  previous: CoreBoundaryView,
  next: CoreBoundaryView,
): { microseconds: string } | null {
  if (!previous.comparable || !next.comparable || !previous.instant || !next.instant)
    return null;
  const delta = instantMicroseconds(next.instant) - instantMicroseconds(previous.instant);
  return delta < 0n ? null : { microseconds: delta.toString() };
}
