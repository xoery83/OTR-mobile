import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { createTripDeferredMetadataRepository } from "./tripDeferredMetadataRepository";
import {
  readTripMetadataConfirmation,
  retainTripMetadataConfirmation,
} from "./tripMetadataConfirmation";
import {
  structuredTripMetadataSnapshotSchema,
  type StructuredTripMetadataSnapshot,
} from "@/domain/trip/tripStructuredDestinationContract";
import {
  tripMetadataWireUpdateSchema,
  tripMetadataWireReceiptSchema,
  metadataRequestFromReceipt,
  type TripMetadataWireUpdate,
  type TripMetadataWireReceipt,
} from "@/domain/trip/tripMetadataV2Contract";
import {
  replaceLocalTripDestinations,
  readLocalTripDestinations,
  applyConfirmedTripDestinationRows,
  verifyLocalTripDestinationHistory,
} from "./tripDestinationRepository";
import {
  localTripDestinationsChangeSchema,
  localTripDestinationsReceiptSchema,
  type LocalTripDestinationsChange,
} from "@/domain/trip/localTripDestinationUpdate";
import {
  isTripCoverAssetId,
  parseTripPhotoCoverRef,
  type TripCoverUpdate,
} from "@/domain/trip/tripCoverAssets";
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
import type * as SQLite from "expo-sqlite";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  structuredTripCreateResultSchema,
  tripCreateWireRequestSchema as tripCreateRequestSchema,
} from "@/domain/trip/tripCreateWireContract";
import { type TripMetadataSyncTarget } from "@/domain/trip/tripMetadataContract";
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
  resolvePhoto?: typeof import("../files/tripPhotoFileStore").resolveRetainedTripPhoto,
) {
  const deferred = createTripDeferredMetadataRepository(database, account, clock);
  async function requireServerParent(
    scope: AccountScope,
    tripId: string,
    rawParent: unknown,
  ) {
    const parent = structuredTripCreateResultSchema.parse(rawParent);
    const context = { ...scope, tripId };
    const snapshot = await createTripCoreV2Repository(
      database,
      account,
      tripCoreSha256Hex,
    ).readAcceptedSnapshotWithinTransaction(context);
    if (
      parent.actorAccountId !== scope.accountId ||
      parent.tripId !== tripId ||
      !snapshot ||
      snapshot.actor.personId !== parent.ownerPersonId ||
      snapshot.certificate.epoch !== parent.coreEpoch
    )
      throw Error("TRIP_METADATA_PARENT_CONTEXT_REQUIRED");
    const owner = await database.getFirstAsync(
      "SELECT member_id FROM ledger_actor_context WHERE user_id=? AND journey_id=? AND member_id=? AND role='owner'",
      scope.accountId,
      tripId,
      parent.ownerPersonId,
    );
    if (!owner) throw Error("TRIP_METADATA_PARENT_CONTEXT_REQUIRED");
    await assertAccountRequestContext(scope, account);
  }
  async function enqueueMetadata(
    request: TripMetadataWireUpdate,
    scope: AccountScope,
    dependency: string | null,
  ) {
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
  }

  return {
    ...deferred,
    async readMetadataEditBase(tripId: string) {
      coreUuid.parse(tripId);
      const scope = await captureAccountScope(account);
      const confirmed = await readTripMetadataConfirmation(
        database,
        scope.accountId,
        tripId,
      );
      const pending = await database.getAllAsync<{ id: string }>(
        "SELECT id FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND operation_type IN ('UPDATE_TRIP_METADATA','TRIP_METADATA_DEFERRED') AND status<>'COMPLETED' ORDER BY rowid",
        scope.accountId,
        tripId,
      );
      await assertAccountRequestContext(scope, account);
      return { confirmed, pendingOperationIds: pending.map((row) => row.id) };
    },
    async retainMetadataSnapshot(
      input: StructuredTripMetadataSnapshot,
      operationId: string,
      serverParent?: unknown,
    ) {
      const snapshot = structuredTripMetadataSnapshotSchema.parse(input);
      coreUuid.parse(operationId);
      const scope = await captureAccountScope(account);
      if (scope.accountId !== snapshot.actorAccountId)
        throw Error("TRIP_METADATA_ACCOUNT_MISMATCH");
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(scope, account);
          const confirmed = await readTripMetadataConfirmation(
            database,
            scope.accountId,
            snapshot.tripId,
          );
          const pending = await database.getFirstAsync<{ id: string }>(
            "SELECT id FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND operation_type IN ('UPDATE_TRIP_METADATA','TRIP_METADATA_DEFERRED') AND status<>'COMPLETED' LIMIT 1",
            scope.accountId,
            snapshot.tripId,
          );
          const local = await database.getFirstAsync<{
            accepted_at: string | null;
            payload_json: string;
          }>(
            "SELECT trip.accepted_at,op.payload_json FROM local_trip_containers trip JOIN sync_operations op ON op.id=trip.create_operation_id AND op.owner_user_id=trip.account_id WHERE trip.account_id=? AND trip.id=?",
            scope.accountId,
            snapshot.tripId,
          );
          if (!local && serverParent !== undefined) {
            await requireServerParent(scope, snapshot.tripId, serverParent);
            await retainTripMetadataConfirmation(
              database,
              scope.accountId,
              operationId,
              "SNAPSHOT",
              snapshot,
            );
            await assertAccountRequestContext(scope, account);
            return;
          }
          if (!local?.accepted_at || JSON.parse(local.payload_json).formatVersion !== 2)
            throw Error("TRIP_STRUCTURED_ACCEPTED_TRIP_REQUIRED");
          if (
            !pending &&
            (!confirmed || snapshot.metadataRevision >= confirmed.metadataRevision)
          ) {
            if (
              confirmed &&
              snapshot.metadataRevision === confirmed.metadataRevision &&
              json(snapshot.metadata) !== json(confirmed.metadata)
            )
              throw Error("TRIP_METADATA_CONFIRMATION_REVISION_MISMATCH");
            await applyConfirmedTripDestinationRows(
              database,
              scope.accountId,
              snapshot.tripId,
              snapshot.metadata.destinations,
              clock(),
            );
            await database.runAsync(
              "UPDATE local_trip_containers SET name=?,destination=NULL,start_date=?,end_date=?,updated_at=? WHERE account_id=? AND id=?",
              snapshot.metadata.name,
              snapshot.metadata.startDate,
              snapshot.metadata.endDate,
              clock(),
              scope.accountId,
              snapshot.tripId,
            );
          }
          await retainTripMetadataConfirmation(
            database,
            scope.accountId,
            operationId,
            "SNAPSHOT",
            snapshot,
          );
          await assertAccountRequestContext(scope, account);
        }),
      );
    },
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
    async updateMetadata(
      input: TripMetadataWireUpdate,
      cover?: TripCoverUpdate,
      destinationInput?: LocalTripDestinationsChange,
      serverParent?: unknown,
    ) {
      const request = tripMetadataWireUpdateSchema.parse(input);
      if (
        "formatVersion" in request &&
        (cover !== undefined || destinationInput !== undefined)
      )
        throw new Error("TRIP_METADATA_V2_LOCAL_PREFERENCE_UNSUPPORTED");
      const destinations = destinationInput
        ? localTripDestinationsChangeSchema.parse(destinationInput)
        : undefined;
      if (
        destinations &&
        (request.after.destination !== null ||
          (json(destinations.before) === json(destinations.after) &&
            request.before.destination === null))
      )
        throw new Error("TRIP_DESTINATIONS_CHANGE_INVALID");
      const localReceipt = destinations
        ? localTripDestinationsReceiptSchema.parse({
            metadata: request,
            cover: cover ?? null,
            destinations,
          })
        : undefined;
      if (
        cover &&
        ((cover.before !== null &&
          (typeof cover.before !== "string" ||
            !/^[a-z0-9_-]{1,64}$/.test(cover.before))) ||
          (cover.after !== null &&
            !isTripCoverAssetId(cover.after) &&
            !parseTripPhotoCoverRef(cover.after)))
      )
        throw new Error("TRIP_COVER_INVALID");
      const scope = await captureAccountScope(account);
      const photoRepository = cover ? await import("./tripPhotoRepository") : undefined;
      await assertAccountRequestContext(scope, account);
      let coverChanged = false;
      await withAccountApplyGate(
        async () => {
          await assertAccountRequestContext(scope, account);
          await database.withTransactionAsync(async () => {
            if (localReceipt) {
              const local = await database.getFirstAsync<{
                payload_json: string;
                entity_type: string;
                operation_type: string;
                trip_id: string;
                entity_id: string;
                idempotency_key: string;
                status: string;
              }>(
                "SELECT * FROM sync_operations WHERE id=? AND owner_user_id=?",
                localReceipt.destinations.operationId,
                scope.accountId,
              );
              if (local) {
                if (
                  local.entity_type !== "TRIP_LOCAL_PREFERENCE" ||
                  local.operation_type !== "TRIP_DESTINATIONS_LOCAL_SAVE" ||
                  local.trip_id !== request.tripId ||
                  local.entity_id !== request.tripId ||
                  local.idempotency_key !== localReceipt.destinations.operationId ||
                  local.status !== "COMPLETED" ||
                  local.payload_json !== json(localReceipt)
                )
                  throw new Error("TRIP_DESTINATIONS_OPERATION_REUSE_MISMATCH");
                await verifyLocalTripDestinationHistory(
                  database,
                  scope.accountId,
                  request.tripId,
                );
                await assertAccountRequestContext(scope, account);
                return;
              }
            }
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
              if (destinations)
                throw new Error("TRIP_DESTINATIONS_OPERATION_REUSE_MISMATCH");
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
            if (!row && serverParent !== undefined) {
              if (
                !("formatVersion" in request) ||
                request.formatVersion !== 3 ||
                cover ||
                destinations
              )
                throw Error("TRIP_METADATA_PARENT_V3_REQUIRED");
              await requireServerParent(scope, request.tripId, serverParent);
              const confirmed = await readTripMetadataConfirmation(
                database,
                scope.accountId,
                request.tripId,
              );
              const pending = await database.getFirstAsync(
                "SELECT id FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND operation_type='UPDATE_TRIP_METADATA' AND status<>'COMPLETED' LIMIT 1",
                scope.accountId,
                request.tripId,
              );
              if (
                !confirmed ||
                pending ||
                confirmed.metadataRevision !== request.expectedMetadataRevision ||
                json(confirmed.metadata) !== json(request.before)
              )
                throw Error("TRIP_METADATA_CONFIRMED_BASE_REQUIRED");
              if (json(request.before) !== json(request.after))
                await enqueueMetadata(request, scope, null);
              await assertAccountRequestContext(scope, account);
              return;
            }
            if (!row) throw new Error("TRIP_METADATA_LOCAL_CREATOR_REQUIRED");
            if ("formatVersion" in request && !row.accepted_at)
              throw new Error("TRIP_METADATA_V2_ACCEPTED_TRIP_REQUIRED");
            const original = tripCreateRequestSchema.parse({
              ...JSON.parse(row.payload_json),
              operationId: row.create_operation_id,
            });
            if (original.tripId !== request.tripId)
              throw new Error("TRIP_METADATA_LOCAL_CREATOR_REQUIRED");
            if (
              "formatVersion" in original &&
              (!("formatVersion" in request) || request.formatVersion !== 3)
            )
              throw new Error("TRIP_STRUCTURED_WIRE_VERSION_REQUIRED");
            const before = {
              name: row.name,
              destination: row.destination,
              startDate: row.start_date,
              endDate: row.end_date,
              ...("formatVersion" in request && request.formatVersion === 3
                ? {
                    destinations: (
                      (
                        await readLocalTripDestinations(
                          database,
                          scope.accountId,
                          request.tripId,
                        )
                      ).get(request.tripId) ?? []
                    ).map(({ ordinal: _ordinal, ...item }) => item),
                  }
                : {}),
            };
            if (json(before) !== json(request.before))
              throw new Error("TRIP_METADATA_LOCAL_CONFLICT");
            if (
              cover &&
              cover.before !== cover.after &&
              parseTripPhotoCoverRef(cover.after)
            ) {
              const photo = await photoRepository!.readSelectedTripCoverPhotoInScope(
                database,
                account,
                { ...scope, tripId: request.tripId },
                cover.after,
                {
                  resolveRetainedTripPhoto:
                    resolvePhoto ??
                    (await import("../files/tripPhotoFileStore"))
                      .resolveRetainedTripPhoto,
                },
              );
              if (!photo) throw new Error("TRIP_COVER_PHOTO_UNAVAILABLE");
            }
            if (destinations && localReceipt) {
              const now = clock();
              await replaceLocalTripDestinations(
                database,
                scope.accountId,
                request.tripId,
                destinations,
                now,
              );
              await database.runAsync(
                `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,created_at,updated_at)
                 VALUES(?,?,'TRIP_LOCAL_PREFERENCE',?,'TRIP_DESTINATIONS_LOCAL_SAVE',?,?,?,'COMPLETED',0,?,?)`,
                destinations.operationId,
                request.tripId,
                request.tripId,
                destinations.operationId,
                json(localReceipt),
                scope.accountId,
                now,
                now,
              );
            }
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
              coverChanged = row.selected_cover_asset_id !== cover.after;
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
            if ("formatVersion" in request && request.formatVersion === 3)
              await replaceLocalTripDestinations(
                database,
                scope.accountId,
                request.tripId,
                {
                  operationId: request.operationId,
                  before: request.before.destinations,
                  after: request.after.destinations,
                },
                clock(),
              );
            const previous = await database.getFirstAsync<{ id: string }>(
              `SELECT id FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_type='TRIP'
             AND operation_type IN ('UPDATE_TRIP_METADATA','TRIP_METADATA_DEFERRED') AND status<>'COMPLETED' ORDER BY rowid DESC LIMIT 1`,
              scope.accountId,
              request.tripId,
            );
            const dependency =
              previous?.id ?? (row.accepted_at ? null : row.create_operation_id);
            const now = clock();
            await enqueueMetadata(request, scope, dependency);
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
        },
        () => {
          if (coverChanged)
            photoRepository!.announcePersonalTripCoverAfterCommit({
              ...scope,
              tripId: request.tripId,
            });
        },
      );
      announceLedgerQueueWorkAvailable();
    },
    async acceptMetadataUpdate(
      input: TripMetadataWireReceipt,
      requestScope?: AccountScope,
    ) {
      const receipt = tripMetadataWireReceiptSchema.parse(input);
      const scope = requestScope ?? (await captureAccountScope(account));
      if (receipt.actorAccountId !== scope.accountId)
        throw new Error("TRIP_METADATA_ACCOUNT_MISMATCH");
      await withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        await database.withTransactionAsync(async () => {
          const operation = await database.getFirstAsync<{ payload_json: string }>(
            "SELECT payload_json FROM sync_operations WHERE id=? AND owner_user_id=? AND trip_id=? AND entity_type='TRIP' AND operation_type='UPDATE_TRIP_METADATA' AND entity_id=trip_id AND idempotency_key=id",
            receipt.operationId,
            scope.accountId,
            receipt.tripId,
          );
          const request = metadataRequestFromReceipt(receipt);
          if (!operation || operation.payload_json !== json(request))
            throw new Error("TRIP_METADATA_RECEIPT_MISMATCH");
          if ("formatVersion" in receipt && receipt.formatVersion === 3)
            await retainTripMetadataConfirmation(
              database,
              scope.accountId,
              receipt.operationId,
              "METADATA_RECEIPT",
              receipt,
            );
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
    async resumeMetadataUpdates(target?: TripMetadataSyncTarget) {
      const selected = target && Object.freeze({ ...target });
      const scope = await captureAccountScope(account);
      if (selected) {
        coreUuid.parse(selected.accountId);
        coreUuid.parse(selected.tripId);
        coreUuid.parse(selected.operationId);
        if (selected.accountId !== scope.accountId)
          throw new Error("TRIP_METADATA_ACCOUNT_MISMATCH");
      }
      if (selected) await deferred.materializeDeferredMetadata(selected.tripId);
      await withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        await database.runAsync(
          `UPDATE sync_operations SET status='PENDING',last_error_code=NULL WHERE owner_user_id=? AND entity_type='TRIP' AND operation_type='UPDATE_TRIP_METADATA' AND status='DEPENDENCY_BLOCKED'
          ${selected ? "AND trip_id=? AND entity_id=? AND id=? AND idempotency_key=?" : ""}
          AND (dependency_operation_id IS NULL OR EXISTS(SELECT 1 FROM sync_operations parent WHERE parent.id=sync_operations.dependency_operation_id AND parent.owner_user_id=sync_operations.owner_user_id AND parent.status='COMPLETED'))`,
          scope.accountId,
          ...(selected
            ? [
                selected.tripId,
                selected.tripId,
                selected.operationId,
                selected.operationId,
              ]
            : []),
        );
        await assertAccountRequestContext(scope, account);
      });
    },
  };
}

async function serverParentMetadataAccess(
  origin: import("../auth/accountRequestContext").AccountRequestContext,
) {
  const scope = Object.freeze({ ...origin });
  const { requireAdoptedUserId } = await import("../auth/authRepository");
  const account = async () => {
    await assertAccountRequestContext(scope, requireAdoptedUserId);
    return scope.accountId;
  };
  await account();
  const { ensureJourneyLedgerActor } = await import("../sync/ledgerReportingCoordinator");
  await ensureJourneyLedgerActor(scope.tripId, scope);
  const { createTripCreateTransport } = await import("../sync/tripCreateTransport");
  const parentReader = createTripCreateTransport(account);
  if (!parentReader.parentReceipt) throw Error("TRIP_METADATA_PARENT_READER_CLOSED");
  const parent = await parentReader.parentReceipt(scope);
  await account();
  if (!parent) throw Error("TRIP_METADATA_PARENT_CONTEXT_REQUIRED");
  const { readInitializedDatabase } = await import("../db/database");
  const database = await readInitializedDatabase();
  await account();
  return {
    scope,
    account,
    parent,
    repository: createTripMetadataRepository(database, account, () =>
      new Date().toISOString(),
    ),
  };
}

export async function readServerParentMetadataEditBase(
  origin: import("../auth/accountRequestContext").AccountRequestContext,
) {
  const access = await serverParentMetadataAccess(origin);
  const { createTripMetadataTransport } = await import("../sync/tripMetadataTransport");
  const snapshot = structuredTripMetadataSnapshotSchema.parse(
    await createTripMetadataTransport(access.account).snapshot(
      access.scope,
      access.scope.tripId,
      access.parent.operationId,
      3,
    ),
  );
  await access.account();
  const { createUuid } = await import("@/domain/localId");
  await access.repository.retainMetadataSnapshot(snapshot, createUuid(), access.parent);
  const base = await access.repository.readMetadataEditBase(access.scope.tripId);
  await access.account();
  if (!base.confirmed || base.pendingOperationIds.length)
    throw Error("TRIP_METADATA_CONFIRMED_BASE_REQUIRED");
  return { context: access.scope, snapshot: base.confirmed };
}

export async function saveServerParentTripMetadata(
  origin: import("../auth/accountRequestContext").AccountRequestContext,
  request: TripMetadataWireUpdate,
) {
  const frozen = tripMetadataWireUpdateSchema.parse(request);
  if (frozen.tripId !== origin.tripId) throw Error("TRIP_METADATA_ACCOUNT_MISMATCH");
  const access = await serverParentMetadataAccess(origin);
  await access.repository.updateMetadata(frozen, undefined, undefined, access.parent);
  await access.account();
}
