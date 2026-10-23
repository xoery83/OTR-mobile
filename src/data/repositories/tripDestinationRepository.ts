import { retainedDeferredTripMetadataSchema } from "@/domain/trip/tripDeferredMetadata";
import { readTripMetadataConfirmation } from "./tripMetadataConfirmation";
import {
  structuredTripMetadataReceiptSchema,
  structuredTripMetadataUpdateSchema,
} from "@/domain/trip/tripStructuredDestinationContract";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
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

type Database = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;
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
    operation_type: string;
  }>(
    "SELECT * FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND (operation_type IN ('TRIP_DESTINATIONS_LOCAL_SAVE','TRIP_METADATA_DEFERRED') OR (operation_type='UPDATE_TRIP_METADATA' AND json_extract(payload_json,'$.formatVersion')=3)) ORDER BY rowid",
    accountId,
    tripId,
  );
  const confirmed = await readTripMetadataConfirmation(database, accountId, tripId);
  let expected =
    confirmed?.metadata.destinations ??
    (initial === undefined ? undefined : parseLocalTripDestinations(initial));
  if (confirmed && initial !== undefined) {
    const original = await database.getFirstAsync<{ metadata_json: string }>(
      "SELECT metadata_json FROM local_trip_metadata_confirmations WHERE account_id=? AND trip_id=? AND source_kind='CREATE_RECEIPT'",
      accountId,
      tripId,
    );
    if (
      !original ||
      canonicalCoreJson(JSON.parse(original.metadata_json).destinations as Json) !==
        canonicalCoreJson(initial as unknown as Json)
    )
      throw Error("TRIP_DESTINATIONS_REPLAY_MISMATCH");
  }
  for (const row of history) {
    if (row.operation_type === "TRIP_METADATA_DEFERRED") {
      const action = retainedDeferredTripMetadataSchema.parse(
        JSON.parse(row.payload_json),
      );
      if (
        action.actionId !== row.id ||
        action.tripId !== tripId ||
        row.entity_type !== "TRIP_LOCAL_ACTION" ||
        row.idempotency_key !== row.id ||
        row.entity_id !== tripId ||
        !["DEPENDENCY_BLOCKED", "COMPLETED"].includes(row.status)
      )
        throw Error("TRIP_DESTINATIONS_REPLAY_MISMATCH");
      const wire = await database.getFirstAsync<{ status: string }>(
        "SELECT status FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND id=? AND operation_type='UPDATE_TRIP_METADATA'",
        accountId,
        tripId,
        action.operationId,
      );
      if (wire?.status === "COMPLETED" && confirmed) continue;
      expected ??= action.before.destinations;
      if (JSON.stringify(expected) !== JSON.stringify(action.before.destinations))
        throw Error("TRIP_DESTINATIONS_REPLAY_MISMATCH");
      expected = action.after.destinations;
      continue;
    }
    if (row.operation_type === "UPDATE_TRIP_METADATA") {
      const request = structuredTripMetadataUpdateSchema.parse(
        JSON.parse(row.payload_json),
      );
      if (row.status === "COMPLETED" && confirmed) {
        const stored = await database.getFirstAsync<{ proof_json: string }>(
          "SELECT proof_json FROM local_trip_metadata_confirmations WHERE account_id=? AND operation_id=? AND source_kind='METADATA_RECEIPT'",
          accountId,
          row.id,
        );
        if (!stored) throw Error("TRIP_DESTINATIONS_CONFIRMED_RECEIPT_REQUIRED");
        const receipt = structuredTripMetadataReceiptSchema.parse(
          JSON.parse(stored.proof_json),
        );
        const { actorAccountId, resultMetadataRevision, ...accepted } = receipt;
        if (
          actorAccountId !== accountId ||
          resultMetadataRevision > confirmed.metadataRevision ||
          canonicalCoreJson(accepted as Json) !== canonicalCoreJson(request as Json)
        )
          throw Error("TRIP_DESTINATIONS_REPLAY_MISMATCH");
        continue;
      }
      if (
        row.entity_type !== "TRIP" ||
        row.id !== row.idempotency_key ||
        row.entity_id !== tripId ||
        row.trip_id !== tripId ||
        request.tripId !== tripId ||
        request.operationId !== row.id
      )
        throw Error("TRIP_DESTINATIONS_REPLAY_MISMATCH");
      const deferred = history.find(
        (action) =>
          action.operation_type === "TRIP_METADATA_DEFERRED" &&
          retainedDeferredTripMetadataSchema.parse(JSON.parse(action.payload_json))
            .operationId === row.id,
      );
      if (deferred) {
        const action = retainedDeferredTripMetadataSchema.parse(
          JSON.parse(deferred.payload_json),
        );
        if (
          canonicalCoreJson(action.before as Json) !==
            canonicalCoreJson(request.before as Json) ||
          canonicalCoreJson(action.after as Json) !==
            canonicalCoreJson(request.after as Json)
        )
          throw Error("TRIP_DESTINATIONS_REPLAY_MISMATCH");
        continue;
      }
      expected ??= request.before.destinations;
      if (
        row.entity_type !== "TRIP" ||
        row.id !== row.idempotency_key ||
        row.entity_id !== tripId ||
        row.trip_id !== tripId ||
        request.tripId !== tripId ||
        request.operationId !== row.id ||
        JSON.stringify(request.before.destinations) !== JSON.stringify(expected)
      )
        throw new Error("TRIP_DESTINATIONS_REPLAY_MISMATCH");
      expected = request.after.destinations;
      continue;
    }
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
  await writeDestinationRows(database, accountId, tripId, change.after, now);
}
// Only the owning confirmed snapshot apply calls this after no-dirty/revision/account checks.
export async function applyConfirmedTripDestinationRows(
  database: Database,
  accountId: string,
  tripId: string,
  items: readonly LocalTripDestinationInput[],
  now: string,
) {
  await writeDestinationRows(
    database,
    accountId,
    tripId,
    parseLocalTripDestinations(items),
    now,
  );
}
async function writeDestinationRows(
  database: Database,
  accountId: string,
  tripId: string,
  items: readonly LocalTripDestinationInput[],
  now: string,
) {
  const timestamps = await database.getAllAsync<Row>(
    "SELECT * FROM local_trip_destinations WHERE account_id=? AND trip_id=?",
    accountId,
    tripId,
  );
  await database.runAsync(
    "DELETE FROM local_trip_destinations WHERE account_id=? AND trip_id=?",
    accountId,
    tripId,
  );
  for (const [ordinal, item] of items.entries()) {
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
