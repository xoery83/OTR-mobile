import {
  coreCanRead,
  type CoreActor,
  type CoreGraph,
  type CoreRow,
} from "./tripCoreV2Mutation";
import {
  coreBoundaryView,
  corePlaceView,
  closedItemCapabilities,
  type CoreDayRow,
} from "./tripCoreV2Day";
import { coreStoredBoundary } from "./tripCoreV2Temporal";

const select = (row: CoreRow | undefined, fields: readonly string[]) =>
  Object.fromEntries(
    fields.flatMap((key) =>
      row?.[key] === null || row?.[key] === undefined
        ? []
        : [[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), row[key]]],
    ),
  );
const services = (g: CoreGraph, id: string) =>
  g.itinerary_transport_services
    .filter((r) => r.event_id === id)
    .sort((a, b) => String(a.service_key).localeCompare(String(b.service_key)))
    .map((r) =>
      select(r, [
        "service_key",
        "transport_subtype",
        "attribution",
        "operator_namespace",
        "operator_issuer",
        "operator_value",
        "operator_literal",
        "service_number",
        "service_literal",
        "codeshare_operating_key",
      ]),
    );
const place = (
  g: CoreGraph,
  table: "trip_rental_places" | "trip_activity_entry_places",
  id: string,
  role: string,
) => {
  const row = g[table].find((r) => r.event_id === id && r.role === role);
  return row ? corePlaceView(row) : undefined;
};
export type CoreSupplementalAuthority = {
  // Supplied by the owning authenticated reader; omitted rights fail closed.
  originalDocumentIds?: readonly string[];
  ledgerExpenseIds?: readonly string[];
  rosterHash?: string;
};
export function projectCoreItem(
  g: CoreGraph,
  actor: CoreActor,
  itemId: string,
  authority: CoreSupplementalAuthority = {},
  localState: "ACCEPTED" | "PENDING" | "CONFLICT" = "ACCEPTED",
) {
  const item = g.itinerary_events.find((r) => r.id === itemId);
  if (!item || !coreCanRead(g, actor, "ITEM", item)) return null;
  const family = String(item.experience_family);
  const endpoint = (role: string) => {
    const row = g.itinerary_transport_endpoints.find(
      (r) => r.event_id === itemId && r.role === role,
    );
    if (!row) return undefined;
    const annotation = g.trip_endpoint_details.find(
      (r) => r.event_id === itemId && r.role === role,
    );
    return {
      role,
      time: coreBoundaryView(coreStoredBoundary(row)),
      ...(corePlaceView(row) ? { place: corePlaceView(row) } : {}),
      ...select(annotation, ["airport_code", "terminal", "platform", "pier"]),
    };
  };
  const schedule =
    item.temporal_shape === "TRANSPORT"
      ? {
          shape: item.temporal_shape,
          origin: endpoint("ORIGIN"),
          destination: endpoint("DESTINATION"),
        }
      : {
          shape: item.temporal_shape,
          ...(item.start_local_date
            ? { start: coreBoundaryView(coreStoredBoundary(item, "start")) }
            : {}),
          ...(item.end_local_date
            ? { end: coreBoundaryView(coreStoredBoundary(item, "end")) }
            : {}),
        };
  const documents = (ids: unknown[]) =>
    g.trip_operational_documents
      .filter((r) => ids.includes(r.id) && coreCanRead(g, actor, "DOCUMENT", r))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((r) => ({
        id: r.id,
        contentVersion: r.content_version,
        title: r.title,
        mediaType: r.media_type,
        sha256: r.sha256,
        byteSize: r.byte_size,
        canOpenOriginal: authority.originalDocumentIds?.includes(r.id as string) ?? false,
      }));
  const documentSummaries = documents(
    g.trip_item_document_links
      .filter((r) => r.item_id === itemId && r.active)
      .map((r) => r.document_id),
  );
  const money = (r: CoreRow, prefix: string) =>
    r[prefix + "_minor"] === null
      ? undefined
      : {
          minor: r[prefix + "_minor"],
          currency: r[prefix + "_currency"],
          scale: r[prefix + "_scale"],
        };
  const bookingIds = g.trip_booking_item_links
    .filter((r) => r.item_id === itemId && r.active)
    .map((r) => r.booking_id);
  const bookingSummaries = g.itinerary_reservations
    .filter((r) => bookingIds.includes(r.id) && coreCanRead(g, actor, "BOOKING", r))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((r) => ({
      id: r.id,
      revision: r.revision,
      title: r.title,
      commercialStatus: r.commercial_status,
      ...select(r, ["provider", "confirmation_code"]),
      ...(money(r, "price") ? { price: money(r, "price") } : {}),
      ...(money(r, "due") ? { due: money(r, "due") } : {}),
    }));
  const entitlementSummaries = g.trip_entitlement_item_links
    .filter((e) => e.item_id === itemId && e.active)
    .flatMap((edge) => {
      const r = g.trip_entitlements.find((r) => r.id === edge.entitlement_id);
      if (!r || !coreCanRead(g, actor, "ENTITLEMENT", r)) return [];
      const docs = documents(
        g.trip_entitlement_document_links
          .filter((e) => e.entitlement_id === r.id && e.active)
          .map((e) => e.document_id),
      );
      const originals = docs.filter((d) => d.canOpenOriginal);
      const ticketAccess =
        r.access_class === "STATIC_ORIGINAL"
          ? {
              class: "STATIC_ORIGINAL",
              documents: originals.map((d) => ({
                id: d.id,
                contentVersion: d.contentVersion,
                sha256: d.sha256,
                deviceReadiness: "ABSENT",
              })),
              canRequestDownload: originals.length > 0,
              canOpenOriginal: false,
            }
          : r.access_class === "EXTERNAL_DYNAMIC"
            ? {
                class: "EXTERNAL_DYNAMIC",
                ...select(r, ["provider_url"]),
                offlineExecutable: false,
              }
            : r.access_class === "CONFIRMATION_ONLY"
              ? { class: "CONFIRMATION_ONLY", canOpenConfirmation: originals.length > 0 }
              : r.access_class === "APPLE_WALLET"
                ? {
                    class: "APPLE_WALLET",
                    canOpenOriginalPass: originals.some(
                      (d) => d.mediaType === "application/vnd.apple.pkpass",
                    ),
                    devicePassCapability: false,
                  }
                : { class: "UNKNOWN", canOpenOriginal: false };
      const validity = select(r, [
        "valid_from_date",
        "valid_until_date",
        "valid_from_instant",
        "valid_until_instant",
        "validity_zone_id",
        "validity_precision",
      ]);
      return [
        {
          id: r.id,
          revision: r.revision,
          kind: r.kind,
          title: r.title,
          status: r.status,
          accessClass: r.access_class,
          ...select(r, ["issuer", "quantity"]),
          ...select(edge, [
            "seat",
            "coach",
            "section",
            "cabin",
            "fare_class",
            "baggage_allowance",
          ]),
          ...(Object.keys(validity).length ? { validity } : {}),
          ticketAccess,
        },
      ];
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  let details: Record<string, unknown>;
  if (family === "P2") {
    const intent = g.trip_flight_intents.find((r) => r.event_id === itemId)!;
    details = {
      qualification: intent.qualification,
      flightNumberLiteral: intent.flight_number_literal,
      services: services(g, itemId),
    };
  } else if (family === "P3") {
    const row = g.trip_stay_details.find((r) => r.event_id === itemId);
    details = {
      ...select(row, [
        "property_name",
        "permitted_checkin_from",
        "permitted_checkin_until",
        "permitted_checkout_by",
      ]),
      rooms: g.trip_stay_rooms
        .filter((r) => r.event_id === itemId)
        .sort((a, b) => String(a.room_id).localeCompare(String(b.room_id)))
        .map((r) => select(r, ["room_id", "category", "quantity", "capacity"])),
      nights:
        (Date.parse(String(item.end_local_date) + "T00:00:00Z") -
          Date.parse(String(item.start_local_date) + "T00:00:00Z")) /
        86400000,
    };
  } else if (family === "P4") {
    const row = g.trip_rental_details.find((r) => r.event_id === itemId),
      pickup = place(g, "trip_rental_places", itemId, "PICKUP"),
      back = place(g, "trip_rental_places", itemId, "RETURN");
    details = {
      ...select(row, [
        "supplier",
        "reserved_category",
        "or_similar",
        "actual_vehicle_model",
        "verified_plate",
      ]),
      ...(pickup ? { pickupPlace: pickup } : {}),
      ...(back ? { returnPlace: back } : {}),
    };
  } else if (family === "P5")
    details = {
      service: services(g, itemId)[0],
      operationalFacts: g.trip_transport_operational_facts
        .filter((r) => r.event_id === itemId)
        .sort((a, b) => String(a.role).localeCompare(String(b.role)))
        .map((r) => ({
          role: r.role,
          time: coreBoundaryView(coreStoredBoundary(r)),
          ...(corePlaceView(r) ? { place: corePlaceView(r) } : {}),
        })),
    };
  else if (family === "P6") {
    const entry = place(g, "trip_activity_entry_places", itemId, "ENTRY");
    details = {
      ...select(
        g.trip_activity_details.find((r) => r.event_id === itemId),
        ["session_label", "admission_note"],
      ),
      ...(entry ? { entryPlace: entry } : {}),
    };
  } else details = select(item, ["activity_category"]); // The root's category maps to the P1 view field below.
  if (family === "P1" && Object.hasOwn(details, "activityCategory"))
    details = { category: details.activityCategory };
  const visibleInstructions = g.trip_instruction_entries.filter(
    (r) => r.event_id === itemId && coreCanRead(g, actor, "INSTRUCTION", r),
  );
  const instructionShortcuts = visibleInstructions
    .filter((r) => !visibleInstructions.some((n) => n.supersedes_id === r.id))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((r) => ({
      entryId: r.id,
      section: r.section,
      sensitivity: r.sensitivity,
      hasCurrentEntry: true,
    }));
  return {
    itemId,
    tripId: actor.tripId,
    itemRevision: item.semantic_revision,
    family,
    title: item.title,
    status: item.status,
    hidden: item.hidden_at !== null,
    localState,
    participation: {
      mode: item.participation_mode,
      personIds: g.trip_item_participants
        .filter((r) => r.item_id === itemId && r.active)
        .map((r) => r.person_id)
        .sort(),
      ...(item.self_person_id ? { selfPersonId: item.self_person_id } : {}),
      ...(authority.rosterHash ? { rosterHash: authority.rosterHash } : {}),
    },
    schedule,
    ...(corePlaceView(item) ? { place: corePlaceView(item) } : {}),
    details,
    bookingSummaries,
    entitlementSummaries,
    documentSummaries,
    instructionShortcuts,
    expenseLinkIds: g.expense_links
      .filter(
        (r) =>
          r.type === "ITINERARY_EVENT" &&
          r.target_id === itemId &&
          authority.ledgerExpenseIds?.includes(r.expense_id as string),
      )
      .map((r) => r.id)
      .sort(),
    capabilities: closedItemCapabilities,
  };
}
export function coreOccurrenceRef(
  item: NonNullable<ReturnType<typeof projectCoreItem>>,
  dayRows: CoreDayRow[],
) {
  const schedule = item.schedule as Record<string, any>;
  return {
    tripId: item.tripId,
    itemId: item.itemId,
    itemRevision: item.itemRevision,
    visibleParticipation: item.participation,
    boundaries: [
      schedule.start,
      schedule.end,
      schedule.origin?.time,
      schedule.destination?.time,
    ].filter(Boolean),
    places: [item.place, schedule.origin?.place, schedule.destination?.place].filter(
      Boolean,
    ),
    dayRowKeys: dayRows.filter((r) => r.itemRef === item.itemId).map((r) => r.rowKey),
  };
}
