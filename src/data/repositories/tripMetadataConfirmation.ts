import type * as SQLite from "expo-sqlite";
import {
  structuredTripMetadataSnapshotSchema,
  structuredTripMetadataReceiptSchema,
  type StructuredTripMetadata,
} from "@/domain/trip/tripStructuredDestinationContract";
import { structuredTripCreateResultSchema } from "@/domain/trip/tripCreateWireContract";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
type Database = Pick<SQLite.SQLiteDatabase, "getFirstAsync" | "runAsync">;
const json = (v: unknown) => canonicalCoreJson(v as Json);
type Kind = "CREATE_RECEIPT" | "METADATA_RECEIPT" | "SNAPSHOT";
export async function retainTripMetadataConfirmation(
  database: Database,
  accountId: string,
  operationId: string,
  kind: Kind,
  proof: unknown,
) {
  const snapshot =
    kind === "CREATE_RECEIPT"
      ? (() => {
          const r = structuredTripCreateResultSchema.parse(proof);
          return {
            formatVersion: 3 as const,
            actorAccountId: r.actorAccountId,
            tripId: r.tripId,
            metadataRevision: r.metadataRevision,
            metadata: {
              name: r.name,
              destination: r.destination,
              startDate: r.startDate,
              endDate: r.endDate,
              destinations: r.destinations,
            },
          };
        })()
      : kind === "METADATA_RECEIPT"
        ? (() => {
            const r = structuredTripMetadataReceiptSchema.parse(proof);
            return {
              formatVersion: 3 as const,
              actorAccountId: r.actorAccountId,
              tripId: r.tripId,
              metadataRevision: r.resultMetadataRevision,
              metadata: r.after,
            };
          })()
        : structuredTripMetadataSnapshotSchema.parse(proof);
  if (
    snapshot.actorAccountId !== accountId ||
    (kind !== "SNAPSHOT" &&
      (proof as { operationId: string }).operationId !== operationId)
  )
    throw Error("TRIP_METADATA_CONFIRMATION_SCOPE_MISMATCH");
  const prior = await database.getFirstAsync<{ trip_id: string; proof_json: string }>(
    "SELECT trip_id,proof_json FROM local_trip_metadata_confirmations WHERE account_id=? AND operation_id=? AND source_kind=?",
    accountId,
    operationId,
    kind,
  );
  if (prior) {
    if (prior.trip_id !== snapshot.tripId || prior.proof_json !== json(proof))
      throw Error("TRIP_METADATA_IMMUTABLE_CONFIRMATION_MISMATCH");
    return;
  }
  const sameRevision = await database.getFirstAsync<{ metadata_json: string }>(
    "SELECT metadata_json FROM local_trip_metadata_confirmations WHERE account_id=? AND trip_id=? AND metadata_revision=? LIMIT 1",
    accountId,
    snapshot.tripId,
    snapshot.metadataRevision,
  );
  if (sameRevision && sameRevision.metadata_json !== json(snapshot.metadata))
    throw Error("TRIP_METADATA_CONFIRMATION_REVISION_MISMATCH");
  await database.runAsync(
    "INSERT INTO local_trip_metadata_confirmations(account_id,trip_id,operation_id,source_kind,metadata_revision,metadata_json,proof_json) VALUES(?,?,?,?,?,?,?)",
    accountId,
    snapshot.tripId,
    operationId,
    kind,
    snapshot.metadataRevision,
    json(snapshot.metadata),
    json(proof),
  );
}
export async function readTripMetadataConfirmation(
  database: Database,
  accountId: string,
  tripId: string,
) {
  const row = await database.getFirstAsync<{
    operation_id: string;
    source_kind: Kind;
    metadata_revision: number;
    metadata_json: string;
    proof_json: string;
  }>(
    "SELECT operation_id,source_kind,metadata_revision,metadata_json,proof_json FROM local_trip_metadata_confirmations WHERE account_id=? AND trip_id=? ORDER BY metadata_revision DESC LIMIT 1",
    accountId,
    tripId,
  );
  if (!row) return null;
  const proof = JSON.parse(row.proof_json);
  let metadata: StructuredTripMetadata;
  let revision: number;
  let actor: string;
  let trip: string;
  if (row.source_kind === "CREATE_RECEIPT") {
    const r = structuredTripCreateResultSchema.parse(proof);
    metadata = {
      name: r.name,
      destination: null,
      startDate: r.startDate,
      endDate: r.endDate,
      destinations: r.destinations,
    };
    revision = r.metadataRevision;
    actor = r.actorAccountId;
    trip = r.tripId;
    if (r.operationId !== row.operation_id)
      throw Error("TRIP_METADATA_CONFIRMATION_INVALID");
  } else if (row.source_kind === "METADATA_RECEIPT") {
    const r = structuredTripMetadataReceiptSchema.parse(proof);
    metadata = r.after;
    revision = r.resultMetadataRevision;
    actor = r.actorAccountId;
    trip = r.tripId;
    if (r.operationId !== row.operation_id)
      throw Error("TRIP_METADATA_CONFIRMATION_INVALID");
  } else {
    const r = structuredTripMetadataSnapshotSchema.parse(proof);
    metadata = r.metadata;
    revision = r.metadataRevision;
    actor = r.actorAccountId;
    trip = r.tripId;
  }
  if (
    actor !== accountId ||
    trip !== tripId ||
    revision !== row.metadata_revision ||
    json(metadata) !== row.metadata_json
  )
    throw Error("TRIP_METADATA_CONFIRMATION_INVALID");
  return structuredTripMetadataSnapshotSchema.parse({
    formatVersion: 3,
    actorAccountId: actor,
    tripId,
    metadataRevision: revision,
    metadata,
  });
}
