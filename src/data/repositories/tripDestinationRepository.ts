import type * as SQLite from "expo-sqlite";
import {
  parseLocalTripDestinations,
  manualDestinationClaim,
  type LocalTripDestination,
  type LocalTripDestinationInput,
} from "@/domain/trip/localTripDestination";

import {
  localTripDestinationsReceiptSchema,
  type LocalTripDestinationsChange,
} from "@/domain/trip/localTripDestinationUpdate";

type Database = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "runAsync">;
type Row = {
  trip_id: string;
  created_at: string;
  updated_at: string;
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
  if (!newlyCreated) {
    await verifyDestinationHistory(
      database,
      accountId,
      tripId,
      existing.map(({ ordinal: _ordinal, ...item }) => item),
      items,
    );
    return existing;
  }
  if (items === undefined) return existing;
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

// Validate the retained local history before replay or another mutation. The original
// Create request can additionally anchor its initial list without rewriting current Tags.
async function verifyDestinationHistory(
  database: Database,
  accountId: string,
  tripId: string,
  current: readonly LocalTripDestinationInput[],
  initial?: readonly LocalTripDestinationInput[],
) {
  const history = await database.getAllAsync<{
    id: string;
    trip_id: string;
    entity_id: string;
    entity_type: string;
    idempotency_key: string;
    status: string;
    payload_json: string;
  }>(
    "SELECT * FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND operation_type='TRIP_DESTINATIONS_LOCAL_SAVE' ORDER BY rowid",
    accountId,
    tripId,
  );
  let expected = initial === undefined ? undefined : parseLocalTripDestinations(initial);
  for (const row of history) {
    const receipt = localTripDestinationsReceiptSchema.parse(
      JSON.parse(row.payload_json),
    );
    expected ??= receipt.destinations.before;
    if (
      row.entity_type !== "TRIP_LOCAL_PREFERENCE" ||
      row.status !== "COMPLETED" ||
      row.id !== row.idempotency_key ||
      row.entity_id !== tripId ||
      row.trip_id !== tripId ||
      receipt.metadata.tripId !== tripId ||
      receipt.destinations.operationId !== row.id ||
      JSON.stringify(receipt.destinations.before) !== JSON.stringify(expected)
    )
      throw new Error("TRIP_DESTINATIONS_REPLAY_MISMATCH");
    expected = receipt.destinations.after;
  }
  if (expected !== undefined && JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error("TRIP_DESTINATIONS_REPLAY_MISMATCH");
}

export async function verifyLocalTripDestinationHistory(
  database: Database,
  accountId: string,
  tripId: string,
) {
  const current =
    (await readLocalTripDestinations(database, accountId, tripId)).get(tripId) ?? [];
  await verifyDestinationHistory(
    database,
    accountId,
    tripId,
    current.map(({ ordinal: _ordinal, ...item }) => item),
  );
}

// Caller owns the account gate and transaction, including the protected local receipt.
export async function replaceLocalTripDestinations(
  database: Database,
  accountId: string,
  tripId: string,
  change: LocalTripDestinationsChange,
  now: string,
) {
  const existing =
    (await readLocalTripDestinations(database, accountId, tripId)).get(tripId) ?? [];
  const before = existing.map(({ ordinal: _ordinal, ...item }) => item);
  await verifyDestinationHistory(database, accountId, tripId, before);
  if (JSON.stringify(before) !== JSON.stringify(change.before))
    throw new Error("TRIP_DESTINATIONS_LOCAL_CONFLICT");
  const timestamps = await database.getAllAsync<Row>(
    "SELECT * FROM local_trip_destinations WHERE account_id=? AND trip_id=?",
    accountId,
    tripId,
  );
  const retained = new Map(existing.map((item) => [item.destinationId, item]));
  for (const item of change.after) {
    const previous = retained.get(item.destinationId);
    if (
      previous &&
      (previous.source !== item.source ||
        (previous.source === "APPLE_PLACE_ID" &&
          item.source === "APPLE_PLACE_ID" &&
          previous.providerPlaceId !== item.providerPlaceId))
    )
      throw new Error("TRIP_DESTINATIONS_IDENTITY_MISMATCH");
  }
  await database.runAsync(
    "DELETE FROM local_trip_destinations WHERE account_id=? AND trip_id=?",
    accountId,
    tripId,
  );
  for (const [ordinal, item] of change.after.entries()) {
    const previous = timestamps.find((row) => row.destination_id === item.destinationId);
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
      previous?.created_at ?? now,
      now,
    );
  }
}
