import type * as SQLite from "expo-sqlite";
import {
  parseLocalTripDestinations,
  manualDestinationClaim,
  type LocalTripDestination,
  type LocalTripDestinationInput,
} from "@/domain/trip/localTripDestination";

type Database = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "runAsync">;
type Row = {
  trip_id: string;
  destination_id: string;
  ordinal: number;
  source_kind: string;
  display_label: string;
  manual_claim: string | null;
  provider: string | null;
  provider_place_id: string | null;
};
export async function readLocalTripDestinations(
  database: Database,
  accountId: string,
  tripId?: string,
): Promise<Map<string, readonly LocalTripDestination[]>> {
  const rows = await database.getAllAsync<Row>(
    "SELECT * FROM local_trip_destinations WHERE account_id=?" +
      (tripId ? " AND trip_id=?" : "") +
      " ORDER BY trip_id,ordinal",
    ...(tripId ? [accountId, tripId] : [accountId]),
  );
  const grouped = new Map<string, LocalTripDestination[]>();
  for (const row of rows) {
    const input =
      row.source_kind === "MANUAL"
        ? {
            destinationId: row.destination_id,
            displayLabel: row.display_label,
            source: row.source_kind,
          }
        : {
            destinationId: row.destination_id,
            displayLabel: row.display_label,
            source: row.source_kind,
            provider: row.provider,
            providerPlaceId: row.provider_place_id,
          };
    const [item] = parseLocalTripDestinations([input]);
    if (
      (item.source === "MANUAL" &&
        (row.manual_claim !== manualDestinationClaim(item.displayLabel) ||
          row.provider !== null ||
          row.provider_place_id !== null)) ||
      (item.source === "APPLE_PLACE_ID" && row.manual_claim !== null)
    )
      throw new Error("TRIP_DESTINATIONS_STORED_INVALID");
    const list = grouped.get(row.trip_id) ?? [];
    if (row.ordinal !== list.length) throw new Error("TRIP_DESTINATIONS_STORED_INVALID");
    list.push({ ...item, ordinal: row.ordinal });
    grouped.set(row.trip_id, list);
  }
  for (const list of grouped.values())
    parseLocalTripDestinations(list.map(({ ordinal: _ordinal, ...item }) => item));
  return grouped;
}
export async function initializeLocalTripDestinations(
  database: Database,
  accountId: string,
  tripId: string,
  items: readonly LocalTripDestinationInput[] | undefined,
  newlyCreated: boolean,
  now: string,
) {
  const existing =
    (await readLocalTripDestinations(database, accountId, tripId)).get(tripId) ?? [];
  if (items === undefined) return existing;
  if (!newlyCreated) {
    if (
      JSON.stringify(existing.map(({ ordinal: _ordinal, ...item }) => item)) !==
      JSON.stringify(items)
    )
      throw new Error("TRIP_DESTINATIONS_REPLAY_MISMATCH");
    return existing;
  }
  for (const [ordinal, item] of items.entries())
    await database.runAsync(
      "INSERT INTO local_trip_destinations(account_id,trip_id,destination_id,ordinal,source_kind,display_label,manual_claim,provider,provider_place_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      accountId,
      tripId,
      item.destinationId,
      ordinal,
      item.source,
      item.displayLabel,
      item.source === "MANUAL" ? manualDestinationClaim(item.displayLabel) : null,
      item.source === "MANUAL" ? null : item.provider,
      item.source === "MANUAL" ? null : item.providerPlaceId,
      now,
      now,
    );
  return (await readLocalTripDestinations(database, accountId, tripId)).get(tripId) ?? [];
}
