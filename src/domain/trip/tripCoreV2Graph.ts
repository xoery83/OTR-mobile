import { coreTableSchemas, coreKindTables, type CoreTable } from "./tripCoreV2";
import type { CoreGraph, CoreRow } from "./tripCoreV2Mutation";
import { canonicalCoreJson, type Json } from "./tripCoreV2Json";
export const coreTableKeys: Record<CoreTable, readonly string[]> = {
  itinerary_events: ["id"],
  itinerary_transport_endpoints: ["event_id", "role"],
  trip_endpoint_details: ["event_id", "role"],
  trip_flight_intents: ["event_id"],
  itinerary_transport_services: ["event_id", "service_key"],
  trip_stay_details: ["event_id"],
  trip_stay_rooms: ["event_id", "room_id"],
  trip_rental_details: ["event_id"],
  trip_rental_places: ["event_id", "role"],
  trip_activity_details: ["event_id"],
  trip_activity_entry_places: ["event_id", "role"],
  trip_transport_operational_facts: ["event_id", "role"],
  itinerary_reservations: ["id"],
  trip_booking_observations: ["observation_id"],
  trip_entitlements: ["id"],
  trip_operational_documents: ["id"],
  trip_instruction_entries: ["id"],
  trip_booking_item_links: ["booking_id", "item_id"],
  trip_entitlement_item_links: ["entitlement_id", "item_id"],
  trip_booking_entitlement_links: ["booking_id", "entitlement_id"],
  trip_booking_document_links: ["booking_id", "document_id"],
  trip_entitlement_document_links: ["entitlement_id", "document_id"],
  trip_item_document_links: ["item_id", "document_id"],
  trip_item_participants: ["item_id", "person_id"],
  trip_entitlement_holders: ["entitlement_id", "person_id"],
  trip_item_visibility_people: ["item_id", "person_id"],
  trip_booking_visibility_people: ["booking_id", "person_id"],
  trip_entitlement_visibility_people: ["entitlement_id", "person_id"],
  trip_document_visibility_people: ["document_id", "person_id"],
  trip_instruction_visibility_people: ["instruction_id", "person_id"],
  expense_links: ["id"],
};
export function coreMirrorKey(table: CoreTable, row: CoreRow): string {
  return canonicalCoreJson(coreTableKeys[table].map((key) => row[key]) as Json);
}
const foreignRoots = {
  event_id: "ITEM",
  item_id: "ITEM",
  booking_id: "BOOKING",
  entitlement_id: "ENTITLEMENT",
  document_id: "DOCUMENT",
  instruction_id: "INSTRUCTION",
} as const;
export function validateCoreGraph(graph: CoreGraph, tripId: string): CoreGraph {
  for (const [table, schema] of Object.entries(coreTableSchemas)) {
    const seen = new Set<string>();
    for (const row of graph[table as CoreTable]) {
      schema.parse(row);
      if ((table === "expense_links" ? row.journey_id : row.trip_id) !== tripId)
        throw new Error("CROSS_TRIP_REFERENCE");
      const key = coreMirrorKey(table as CoreTable, row);
      if (seen.has(key)) throw new Error("DUPLICATE_CORE_ROW");
      seen.add(key);
      for (const [field, kind] of Object.entries(foreignRoots)) {
        if (
          row[field] !== undefined &&
          !graph[coreKindTables[kind]].some((parent) => parent.id === row[field])
        )
          throw new Error("ORPHAN_CORE_ROW");
      }
      if (
        table === "trip_instruction_entries" &&
        row.supersedes_id !== null &&
        !graph.trip_instruction_entries.some(
          (old) =>
            old.id === row.supersedes_id &&
            old.event_id === row.event_id &&
            old.section === row.section &&
            old.source_representation_id === row.source_representation_id,
        )
      )
        throw new Error("INVALID_CORRECTION_CHAIN");
    }
  }
  return graph;
}
