import { initializeLocalTripPersons } from "./localTripPersonRepository";
import { authoredCloudTravelersSchema } from "@/domain/trip/tripPersonCloudCreate";
import { retainAuthoredCloudTravelerWithinTransaction } from "./tripPersonCloudCreateRepository";
import { retainTripMetadataConfirmation } from "./tripMetadataConfirmation";
import type { TripCreateTarget } from "@/domain/trip/tripCreateContract";
import { parseLocalTripDestinations } from "@/domain/trip/localTripDestination";
import {
  readLocalTripDestinations,
  initializeLocalTripDestinations,
} from "./tripDestinationRepository";
import { isTripCoverAssetId } from "@/domain/trip/tripCoverAssets";
import type * as SQLite from "expo-sqlite";
import { createUuid } from "@/domain/localId";
import type {
  BuiltInTripCoverId,
  CreateTripInput,
  CreateTripItemInput,
  Trip,
} from "@/domain/trip/types";
import { coreUuid, coreDefaults } from "@/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { corePayloadSchemas } from "@/domain/trip/tripCoreV2Commands";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import {
  tripCreateWireRequestSchema as tripCreateRequestSchema,
  tripCreateWireResultSchema as tripCreateResultSchema,
  type TripCreateWireResult as TripCreateResult,
} from "@/domain/trip/tripCreateWireContract";
import {
  captureAccountScope,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountScope,
} from "../auth/accountRequestContext";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { createTripMetadataRepository } from "./tripMetadataRepository";
import { mapLocalTripLedgerPerson } from "./tripLedgerAcceptance";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
type Core = Pick<
  ReturnType<typeof createTripCoreV2Repository>,
  "captureContext" | "enqueue" | "pending"
>;
type Row = {
  create_operation_id?: string;
  create_payload_json?: string;
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  owner_person_id: string | null;
  accepted_at: string | null;
  selected_cover_asset_id?: string | null;
  metadata_pending?: number;
  metadata_verified?: number;
};
const originalCreateVersion = (row: Row): 2 | undefined => {
  if (!row.create_payload_json || !row.create_operation_id) return undefined;
  const request = tripCreateRequestSchema.parse({
    ...JSON.parse(row.create_payload_json),
    operationId: row.create_operation_id,
  });
  if (request.tripId !== row.id) throw Error("TRIP_CREATE_LOCAL_MISMATCH");
  return "formatVersion" in request ? 2 : undefined;
};
const isBuiltInCover = (value: unknown): value is BuiltInTripCoverId =>
  value === "city" ||
  value === "coast" ||
  value === "mountain" ||
  value === "cultural-oldtown";
const trip = (row: Row): Trip => ({
  syncFormatVersion: originalCreateVersion(row),
  id: row.id,
  serverId: row.accepted_at ? row.id : null,
  name: row.name,
  destination: row.destination,
  startDate: row.start_date,
  endDate: row.end_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: null,
  syncStatus: row.accepted_at
    ? row.metadata_pending || (originalCreateVersion(row) === 2 && !row.metadata_verified)
      ? "PENDING_UPDATE"
      : "SYNCED"
    : "PENDING_CREATE",
  syncVersion: 0,
  baseCurrency: null,
  ownerPersonId: row.owner_person_id,
  selectedCoverAssetIdRaw: row.selected_cover_asset_id ?? null,
  selectedCoverAssetId: isBuiltInCover(row.selected_cover_asset_id)
    ? row.selected_cover_asset_id
    : null,
});
const title = (value: string) => {
  const result = value.trim();
  if (!result || result.length > 256) throw new Error("TRIP_NAME_INVALID");
  return result;
};
const date = (value: string | null | undefined) =>
  value ? validateCalendarDate(value) : null;

// Local creator authority is separate from Hosted receipts and certified Core reads.
export function createTripRepository(
  database: Database,
  account: () => Promise<string>,
  core: Core,
  clock = () => new Date().toISOString(),
  displayName = async (accountId: string) => accountId,
) {
  async function initializeLedger(
    accountId: string,
    row: Row,
    name: string,
    explicitName?: string,
  ) {
    if (row.accepted_at) return;
    const binding = await database.getFirstAsync<{ person_id: string }>(
      "SELECT person_id FROM local_trip_ledger_bindings WHERE account_id=? AND trip_id=?",
      accountId,
      row.id,
    );
    if (binding) {
      if (explicitName !== undefined) {
        const member = await database.getFirstAsync<{
          display_name: string;
          role: string;
          status: string;
        }>(
          "SELECT display_name,role,status FROM ledger_members WHERE id=? AND journey_id=?",
          binding.person_id,
          row.id,
        );
        if (
          !member ||
          member.role !== "owner" ||
          member.status !== "local" ||
          member.display_name !== explicitName
        )
          throw new Error("TRIP_CREATOR_NAME_REPLAY_MISMATCH");
      }
      return;
    }
    const intent = await database.getFirstAsync<{ id: string; payload_json: string }>(
      `SELECT op.id,op.payload_json FROM sync_operations op
       JOIN local_trip_containers trip ON trip.account_id=op.owner_user_id
         AND trip.id=op.trip_id AND trip.create_operation_id=op.id
       WHERE op.owner_user_id=? AND op.trip_id=? AND op.entity_id=?
         AND op.id=op.idempotency_key AND op.entity_type='TRIP'
         AND op.operation_type='CREATE_TRIP'
         AND op.status IN ('PENDING','DEPENDENCY_BLOCKED','PROCESSING','RETRYABLE')`,
      accountId,
      row.id,
      row.id,
    );
    if (!intent) throw new Error("TRIP_CREATE_LOCAL_MISMATCH");
    const proposed = tripCreateRequestSchema.parse({
      operationId: intent.id,
      ...JSON.parse(intent.payload_json),
    });
    if (
      proposed.tripId !== row.id ||
      proposed.name !== row.name ||
      proposed.destination !== row.destination ||
      proposed.startDate !== row.start_date ||
      proposed.endDate !== row.end_date
    )
      throw new Error("TRIP_CREATE_LOCAL_MISMATCH");
    const existing = await database.getFirstAsync<{ journey_id: string }>(
      "SELECT journey_id FROM ledger_journeys WHERE journey_id=?",
      row.id,
    );
    if (existing) throw new Error("TRIP_LEDGER_INITIALIZATION_CONFLICT");
    const personId = createUuid();
    const now = clock();
    await database.runAsync(
      "INSERT INTO local_trip_ledger_bindings(account_id,trip_id,person_id,create_operation_id,initialized_at) VALUES(?,?,?,?,?)",
      accountId,
      row.id,
      personId,
      intent.id,
      now,
    );
    await database.runAsync(
      // Match accepted r3-v1-ledger-init-1 fresh Journey settings, not display preferences.
      "INSERT INTO ledger_journeys(journey_id,title,start_date,end_date,settlement_currency,settlement_scale,valuation_policy,updated_at) VALUES(?,?,?,?,'NZD',2,'REFERENCE_RATE',?)",
      row.id,
      row.name,
      row.start_date,
      row.end_date,
      now,
    );
    await database.runAsync(
      "INSERT INTO ledger_members(id,journey_id,display_name,role,status,updated_at) VALUES(?,?,?,'owner','local',?)",
      personId,
      row.id,
      name,
      now,
    );
    await database.runAsync(
      "INSERT INTO ledger_actor_context(user_id,journey_id,member_id,role,capabilities_json,updated_at) VALUES(?,?,?,'owner',?,?)",
      accountId,
      row.id,
      personId,
      JSON.stringify({ authority: "LOCAL_CREATOR" }),
      now,
    );
  }
  async function getTrip(id: string): Promise<Trip | null> {
    coreUuid.parse(id);
    const scope = await captureAccountScope(account);
    const row = await database.getFirstAsync<Row>(
      "SELECT *,(SELECT payload_json FROM sync_operations original WHERE original.id=local_trip_containers.create_operation_id AND original.owner_user_id=local_trip_containers.account_id) AS create_payload_json,EXISTS(SELECT 1 FROM sync_operations op WHERE op.owner_user_id=local_trip_containers.account_id AND op.trip_id=local_trip_containers.id AND ((op.entity_type='TRIP' AND op.operation_type='UPDATE_TRIP_METADATA') OR (op.entity_type='TRIP_LOCAL_ACTION' AND op.operation_type='TRIP_METADATA_DEFERRED') OR (op.entity_type='TRIP_PERSON' AND op.operation_type='TRIP_PERSON_CLOUD_CREATE') OR (op.entity_type='TRIP_READBACK' AND op.operation_type='TRIP_NORMAL_READBACK')) AND op.status<>'COMPLETED') AS metadata_pending,EXISTS(SELECT 1 FROM local_trip_metadata_confirmations verified WHERE verified.account_id=local_trip_containers.account_id AND verified.trip_id=local_trip_containers.id AND verified.source_kind='SNAPSHOT' AND verified.metadata_revision >= (SELECT MAX(accepted.metadata_revision) FROM local_trip_metadata_confirmations accepted WHERE accepted.account_id=local_trip_containers.account_id AND accepted.trip_id=local_trip_containers.id)) AS metadata_verified FROM local_trip_containers WHERE account_id=? AND id=?",
      scope.accountId,
      id,
    );
    await assertAccountRequestContext(scope, account);
    const destinations = row
      ? ((await readLocalTripDestinations(database, scope.accountId, id)).get(id) ?? [])
      : [];
    await assertAccountRequestContext(scope, account);
    return row ? { ...trip(row), destinations } : null;
  }
  return {
    ...createTripMetadataRepository(database, account, clock),
    getTrip,
    async initializeLocalLedger(tripId: string) {
      coreUuid.parse(tripId);
      const scope = await captureAccountScope(account);
      const name = await displayName(scope.accountId);
      await withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        await database.withTransactionAsync(async () => {
          const row = await database.getFirstAsync<Row>(
            "SELECT *,(SELECT payload_json FROM sync_operations original WHERE original.id=local_trip_containers.create_operation_id AND original.owner_user_id=local_trip_containers.account_id) AS create_payload_json FROM local_trip_containers WHERE account_id=? AND id=?",
            scope.accountId,
            tripId,
          );
          if (row) await initializeLedger(scope.accountId, row, name);
          await assertAccountRequestContext(scope, account);
        });
      });
    },
    async listTrips(): Promise<Trip[]> {
      const scope = await captureAccountScope(account);
      const rows = await database.getAllAsync<Row>(
        "SELECT *,(SELECT payload_json FROM sync_operations original WHERE original.id=local_trip_containers.create_operation_id AND original.owner_user_id=local_trip_containers.account_id) AS create_payload_json,EXISTS(SELECT 1 FROM sync_operations op WHERE op.owner_user_id=local_trip_containers.account_id AND op.trip_id=local_trip_containers.id AND ((op.entity_type='TRIP' AND op.operation_type='UPDATE_TRIP_METADATA') OR (op.entity_type='TRIP_LOCAL_ACTION' AND op.operation_type='TRIP_METADATA_DEFERRED') OR (op.entity_type='TRIP_PERSON' AND op.operation_type='TRIP_PERSON_CLOUD_CREATE') OR (op.entity_type='TRIP_READBACK' AND op.operation_type='TRIP_NORMAL_READBACK')) AND op.status<>'COMPLETED') AS metadata_pending,EXISTS(SELECT 1 FROM local_trip_metadata_confirmations verified WHERE verified.account_id=local_trip_containers.account_id AND verified.trip_id=local_trip_containers.id AND verified.source_kind='SNAPSHOT' AND verified.metadata_revision >= (SELECT MAX(accepted.metadata_revision) FROM local_trip_metadata_confirmations accepted WHERE accepted.account_id=local_trip_containers.account_id AND accepted.trip_id=local_trip_containers.id)) AS metadata_verified FROM local_trip_containers WHERE account_id=? ORDER BY created_at DESC,id",
        scope.accountId,
      );
      await assertAccountRequestContext(scope, account);
      const destinations = await readLocalTripDestinations(database, scope.accountId);
      await assertAccountRequestContext(scope, account);
      return rows.map((row) => ({
        ...trip(row),
        destinations: destinations.get(row.id) ?? [],
      }));
    },
    async selectBuiltInCover(tripId: string, coverAssetId: BuiltInTripCoverId | null) {
      coreUuid.parse(tripId);
      if (coverAssetId !== null && !isBuiltInCover(coverAssetId))
        throw new Error("TRIP_COVER_INVALID");
      const scope = await captureAccountScope(account);
      await withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        await database.withTransactionAsync(async () => {
          const row = await database.getFirstAsync<{ id: string }>(
            "SELECT id FROM local_trip_containers WHERE account_id=? AND id=?",
            scope.accountId,
            tripId,
          );
          if (!row) throw new Error("TRIP_LOCAL_RECORD_MISSING");
          await database.runAsync(
            "UPDATE local_trip_containers SET selected_cover_asset_id=? WHERE account_id=? AND id=?",
            coverAssetId,
            scope.accountId,
            tripId,
          );
          await assertAccountRequestContext(scope, account);
        });
      });
    },
    async createTrip(input: CreateTripInput): Promise<Trip> {
      const authored =
        input.cloudTravelers === undefined
          ? undefined
          : authoredCloudTravelersSchema.parse(input.cloudTravelers);
      if (authored && (input.travelers !== undefined || input.syncFormatVersion !== 2))
        throw Error("PERSON_OWNERSHIP_AMBIGUOUS");
      if (
        authored &&
        (new Set(authored.slots.map((s) => s.personId)).size !== authored.slots.length ||
          new Set(authored.slots.map((s) => s.operationId)).size !==
            authored.slots.length)
      )
        throw Error("PERSON_DUPLICATE_INTENT");
      const destinations =
        input.destinations === undefined
          ? undefined
          : parseLocalTripDestinations(input.destinations);
      if (
        input.creatorDisplayName !== undefined &&
        typeof input.creatorDisplayName !== "string"
      )
        throw new Error("TRIP_CREATOR_NAME_INVALID");
      const explicitName = input.creatorDisplayName?.trim() || undefined;
      if (explicitName && explicitName.length > 256)
        throw new Error("TRIP_CREATOR_NAME_INVALID");
      coreUuid.parse(input.operationId);
      coreUuid.parse(input.tripId);
      const startDate = date(input.startDate),
        endDate = date(input.endDate);
      if (startDate && endDate && endDate < startDate)
        throw new Error("TRIP_DATE_RANGE_INVALID");
      const payload = {
        tripId: input.tripId,
        name: title(input.name),
        destination:
          input.syncFormatVersion === 2 ? null : input.destination?.trim() || null,
        startDate,
        endDate,
      };
      if (payload.destination && payload.destination.length > 256)
        throw new Error("TRIP_DESTINATION_INVALID");
      const wirePayload =
        input.syncFormatVersion === 2
          ? {
              ...payload,
              formatVersion: 2 as const,
              destination: null,
              destinations: destinations ?? [],
            }
          : payload;
      if (input.syncFormatVersion === 2 && input.destination != null)
        throw new Error("TRIP_STRUCTURED_SCALAR_DESTINATION_FORBIDDEN");
      tripCreateRequestSchema.parse({ ...wirePayload, operationId: input.operationId });
      const text = canonicalCoreJson(wirePayload as Json);
      const scope = await captureAccountScope(account);
      const profileName = await displayName(scope.accountId);
      const name = explicitName ?? profileName;
      return withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        let result: Trip | null = null;
        await database.withTransactionAsync(async () => {
          const prior = await database.getFirstAsync<{ payload_json: string }>(
            "SELECT payload_json FROM sync_operations WHERE id=? AND owner_user_id=? AND operation_type='CREATE_TRIP'",
            input.operationId,
            scope.accountId,
          );
          if (prior) {
            if (prior.payload_json !== text)
              throw new Error("TRIP_OPERATION_REUSE_MISMATCH");
            const row = await database.getFirstAsync<Row>(
              "SELECT *,(SELECT payload_json FROM sync_operations original WHERE original.id=local_trip_containers.create_operation_id AND original.owner_user_id=local_trip_containers.account_id) AS create_payload_json FROM local_trip_containers WHERE account_id=? AND id=?",
              scope.accountId,
              input.tripId,
            );
            if (!row) throw new Error("TRIP_LOCAL_RECORD_MISSING");
            result = trip(row);
          } else {
            const now = clock();
            await database.runAsync(
              "INSERT INTO local_trip_containers(account_id,id,create_operation_id,name,destination,start_date,end_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
              scope.accountId,
              input.tripId,
              input.operationId,
              payload.name,
              payload.destination,
              startDate,
              endDate,
              now,
              now,
            );
            // The owning Backend initializer is not yet bound; generic workers cannot dispatch this intent.
            await database.runAsync(
              "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,owner_user_id,status,attempt_count,next_attempt_at,last_error_code,created_at,updated_at) VALUES(?,?,?,?,?,?,NULL,?,?,'DEPENDENCY_BLOCKED',0,NULL,'TRIP_INITIALIZATION_REQUIRED',?,?)",
              input.operationId,
              input.tripId,
              "TRIP",
              input.tripId,
              "CREATE_TRIP",
              input.operationId,
              text,
              scope.accountId,
              now,
              now,
            );
            result = trip({
              id: input.tripId,
              create_operation_id: input.operationId,
              create_payload_json: text,
              name: payload.name,
              destination: payload.destination,
              start_date: startDate,
              end_date: endDate,
              created_at: now,
              updated_at: now,
              owner_person_id: null,
              accepted_at: null,
            });
          }
          const row = await database.getFirstAsync<Row>(
            "SELECT *,(SELECT payload_json FROM sync_operations original WHERE original.id=local_trip_containers.create_operation_id AND original.owner_user_id=local_trip_containers.account_id) AS create_payload_json FROM local_trip_containers WHERE account_id=? AND id=?",
            scope.accountId,
            input.tripId,
          );
          if (!row) throw new Error("TRIP_LOCAL_RECORD_MISSING");
          await initializeLedger(scope.accountId, row, name, explicitName);
          const savedDestinations = await initializeLocalTripDestinations(
            database,
            scope.accountId,
            input.tripId,
            destinations,
            !prior,
            row.created_at,
          );
          result = { ...result!, destinations: savedDestinations };
          if (authored) {
            for (const slot of authored.slots)
              await retainAuthoredCloudTravelerWithinTransaction(
                database,
                { ...scope, tripId: input.tripId },
                account,
                { ...slot, tripId: input.tripId, dataOwnership: authored.dataOwnership },
                clock,
              );
          }
          if (input.travelers) {
            await initializeLocalTripPersons(
              database,
              { ...scope, tripId: input.tripId },
              account,
              input.travelers,
              clock,
            );
          }
          await assertAccountRequestContext(scope, account);
        });
        return result!;
      });
    },
    async addItem(tripId: string, input: CreateTripItemInput) {
      const context = await core.captureContext(tripId);
      if (!(await getTrip(tripId))) throw new Error("TRIP_LOCAL_RECORD_MISSING");
      const start = validateCalendarDate(input.startDate),
        end = date(input.endDate);
      if ((end && end < start) || (input.family === "P3" && !end))
        throw new Error("STAY_DATE_RANGE_INVALID");
      await assertAccountRequestContext(context, account);
      return core.enqueue(context, {
        contractVersion: 2,
        intentVersion: 2,
        operationId: coreUuid.parse(input.operationId),
        tripId,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id: coreUuid.parse(input.itemId) },
        baseVector: [{ kind: "ITEM", id: input.itemId, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          family: input.family,
          core: { title: title(input.title) },
          schedule: {
            start: coreDateBoundary(start),
            ...(end ? { end: coreDateBoundary(end) } : {}),
          },
          ...coreDefaults("organizer"),
        },
      });
    },
    async pendingItems(tripId: string) {
      const context = await core.captureContext(tripId);
      if (!(await getTrip(tripId))) throw new Error("TRIP_LOCAL_RECORD_MISSING");
      await assertAccountRequestContext(context, account);
      const pending = await core.pending(context);
      return pending.flatMap((intent) => {
        if (intent.command.command !== "CREATE_ITEM") return [];
        const payload = corePayloadSchemas.CREATE_ITEM.parse(intent.command.payload);
        if (payload.family !== "P1" && payload.family !== "P3") return [];
        return [{ ...intent, payload }];
      });
    },
    async acceptCreate(resultInput: TripCreateResult, requestScope?: AccountScope) {
      const accepted = tripCreateResultSchema.parse(resultInput);
      const scope = requestScope ?? (await captureAccountScope(account));
      if (accepted.actorAccountId !== scope.accountId)
        throw new Error("TRIP_CREATE_ACCOUNT_MISMATCH");
      const name = await displayName(scope.accountId);
      return withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        let applied: Trip | null = null;
        await database.withTransactionAsync(async () => {
          const operation = await database.getFirstAsync<{
            payload_json: string;
            trip_id: string;
            idempotency_key: string;
            status: string;
          }>(
            "SELECT payload_json,trip_id,idempotency_key,status FROM sync_operations WHERE id=? AND owner_user_id=? AND operation_type='CREATE_TRIP'",
            accepted.operationId,
            scope.accountId,
          );
          if (
            !operation ||
            operation.trip_id !== accepted.tripId ||
            operation.idempotency_key !== accepted.operationId
          )
            throw new Error("TRIP_CREATE_QUEUE_MISMATCH");
          const proposed = tripCreateRequestSchema.parse({
            operationId: accepted.operationId,
            ...JSON.parse(operation.payload_json),
          });
          if (
            proposed.tripId !== accepted.tripId ||
            proposed.name !== accepted.name ||
            proposed.destination !== accepted.destination ||
            proposed.startDate !== accepted.startDate ||
            proposed.endDate !== accepted.endDate ||
            ("formatVersion" in proposed ? 2 : 1) !==
              ("formatVersion" in accepted ? 2 : 1) ||
            ("destinations" in proposed &&
              (!("destinations" in accepted) ||
                canonicalCoreJson(proposed.destinations as Json) !==
                  canonicalCoreJson(accepted.destinations as Json)))
          )
            throw new Error("TRIP_CREATE_RECEIPT_MISMATCH");
          const row = await database.getFirstAsync<Row>(
            "SELECT *,(SELECT payload_json FROM sync_operations original WHERE original.id=local_trip_containers.create_operation_id AND original.owner_user_id=local_trip_containers.account_id) AS create_payload_json,EXISTS(SELECT 1 FROM sync_operations op WHERE op.owner_user_id=local_trip_containers.account_id AND op.trip_id=local_trip_containers.id AND ((op.entity_type='TRIP' AND op.operation_type='UPDATE_TRIP_METADATA') OR (op.entity_type='TRIP_LOCAL_ACTION' AND op.operation_type='TRIP_METADATA_DEFERRED') OR (op.entity_type='TRIP_PERSON' AND op.operation_type='TRIP_PERSON_CLOUD_CREATE') OR (op.entity_type='TRIP_READBACK' AND op.operation_type='TRIP_NORMAL_READBACK')) AND op.status<>'COMPLETED') AS metadata_pending,EXISTS(SELECT 1 FROM local_trip_metadata_confirmations verified WHERE verified.account_id=local_trip_containers.account_id AND verified.trip_id=local_trip_containers.id AND verified.source_kind='SNAPSHOT' AND verified.metadata_revision >= (SELECT MAX(accepted.metadata_revision) FROM local_trip_metadata_confirmations accepted WHERE accepted.account_id=local_trip_containers.account_id AND accepted.trip_id=local_trip_containers.id)) AS metadata_verified FROM local_trip_containers WHERE account_id=? AND id=? AND create_operation_id=?",
            scope.accountId,
            accepted.tripId,
            accepted.operationId,
          );
          if (
            !row ||
            (row.owner_person_id && row.owner_person_id !== accepted.ownerPersonId)
          )
            throw new Error("TRIP_CREATE_LOCAL_MISMATCH");
          if (operation.status === "COMPLETED" && !row.accepted_at)
            throw new Error("TRIP_CREATE_LOCAL_MISMATCH");
          if ("formatVersion" in accepted)
            await retainTripMetadataConfirmation(
              database,
              scope.accountId,
              accepted.operationId,
              "CREATE_RECEIPT",
              accepted,
            );
          const now = clock();
          if (!row.accepted_at) {
            await initializeLedger(scope.accountId, row, name);
            await mapLocalTripLedgerPerson(
              database,
              scope.accountId,
              accepted.tripId,
              accepted.operationId,
              accepted.ownerPersonId,
            );
            await database.runAsync(
              "UPDATE local_trip_containers SET owner_person_id=?,accepted_at=?,updated_at=? WHERE account_id=? AND id=? AND create_operation_id=?",
              accepted.ownerPersonId,
              now,
              now,
              scope.accountId,
              accepted.tripId,
              accepted.operationId,
            );
          }
          await database.runAsync(
            "UPDATE sync_operations SET status='COMPLETED',next_attempt_at=NULL,last_error_code=NULL,updated_at=? WHERE id=? AND owner_user_id=? AND operation_type='CREATE_TRIP'",
            now,
            accepted.operationId,
            scope.accountId,
          );
          await assertAccountRequestContext(scope, account);
          applied = {
            ...trip({
              ...row,
              owner_person_id: accepted.ownerPersonId,
              accepted_at: row.accepted_at ?? now,
              updated_at: row.accepted_at ? row.updated_at : now,
            }),
            destinations:
              (
                await readLocalTripDestinations(
                  database,
                  scope.accountId,
                  accepted.tripId,
                )
              ).get(accepted.tripId) ?? [],
          };
          await assertAccountRequestContext(scope, account);
        });
        return applied!;
      });
    },
    async resumeCreateTrips(target?: TripCreateTarget) {
      const scope = await captureAccountScope(account);
      if (target && target.accountId !== scope.accountId)
        throw new Error("TRIP_CREATE_ACCOUNT_MISMATCH");
      const name = await displayName(scope.accountId);
      await withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        await database.withTransactionAsync(async () => {
          const rows = await database.getAllAsync<Row & { create_operation_id: string }>(
            `SELECT trip.* FROM local_trip_containers trip JOIN sync_operations op
             ON op.id=trip.create_operation_id AND op.owner_user_id=trip.account_id
             AND op.trip_id=trip.id AND op.entity_id=trip.id AND op.idempotency_key=op.id
             WHERE trip.account_id=? AND trip.accepted_at IS NULL
               AND op.entity_type='TRIP' AND op.operation_type='CREATE_TRIP'
               AND op.status='DEPENDENCY_BLOCKED' AND op.last_error_code='TRIP_INITIALIZATION_REQUIRED'
               AND (? IS NULL OR trip.id=?) AND (? IS NULL OR op.id=?)`,
            scope.accountId,
            target?.tripId ?? null,
            target?.tripId ?? null,
            target?.operationId ?? null,
            target?.operationId ?? null,
          );
          for (const row of rows) {
            await initializeLedger(scope.accountId, row, name);
            await database.runAsync(
              "UPDATE sync_operations SET status='PENDING',next_attempt_at=NULL,last_error_code=NULL,failure_category=NULL WHERE owner_user_id=? AND id=? AND operation_type='CREATE_TRIP' AND status='DEPENDENCY_BLOCKED' AND last_error_code='TRIP_INITIALIZATION_REQUIRED'",
              scope.accountId,
              row.create_operation_id,
            );
          }
          await assertAccountRequestContext(scope, account);
        });
      });
    },
  };
}
export type TripRepository = ReturnType<typeof createTripRepository>;
export async function readLocalTripRepository(): Promise<TripRepository> {
  const { readInitializedDatabase } = await import("../db/database");
  const { requireActiveUserId, readLocalSession } =
    await import("../auth/authRepository");
  const database = await readInitializedDatabase();
  const core = createTripCoreV2Repository(
    database,
    requireActiveUserId,
    tripCoreSha256Hex,
  );
  return createTripRepository(
    database,
    requireActiveUserId,
    core,
    undefined,
    async (id) => {
      const identity = (await readLocalSession())?.identity;
      if (identity?.userId !== id) throw new Error("TRIP_CREATE_ACCOUNT_MISMATCH");
      return identity.displayName;
    },
  );
}
