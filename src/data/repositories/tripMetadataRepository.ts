import { isTripCoverAssetId, type TripCoverUpdate } from "@/domain/trip/tripCoverAssets";
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
import type * as SQLite from "expo-sqlite";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { tripCreateRequestSchema } from "@/domain/trip/tripCreateContract";
import {
  tripMetadataUpdateSchema,
  tripMetadataReceiptSchema,
  type TripMetadataUpdate,
  type TripMetadataReceipt,
} from "@/domain/trip/tripMetadataContract";
import {
  captureAccountScope,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountScope,
} from "../auth/accountRequestContext";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
const json = (value: unknown) => canonicalCoreJson(value as Json);
export function createTripMetadataRepository(
  database: Database,
  account: () => Promise<string>,
  clock: () => string,
) {
  return {
    async canUpdateMetadata(tripId: string) {
      const scope = await captureAccountScope(account);
      const row = await database.getFirstAsync<{ id: string; payload_json: string }>(
        `SELECT op.id,op.payload_json FROM local_trip_containers trip JOIN sync_operations op
         ON op.id=trip.create_operation_id AND op.owner_user_id=trip.account_id AND op.trip_id=trip.id
         AND op.entity_id=trip.id AND op.idempotency_key=op.id
         WHERE trip.account_id=? AND trip.id=? AND op.operation_type='CREATE_TRIP' AND op.entity_type='TRIP'`,
        scope.accountId,
        tripId,
      );
      await assertAccountRequestContext(scope, account);
      if (!row) return false;
      try {
        return (
          tripCreateRequestSchema.parse({
            ...JSON.parse(row.payload_json),
            operationId: row.id,
          }).tripId === tripId
        );
      } catch {
        return false;
      }
    },
    async updateMetadata(input: TripMetadataUpdate, cover?: TripCoverUpdate) {
      const request = tripMetadataUpdateSchema.parse(input);
      if (
        cover &&
        ((cover.before !== null &&
          (typeof cover.before !== "string" ||
            !/^[a-z0-9_-]{1,64}$/.test(cover.before))) ||
          (cover.after !== null && !isTripCoverAssetId(cover.after)))
      )
        throw new Error("TRIP_COVER_INVALID");
      const scope = await captureAccountScope(account);
      await withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        await database.withTransactionAsync(async () => {
          const existing = await database.getFirstAsync<{
            payload_json: string;
            entity_type: string;
            operation_type: string;
          }>(
            "SELECT payload_json,entity_type,operation_type FROM sync_operations WHERE id=? AND owner_user_id=?",
            request.operationId,
            scope.accountId,
          );
          if (existing) {
            const matchesMetadata =
              existing.entity_type === "TRIP" &&
              existing.operation_type === "UPDATE_TRIP_METADATA" &&
              existing.payload_json === json(request);
            const matchesLocalCover =
              existing.entity_type === "TRIP_LOCAL_PREFERENCE" &&
              existing.operation_type === "TRIP_COVER_LOCAL_SAVE" &&
              !!cover &&
              existing.payload_json === json({ request, cover });
            if (!matchesMetadata && !matchesLocalCover)
              throw new Error("TRIP_METADATA_OPERATION_REUSE_MISMATCH");
            await assertAccountRequestContext(scope, account);
            return;
          }
          // A local creator's original immutable create intent is provenance, not Hosted membership.
          const row = await database.getFirstAsync<{
            name: string;
            destination: string | null;
            start_date: string | null;
            end_date: string | null;
            accepted_at: string | null;
            create_operation_id: string;
            selected_cover_asset_id: string | null;
            payload_json: string;
          }>(
            `SELECT trip.*,op.payload_json FROM local_trip_containers trip JOIN sync_operations op
             ON op.id=trip.create_operation_id AND op.owner_user_id=trip.account_id AND op.trip_id=trip.id
             AND op.entity_id=trip.id AND op.idempotency_key=op.id
             WHERE trip.account_id=? AND trip.id=? AND op.operation_type='CREATE_TRIP' AND op.entity_type='TRIP'`,
            scope.accountId,
            request.tripId,
          );
          if (!row) throw new Error("TRIP_METADATA_LOCAL_CREATOR_REQUIRED");
          const original = tripCreateRequestSchema.parse({
            ...JSON.parse(row.payload_json),
            operationId: row.create_operation_id,
          });
          if (original.tripId !== request.tripId)
            throw new Error("TRIP_METADATA_LOCAL_CREATOR_REQUIRED");
          const before = {
            name: row.name,
            destination: row.destination,
            startDate: row.start_date,
            endDate: row.end_date,
          };
          if (json(before) !== json(request.before))
            throw new Error("TRIP_METADATA_LOCAL_CONFLICT");
          // A metadata-only save must not write a derived recommendation or erase
          // an unrecognised stored preference decoded by an older caller as null.
          if (cover && cover.before !== cover.after) {
            if (
              row.selected_cover_asset_id !== cover.before &&
              row.selected_cover_asset_id !== cover.after
            )
              throw new Error("TRIP_COVER_LOCAL_CONFLICT");
            if (json(before) === json(request.after)) {
              // Consumed device-local action: never dispatched or pruned as reconstructible sync history.
              const now = clock();
              await database.runAsync(
                `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,created_at,updated_at)
                 VALUES(?,?,'TRIP_LOCAL_PREFERENCE',?,'TRIP_COVER_LOCAL_SAVE',?,?,?,'COMPLETED',0,?,?)`,
                request.operationId,
                request.tripId,
                request.tripId,
                request.operationId,
                json({ request, cover }),
                scope.accountId,
                now,
                now,
              );
            }
            await database.runAsync(
              "UPDATE local_trip_containers SET selected_cover_asset_id=? WHERE account_id=? AND id=?",
              cover.after,
              scope.accountId,
              request.tripId,
            );
          }
          if (json(before) === json(request.after)) {
            await assertAccountRequestContext(scope, account);
            return;
          }
          const previous = await database.getFirstAsync<{ id: string }>(
            `SELECT id FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_type='TRIP'
             AND operation_type='UPDATE_TRIP_METADATA' AND status<>'COMPLETED' ORDER BY rowid DESC LIMIT 1`,
            scope.accountId,
            request.tripId,
          );
          const dependency =
            previous?.id ?? (row.accepted_at ? null : row.create_operation_id);
          const now = clock();
          await database.runAsync(
            `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,dependency_operation_id,last_error_code,created_at,updated_at)
             VALUES(?,?,'TRIP',?,'UPDATE_TRIP_METADATA',?,?,?,'DEPENDENCY_BLOCKED',0,?,'TRIP_METADATA_PORT_REQUIRED',?,?)`,
            request.operationId,
            request.tripId,
            request.tripId,
            request.operationId,
            json(request),
            scope.accountId,
            dependency,
            now,
            now,
          );
          await database.runAsync(
            "UPDATE local_trip_containers SET name=?,destination=?,start_date=?,end_date=?,updated_at=? WHERE account_id=? AND id=?",
            request.after.name,
            request.after.destination,
            request.after.startDate,
            request.after.endDate,
            now,
            scope.accountId,
            request.tripId,
          );
          if (!row.accepted_at)
            await database.runAsync(
              `UPDATE ledger_journeys SET title=?,start_date=?,end_date=?,updated_at=? WHERE journey_id=?
             AND EXISTS(SELECT 1 FROM local_trip_ledger_bindings WHERE account_id=? AND trip_id=? AND authority='LOCAL_CREATOR')`,
              request.after.name,
              request.after.startDate,
              request.after.endDate,
              now,
              request.tripId,
              scope.accountId,
              request.tripId,
            );
          await assertAccountRequestContext(scope, account);
        });
      });
      announceLedgerQueueWorkAvailable();
    },
    async acceptMetadataUpdate(input: TripMetadataReceipt, requestScope?: AccountScope) {
      const receipt = tripMetadataReceiptSchema.parse(input);
      const scope = requestScope ?? (await captureAccountScope(account));
      if (receipt.actorAccountId !== scope.accountId)
        throw new Error("TRIP_METADATA_ACCOUNT_MISMATCH");
      await withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        await database.withTransactionAsync(async () => {
          const operation = await database.getFirstAsync<{ payload_json: string }>(
            "SELECT payload_json FROM sync_operations WHERE id=? AND owner_user_id=? AND trip_id=? AND entity_type='TRIP' AND operation_type='UPDATE_TRIP_METADATA'",
            receipt.operationId,
            scope.accountId,
            receipt.tripId,
          );
          const request = tripMetadataUpdateSchema.parse({
            operationId: receipt.operationId,
            tripId: receipt.tripId,
            before: receipt.before,
            after: receipt.after,
          });
          if (!operation || operation.payload_json !== json(request))
            throw new Error("TRIP_METADATA_RECEIPT_MISMATCH");
          // Never replace a newer local edit with an older server receipt.
          await database.runAsync(
            "UPDATE sync_operations SET status='COMPLETED',next_attempt_at=NULL,last_error_code=NULL,updated_at=? WHERE id=? AND owner_user_id=?",
            clock(),
            receipt.operationId,
            scope.accountId,
          );
          await assertAccountRequestContext(scope, account);
        });
      });
    },
    async resumeMetadataUpdates() {
      const scope = await captureAccountScope(account);
      await withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        await database.runAsync(
          `UPDATE sync_operations SET status='PENDING',last_error_code=NULL WHERE owner_user_id=? AND entity_type='TRIP' AND operation_type='UPDATE_TRIP_METADATA' AND status='DEPENDENCY_BLOCKED'
          AND (dependency_operation_id IS NULL OR EXISTS(SELECT 1 FROM sync_operations parent WHERE parent.id=sync_operations.dependency_operation_id AND parent.owner_user_id=sync_operations.owner_user_id AND parent.status='COMPLETED'))`,
          scope.accountId,
        );
        await assertAccountRequestContext(scope, account);
      });
    },
  };
}
