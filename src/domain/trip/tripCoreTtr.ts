import { coreHashValue } from "./tripCoreV2Read";
import type { ImportHash } from "./flightImportReview";
import { type Json } from "./tripCoreV2Json";
import { coreStoredBoundary } from "./tripCoreV2Temporal";
import { coreBoundaryView, projectCoreDay } from "./tripCoreV2Day";
import {
  coreCanRead,
  type CoreActor,
  type CoreGraph,
  type CoreRow,
} from "./tripCoreV2Mutation";
import {
  coreVisitToken,
  type OrdinaryNode,
  type OrdinaryGap,
} from "./tripCoreOrdinaryOrder";
import { instantMicroseconds, localCalendarDate } from "./dayReadModel";
import type { TtrInput } from "./ttr";
export function ordinaryApplies(g: CoreGraph, item: CoreRow, person: string): boolean {
  return (
    item.participation_mode === "WHOLE_GROUP" ||
    (item.participation_mode === "SELF" && item.self_person_id === person) ||
    (item.participation_mode === "SELECTED_MEMBERS" &&
      g.trip_item_participants.some(
        (p) => p.item_id === item.id && p.active && p.person_id === person,
      ))
  );
}
const active = (item: CoreRow) => !["cancelled", "skipped"].includes(String(item.status));
function endpoint(g: CoreGraph, n: OrdinaryNode, side: "entry" | "exit") {
  const item = g.itinerary_events.find((x) => x.id === n.eventId),
    role = n[side];
  if (!item || !role) return null;
  if (item.temporal_shape === "TRANSPORT") {
    if (role !== (side === "exit" ? "DESTINATION" : "ORIGIN")) return null;
    const row = g.itinerary_transport_endpoints.find(
      (x) => x.event_id === n.eventId && x.role === role,
    );
    return row ? { row, time: coreStoredBoundary(row), role } : null;
  }
  if (item.experience_family !== "P1" && item.experience_family !== "P6") return null;
  if (role === "ENTRY" && side === "entry" && item.experience_family === "P6") {
    const row = g.trip_activity_entry_places.find(
      (x) => x.event_id === n.eventId && x.role === "ENTRY",
    );
    return row ? { row, time: coreStoredBoundary(item, "start"), role } : null;
  }
  // No inferred multi-location exit or duration: Beta root-site endpoints are point visits only.
  if (item.temporal_shape !== "POINT" || role !== "START") return null;
  return { row: item, time: coreStoredBoundary(item, "start"), role };
}
function possibleDay(
  g: CoreGraph,
  item: CoreRow,
  date: string,
  zone: string | null,
): boolean {
  const boundaries =
    item.temporal_shape === "TRANSPORT"
      ? ["ORIGIN", "DESTINATION"].map((role) =>
          g.itinerary_transport_endpoints.find(
            (e) => e.event_id === item.id && e.role === role,
          ),
        )
      : [
          { local_date: item.start_local_date, zone_id: item.start_zone_id },
          {
            local_date: item.end_local_date ?? item.start_local_date,
            zone_id: item.end_zone_id ?? item.start_zone_id,
          },
        ];
  if (boundaries.some((b) => !b || typeof b.local_date !== "string")) return true;
  const dates = boundaries.map((b) => String(b!.local_date));
  if (zone && boundaries.every((b) => b!.zone_id === zone))
    return dates[0] <= date && date <= dates[1];
  // Scope exclusion only: unknown/different zones can shift civil dates. No clock fact is emitted.
  const civilDay = (d: string) => Date.parse(d + "T12:00:00Z") / 86400000;
  const a = civilDay(dates[0]),
    b = civilDay(dates[1]),
    target = civilDay(date);
  if (![a, b, target].every(Number.isFinite)) return true;
  return a - 2 <= target && target <= b + 2;
}
/** Owning read projection. Hidden runs become UNKNOWN gaps, never IDs or counts. */
export function projectOrdinaryOrder(
  g: CoreGraph,
  actor: CoreActor,
  order: CoreRow,
): CoreRow {
  const raw = order.nodes as OrdinaryNode[],
    gaps = order.gaps as OrdinaryGap[];
  const nodes = raw.filter((n) => {
    const item = g.itinerary_events.find((x) => x.id === n.eventId);
    return item && coreCanRead(g, actor, "ITEM", item);
  });
  const accounted = new Set([
    ...raw.map((n) => n.eventId),
    ...gaps.flatMap((x) => (x.transportId ? [x.transportId] : [])),
  ]);
  const projected = nodes.slice(0, -1).map((n, i): OrdinaryGap => {
    const to = nodes[i + 1],
      a = raw.indexOf(n),
      b = raw.indexOf(to),
      stored = gaps[a];
    const unknown = {
      from: n.eventId,
      to: to.eventId,
      coverage: "UNKNOWN" as const,
      transportId: null,
      complete: false,
    };
    if (b !== a + 1 || !stored || stored.from !== n.eventId || stored.to !== to.eventId)
      return unknown;
    const start = endpoint(g, n, "exit"),
      end = endpoint(g, to, "entry");
    const date = end?.time.local_date;
    if (!date || !start?.time.local_date || start.time.local_date !== date)
      return unknown;
    const unplaced = g.itinerary_events.some(
      (x) =>
        active(x) &&
        ordinaryApplies(g, x, String(order.person_id)) &&
        !accounted.has(String(x.id)) &&
        possibleDay(g, x, date, end?.time.zone_id ?? null),
    );
    if (unplaced) return unknown;
    if (stored.transportId) {
      const leg = g.itinerary_events.find((x) => x.id === stored.transportId);
      if (
        !leg ||
        !active(leg) ||
        !ordinaryApplies(g, leg, String(order.person_id)) ||
        !coreCanRead(g, actor, "ITEM", leg)
      )
        return unknown;
    }
    return stored;
  });
  return { ...order, nodes, gaps: projected };
}
export type CoreTtrUnavailableReason =
  | "ACCESS_UNAVAILABLE"
  | "PERSON_BINDING_UNKNOWN"
  | "CONTINUITY_UNKNOWN"
  | "EXPLICIT_TRANSPORT"
  | "UNKNOWN_APPLICABILITY"
  | "MISSING_OPERATIVE_ENDPOINT"
  | "SPATIAL_UNQUALIFIED"
  | "UNKNOWN_DAY_CONTEXT"
  | "UNSUPPORTED_FLIGHT_CONNECTION"
  | "TEMPORAL_CONFLICT"
  | "ANCHOR_UNAVAILABLE";
export type CoreTtrResult =
  | {
      version: "otr-core-ttr-input/1";
      status: "UNAVAILABLE";
      reason: CoreTtrUnavailableReason;
    }
  | {
      version: "otr-core-ttr-input/1";
      status: "QUALIFIED";
      input: TtrInput;
      authorityKey: string;
      spatial: {
        equivalence: "UNKNOWN";
        proximityAuthority: "GEOMETRY_ONLY";
        annotations: readonly CoreRow[];
      };
    };
export type CoreTtrScope = { accountId: string; tripId: string; generation: number };
export async function qualifyCoreTtr(
  g: CoreGraph,
  actor: CoreActor,
  orderId: string,
  fromId: string,
  toId: string,
  scope: CoreTtrScope,
  certificate: unknown,
  participating: readonly string[],
  hash: ImportHash,
  actorProjection = false,
): Promise<CoreTtrResult> {
  const fail = (reason: CoreTtrUnavailableReason): CoreTtrResult => ({
    version: "otr-core-ttr-input/1",
    status: "UNAVAILABLE",
    reason,
  });
  if (
    !actor.active ||
    actor.accountId !== scope.accountId ||
    actor.tripId !== scope.tripId
  )
    return fail("ACCESS_UNAVAILABLE");
  if (!actor.personId || !participating.includes(actor.personId))
    return fail("PERSON_BINDING_UNKNOWN");
  const order = g.trip_person_ordinary_orders.find((x) => x.id === orderId);
  if (!order || !coreCanRead(g, actor, "ORDER", order)) return fail("CONTINUITY_UNKNOWN");
  const projected = actorProjection ? order : projectOrdinaryOrder(g, actor, order),
    nodes = projected.nodes as OrdinaryNode[],
    gaps = projected.gaps as OrdinaryGap[];
  const index = nodes.findIndex((n) => n.eventId === fromId),
    from = nodes[index],
    to = nodes[index + 1];
  if (!from || !to || to.eventId !== toId) return fail("CONTINUITY_UNKNOWN");
  const gap = gaps[index];
  if (!gap?.complete || gap.coverage === "UNKNOWN") return fail("CONTINUITY_UNKNOWN");
  if (gap.coverage === "EXPLICIT_TRANSPORT") return fail("EXPLICIT_TRANSPORT");
  const items = [from, to].map((n) =>
    g.itinerary_events.find((x) => x.id === n.eventId)!,
  );
  if (
    items.some(
      (x) =>
        !active(x) || x.hidden_at !== null || !ordinaryApplies(g, x, actor.personId!),
    )
  )
    return fail("UNKNOWN_APPLICABILITY");
  if (items.every((x) => x.experience_family === "P2"))
    return fail("UNSUPPORTED_FLIGHT_CONNECTION");
  const a = endpoint(g, from, "exit"),
    b = endpoint(g, to, "entry");
  if (!a || !b) return fail("MISSING_OPERATIVE_ENDPOINT");
  // Accepted location revisions bind geometry. Raw private evidence is never exposed.
  if (
    [a, b].some(
      (x) =>
        typeof x.row.accepted_latitude !== "number" ||
        typeof x.row.accepted_longitude !== "number" ||
        typeof x.row.location_input_revision !== "number",
    )
  )
    return fail("SPATIAL_UNQUALIFIED");
  if (
    !b.time.local_date ||
    !b.time.zone_id ||
    a.time.local_date !== b.time.local_date ||
    a.time.zone_id !== b.time.zone_id
  )
    return fail("UNKNOWN_DAY_CONTEXT");
  try {
    localCalendarDate("2000-01-01T00:00:00Z", b.time.zone_id);
  } catch {
    return fail("UNKNOWN_DAY_CONTEXT");
  }
  if (
    a.time.instant &&
    b.time.instant &&
    instantMicroseconds(a.time.instant) > instantMicroseconds(b.time.instant)
  )
    return fail("TEMPORAL_CONFLICT");
  const authorityKey = await coreHashValue(
    "otr-core-ttr-authority-v1",
    {
      scope,
      certificate,
      orderRevision: order.revision,
      person: actor.personId,
      branch: order.branch_id,
      from,
      to,
      gap,
      items: items.map((x) => ({ id: x.id, revision: x.semantic_revision })),
      endpoints: [a, b].map((x) => ({
        role: x.role,
        time: x.time,
        place: [
          x.row.accepted_latitude,
          x.row.accepted_longitude,
          x.row.location_input_revision,
        ],
      })),
    } as Json,
    hash,
  );
  const sourceKey = "core-order/1:" + orderId + ":" + order.revision;
  const travellerKey =
    "ordinary/1:" + actor.tripId + ":" + actor.personId + ":" + order.branch_id;
  const occurrence = (node: OrdinaryNode, x: NonNullable<typeof a>, i: number) => ({
    accountId: scope.accountId,
    tripId: scope.tripId,
    travellerKey,
    sourceKey,
    eventId: node.eventId,
    occurrenceToken: coreVisitToken(node.eventId),
    role: x.role,
    semanticRevision: items[i].semantic_revision as number,
    applicable: "YES" as const,
    endpoint: {
      role: x.role,
      qualification: "QUALIFIED" as const,
      coordinates: {
        latitude: x.row.accepted_latitude as number,
        longitude: x.row.accepted_longitude as number,
      },
      provenance:
        "accepted-endpoint/1:" +
        node.eventId +
        ":" +
        x.role +
        ":" +
        x.row.location_input_revision,
      locationInputRevision: x.row.location_input_revision as number,
    },
  });
  const rows = projectCoreDay(g, actor, b.time.local_date, 0);
  const fromRow = rows.find(
    (r) => r.itemRef === fromId && r.rowKey.projectionRole === a.role,
  );
  const toRow = rows.find(
    (r) => r.itemRef === toId && r.rowKey.projectionRole === b.role,
  );
  if (!fromRow || !toRow) return fail("ANCHOR_UNAVAILABLE");
  const view = coreBoundaryView(a.time);
  const input: TtrInput = {
    scope: { ...scope, travellerKey },
    source: { key: sourceKey, complete: true, accessible: true },
    from: occurrence(from, a, 0),
    to: occurrence(to, b, 1),
    continuity: {
      fromToken: coreVisitToken(fromId),
      toToken: coreVisitToken(toId),
      travellerKey,
      provenance: sourceKey,
      proven: true,
      crossDay: false,
    },
    special: "ORDINARY",
    blockAnchorsConfirmed: false,
    period: "UNKNOWN",
    queryTime:
      view.comparable && a.time.instant && a.time.zone_id
        ? {
            kind: "DEPARTURE",
            instant: a.time.instant,
            zone: a.time.zone_id,
            quality: "EXACT",
            precision: a.time.source_instant_precision ?? a.time.clock_precision ?? -1,
            comparable: true,
          }
        : null,
    expiry: { eventDate: b.time.local_date, zone: b.time.zone_id },
    anchors: {
      fromRowKey: JSON.stringify([
        fromId,
        fromRow.rowKey.projectionRole,
        b.time.local_date,
      ]),
      toRowKey: JSON.stringify([toId, toRow.rowKey.projectionRole, b.time.local_date]),
    },
  };
  return {
    version: "otr-core-ttr-input/1",
    status: "QUALIFIED",
    input,
    authorityKey,
    spatial: {
      equivalence: "UNKNOWN",
      proximityAuthority: "GEOMETRY_ONLY",
      annotations: g.trip_endpoint_details.filter(
        (x) =>
          (x.event_id === fromId && x.role === a.role) ||
          (x.event_id === toId && x.role === b.role),
      ),
    },
  };
}
