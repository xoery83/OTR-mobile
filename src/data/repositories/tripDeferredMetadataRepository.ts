import type * as SQLite from "expo-sqlite";
import {
  isTripCoverAssetId,
  parseTripPhotoCoverRef,
} from "@/domain/trip/tripCoverAssets";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import {
  structuredTripCreateRequestSchema,
  structuredTripMetadataSchema,
  structuredTripMetadataUpdateSchema,
} from "@/domain/trip/tripStructuredDestinationContract";
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
import {
  captureAccountScope,
  assertAccountRequestContext,
  withAccountApplyGate,
} from "../auth/accountRequestContext";
import {
  readLocalTripDestinations,
  replaceLocalTripDestinations,
} from "./tripDestinationRepository";
import { readTripMetadataConfirmation } from "./tripMetadataConfirmation";

import {
  deferredTripMetadataSchema,
  retainedDeferredTripMetadataSchema,
  type DeferredTripMetadata,
} from "@/domain/trip/tripDeferredMetadata";
export {
  deferredTripMetadataSchema,
  type DeferredTripMetadata,
} from "@/domain/trip/tripDeferredMetadata";

const json = (value: unknown) => canonicalCoreJson(value as Json);
type Database = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
type Operation = {
  id: string;
  payload_json: string;
  status: string;
  dependency_operation_id: string | null;
  entity_type: string;
  operation_type: string;
  trip_id: string;
  entity_id: string;
  idempotency_key: string;
};

// Local authored actions share the durable outbox but are never transport requests.
export function createTripDeferredMetadataRepository(
  database: Database,
  account: () => Promise<string>,
  clock: () => string,
) {
  async function localBase(accountId: string, tripId: string) {
    const row = await database.getFirstAsync<{
      name: string;
      start_date: string | null;
      end_date: string | null;
      create_operation_id: string;
      payload_json: string;
    }>(
      `SELECT trip.*,op.payload_json FROM local_trip_containers trip JOIN sync_operations op
       ON op.id=trip.create_operation_id AND op.owner_user_id=trip.account_id AND op.trip_id=trip.id AND op.entity_id=trip.id AND op.idempotency_key=op.id
       WHERE trip.account_id=? AND trip.id=? AND op.entity_type='TRIP' AND op.operation_type='CREATE_TRIP'`,
      accountId,
      tripId,
    );
    if (!row) throw Error("TRIP_METADATA_LOCAL_CREATOR_REQUIRED");
    const original = structuredTripCreateRequestSchema.parse({
      ...JSON.parse(row.payload_json),
      operationId: row.create_operation_id,
    });
    if (original.tripId !== tripId) throw Error("TRIP_CREATE_LOCAL_MISMATCH");
    const destinations =
      (await readLocalTripDestinations(database, accountId, tripId)).get(tripId) ?? [];
    return {
      createOperationId: row.create_operation_id,
      metadata: structuredTripMetadataSchema.parse({
        name: row.name,
        destination: null,
        startDate: row.start_date,
        endDate: row.end_date,
        destinations: destinations.map(({ ordinal: _ordinal, ...item }) => item),
      }),
    };
  }
  return {
    async readDeferredMetadataEditBase(tripId: string) {
      coreUuid.parse(tripId);
      const scope = await captureAccountScope(account);
      const base = await localBase(scope.accountId, tripId);
      await assertAccountRequestContext(scope, account);
      return base;
    },
    async deferMetadataUpdate(input: DeferredTripMetadata) {
      const action = deferredTripMetadataSchema.parse(input);
      if (
        action.cover &&
        ((action.cover.before !== null &&
          !/^[a-z0-9_-]{1,64}$/.test(action.cover.before)) ||
          (action.cover.after !== null &&
            !isTripCoverAssetId(action.cover.after) &&
            !parseTripPhotoCoverRef(action.cover.after)))
      )
        throw Error("TRIP_COVER_INVALID");
      const photoRepository = action.cover
        ? await import("./tripPhotoRepository")
        : undefined;
      const scope = await captureAccountScope(account);
      let coverChanged = false;
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(scope, account);
          const prior = await database.getFirstAsync<Operation>(
            "SELECT * FROM sync_operations WHERE id=? AND owner_user_id=?",
            action.actionId,
            scope.accountId,
          );
          if (prior) {
            if (
              prior.operation_type !== "TRIP_METADATA_DEFERRED" ||
              prior.entity_type !== "TRIP_LOCAL_ACTION" ||
              prior.trip_id !== action.tripId ||
              prior.entity_id !== action.tripId ||
              prior.idempotency_key !== action.actionId ||
              json(
                (({ dependencyOperationId: _dependency, ...body }) => body)(
                  retainedDeferredTripMetadataSchema.parse(
                    JSON.parse(prior.payload_json),
                  ),
                ),
              ) !== json(action)
            )
              throw Error("TRIP_METADATA_OPERATION_REUSE_MISMATCH");
            await assertAccountRequestContext(scope, account);
            return;
          }
          const occupied = await database.getFirstAsync<{ id: string }>(
            "SELECT id FROM sync_operations WHERE id=?",
            action.operationId,
          );
          const reserved = await database.getFirstAsync<{ id: string }>(
            "SELECT id FROM sync_operations WHERE operation_type='TRIP_METADATA_DEFERRED' AND json_valid(payload_json) AND json_extract(payload_json,'$.operationId')=?",
            action.operationId,
          );
          if (occupied || reserved) throw Error("TRIP_METADATA_OPERATION_REUSE_MISMATCH");
          const base = await localBase(scope.accountId, action.tripId);
          if (json(base.metadata) !== json(action.before))
            throw Error("TRIP_METADATA_LOCAL_CONFLICT");
          const previous = await database.getFirstAsync<Operation>(
            "SELECT * FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND operation_type IN ('TRIP_METADATA_DEFERRED','UPDATE_TRIP_METADATA') AND NOT (operation_type='UPDATE_TRIP_METADATA' AND EXISTS (SELECT 1 FROM sync_operations action WHERE action.owner_user_id=sync_operations.owner_user_id AND action.trip_id=sync_operations.trip_id AND action.operation_type='TRIP_METADATA_DEFERRED' AND json_valid(action.payload_json) AND json_extract(action.payload_json,'$.operationId')=sync_operations.id)) ORDER BY rowid DESC LIMIT 1",
            scope.accountId,
            action.tripId,
          );
          const dependency = previous
            ? previous.operation_type === "TRIP_METADATA_DEFERRED"
              ? retainedDeferredTripMetadataSchema.parse(
                  JSON.parse(previous.payload_json),
                ).operationId
              : previous.id
            : base.createOperationId;
          const now = clock();
          if (action.cover && action.cover.before !== action.cover.after) {
            const row = await database.getFirstAsync<{
              selected_cover_asset_id: string | null;
            }>(
              "SELECT selected_cover_asset_id FROM local_trip_containers WHERE account_id=? AND id=?",
              scope.accountId,
              action.tripId,
            );
            if (
              !row ||
              (row.selected_cover_asset_id !== action.cover.before &&
                row.selected_cover_asset_id !== action.cover.after)
            )
              throw Error("TRIP_COVER_LOCAL_CONFLICT");
            if (parseTripPhotoCoverRef(action.cover.after)) {
              const photo = await photoRepository!.readSelectedTripCoverPhotoInScope(
                database,
                account,
                { ...scope, tripId: action.tripId },
                action.cover.after,
                {
                  resolveRetainedTripPhoto: (await import("../files/tripPhotoFileStore"))
                    .resolveRetainedTripPhoto,
                },
              );
              if (!photo) throw Error("TRIP_COVER_PHOTO_UNAVAILABLE");
            }
            await database.runAsync(
              "UPDATE local_trip_containers SET selected_cover_asset_id=? WHERE account_id=? AND id=?",
              action.cover.after,
              scope.accountId,
              action.tripId,
            );
            coverChanged = true;
          }
          await replaceLocalTripDestinations(
            database,
            scope.accountId,
            action.tripId,
            {
              operationId: action.actionId,
              before: action.before.destinations,
              after: action.after.destinations,
            },
            now,
          );
          await database.runAsync(
            "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,dependency_operation_id,last_error_code,created_at,updated_at) VALUES(?,?,'TRIP_LOCAL_ACTION',?,'TRIP_METADATA_DEFERRED',?,?,?,'DEPENDENCY_BLOCKED',0,NULL,'TRIP_METADATA_CONFIRMATION_REQUIRED',?,?)",
            action.actionId,
            action.tripId,
            action.tripId,
            action.actionId,
            json({ ...action, dependencyOperationId: dependency }),
            scope.accountId,
            now,
            now,
          );
          await database.runAsync(
            "UPDATE local_trip_containers SET name=?,destination=NULL,start_date=?,end_date=?,updated_at=? WHERE account_id=? AND id=?",
            action.after.name,
            action.after.startDate,
            action.after.endDate,
            now,
            scope.accountId,
            action.tripId,
          );
          await database.runAsync(
            "UPDATE ledger_journeys SET title=?,start_date=?,end_date=?,updated_at=? WHERE journey_id=? AND EXISTS(SELECT 1 FROM local_trip_ledger_bindings WHERE account_id=? AND trip_id=? AND authority='LOCAL_CREATOR')",
            action.after.name,
            action.after.startDate,
            action.after.endDate,
            now,
            action.tripId,
            scope.accountId,
            action.tripId,
          );
          await assertAccountRequestContext(scope, account);
        }),
      );
      if (coverChanged)
        photoRepository!.announcePersonalTripCoverAfterCommit({
          ...scope,
          tripId: action.tripId,
        });
      announceLedgerQueueWorkAvailable();
    },
    async materializeDeferredMetadata(tripId: string) {
      coreUuid.parse(tripId);
      const scope = await captureAccountScope(account);
      let materialized = 0;
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(scope, account);
          const rows = await database.getAllAsync<Operation>(
            "SELECT * FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_type='TRIP_LOCAL_ACTION' AND operation_type='TRIP_METADATA_DEFERRED' AND status='DEPENDENCY_BLOCKED' ORDER BY rowid",
            scope.accountId,
            tripId,
          );
          if (!rows.length) return;
          await localBase(scope.accountId, tripId);
          for (const row of rows) {
            const action = retainedDeferredTripMetadataSchema.parse(
              JSON.parse(row.payload_json),
            );
            if (
              action.actionId !== row.id ||
              action.tripId !== tripId ||
              row.idempotency_key !== action.actionId ||
              row.entity_id !== tripId
            )
              throw Error("TRIP_METADATA_QUEUE_MISMATCH");
            const parent = await database.getFirstAsync<{ status: string }>(
              "SELECT status FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND id=?",
              scope.accountId,
              tripId,
              action.dependencyOperationId,
            );
            if (parent?.status !== "COMPLETED") break;
            const confirmed = await readTripMetadataConfirmation(
              database,
              scope.accountId,
              tripId,
            );
            if (!confirmed) break;
            if (json(confirmed.metadata) !== json(action.before))
              throw Error("TRIP_METADATA_CONFIRMED_BASE_CONFLICT");
            const wire = structuredTripMetadataUpdateSchema.parse({
              formatVersion: 3,
              operationId: action.operationId,
              tripId,
              expectedMetadataRevision: confirmed.metadataRevision,
              before: action.before,
              after: action.after,
            });
            const occupied = await database.getFirstAsync<{ id: string }>(
              "SELECT id FROM sync_operations WHERE id=?",
              action.operationId,
            );
            if (occupied) throw Error("TRIP_METADATA_OPERATION_REUSE_MISMATCH");
            const now = clock();
            await database.runAsync(
              "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,dependency_operation_id,last_error_code,created_at,updated_at) VALUES(?,?,'TRIP',?,'UPDATE_TRIP_METADATA',?,?,?,'DEPENDENCY_BLOCKED',0,?,'TRIP_METADATA_PORT_REQUIRED',?,?)",
              action.operationId,
              tripId,
              tripId,
              action.operationId,
              json(wire),
              scope.accountId,
              action.dependencyOperationId,
              now,
              now,
            );
            await database.runAsync(
              "UPDATE sync_operations SET status='COMPLETED',last_error_code=NULL,updated_at=? WHERE id=? AND owner_user_id=?",
              now,
              action.actionId,
              scope.accountId,
            );
            materialized++;
          }
          await assertAccountRequestContext(scope, account);
        }),
      );
      return materialized;
    },
  };
}
