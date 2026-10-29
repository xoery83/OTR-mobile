import { ledgerBootstrapResponseSchema } from "../api/ledgerReadContracts";
import { withAccountApplyGate } from "./accountRequestContext";
import { assertGuestPublicationNotRequested } from "./guestPublicationHold";
import type { GuestDraftScope } from "./guestDraftInventory";
import type { createGuestDatasetCensus } from "./guestDatasetCensus";
import type { createGuestCaptureInventory } from "./guestCaptureInventory";
import {
  guestCensusTablesSha256,
  readGuestRegisteredFileQualification,
} from "./guestRegisteredFileQualification";
import {
  type CoreDatabase,
  createTripCoreV2Repository,
} from "../repositories/tripCoreV2Repository";
import { createTripRepository } from "../repositories/tripRepository";
import {
  requireLocalTripPersonCreator,
  readLocalTripPersonRosterWithinTransaction,
} from "../repositories/localTripPersonRepository";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { tripCreateWireRequestSchema } from "@/domain/trip/tripCreateWireContract";
import { retainedDeferredTripMetadataSchema } from "@/domain/trip/tripDeferredMetadata";
import { structuredTripMetadataSchema } from "@/domain/trip/tripStructuredDestinationContract";
import { tripMetadataSchema } from "@/domain/trip/tripMetadataContract";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";

const canonical = (value: unknown) => canonicalCoreJson(value as Json);
type QueueRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  operation_type: string;
  idempotency_key: string;
  payload_json: string;
  status: string;
  attempt_count: number;
  claim_owner: string | null;
};

// Local domain evidence only; never an upload, identity conversion or publication grant.
export async function readGuestTripP1Source(deps: {
  database: CoreDatabase;
  scope: GuestDraftScope;
  owner(): Promise<string>;
  assertCurrent(): Promise<void>;
  readCensus: ReturnType<typeof createGuestDatasetCensus>;
  readCaptureInventory: ReturnType<typeof createGuestCaptureInventory>;
}) {
  const { database, scope, owner } = deps;
  async function assertCurrent() {
    await deps.assertCurrent();
    if ((await owner()) !== scope.localId) throw Error("GUEST_SOURCE_SCOPE_CHANGED");
    assertGuestPublicationNotRequested(scope.localId);
  }
  await assertCurrent();
  const qualification = await readGuestRegisteredFileQualification({
    ...deps,
    assertCurrent,
  });
  // Reuse owning readers with a read-only scope getter; never expose their mutation methods.
  const core = createTripCoreV2Repository(database, owner, tripCoreSha256Hex);
  const readTrip = createTripRepository(
    database,
    owner,
    core,
    undefined,
    async () => "",
  ).getTrip;
  const projected = await withAccountApplyGate(async () => {
    await assertCurrent();
    let trips!: Awaited<ReturnType<typeof readTrips>>;
    async function readTrips() {
      const rows = await database.getAllAsync<{ id: string }>(
        "SELECT id FROM local_trip_containers WHERE account_id=? ORDER BY id",
        scope.localId,
      );
      const result = [];
      for (const { id: tripId } of rows) {
        const context = {
          accountId: scope.localId,
          tripId,
          generation: scope.generation,
        };
        const trip = await readTrip(tripId);
        if (!trip || trip.serverId !== null) throw Error("GUEST_SOURCE_TRIP_REQUIRED");
        const creator = await requireLocalTripPersonCreator(database, context, owner);
        const create = tripCreateWireRequestSchema.parse({
          ...JSON.parse(creator.payload),
          operationId: creator.operationId,
        });
        const people = await readLocalTripPersonRosterWithinTransaction(
          database,
          context,
          owner,
          creator.operationId,
        );
        const ledgerInitialization = ledgerBootstrapResponseSchema.shape.journey.parse(
          await database.getFirstAsync(
            "SELECT journey_id AS id,title,start_date AS startDate,end_date AS endDate,settlement_currency AS settlementCurrency,settlement_scale AS settlementScale,valuation_policy AS valuationPolicy,updated_at AS updatedAt FROM ledger_journeys WHERE journey_id=?",
            tripId,
          ),
        );
        const members = await database.getAllAsync<{
          id: string;
          display_name: string;
          role: string | null;
          status: string | null;
          participation_revision: number | null;
          participation_active: number | null;
        }>(
          "SELECT id,display_name,role,status,participation_revision,participation_active FROM ledger_members WHERE journey_id=? ORDER BY id",
          tripId,
        );
        const self = members.find((person) => person.id === creator.personId);
        const knownPeople = new Map(people.map((person) => [person.personId, person]));
        if (
          !self ||
          typeof self.display_name !== "string" ||
          self.display_name.length > 256 ||
          members.length !== people.length + 1 ||
          members.some(
            (person) =>
              person.status !== "local" ||
              person.participation_revision !== null ||
              person.participation_active !== null ||
              (person.id === creator.personId
                ? person.role !== "owner"
                : person.role !== null ||
                  knownPeople.get(person.id)?.displayName !== person.display_name),
          )
        )
          throw Error("GUEST_SOURCE_PERSON_COVERAGE_REQUIRED");
        const queue = await database.getAllAsync<QueueRow>(
          "SELECT id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,attempt_count,claim_owner FROM sync_operations WHERE owner_user_id=? AND trip_id=? ORDER BY created_at,id",
          scope.localId,
          tripId,
        );
        if (
          queue.some(
            (row) =>
              row.id !== row.idempotency_key ||
              row.attempt_count !== 0 ||
              row.claim_owner !== null ||
              !["PENDING", "DEPENDENCY_BLOCKED"].includes(row.status),
          )
        )
          throw Error("GUEST_SOURCE_QUEUE_RECOVERY_REQUIRED");
        const expected = new Map<
          string,
          { entity: string; kind: string; target: string; payload?: string }
        >();
        function expectOperation(
          id: string,
          entity: string,
          kind: string,
          target: string,
          payload?: string,
        ) {
          if (expected.has(id)) throw Error("GUEST_SOURCE_DUPLICATE_OPERATION");
          expected.set(id, { entity, kind, target, payload });
        }
        expectOperation(
          create.operationId,
          "TRIP",
          "CREATE_TRIP",
          tripId,
          canonical(JSON.parse(creator.payload)),
        );
        for (const person of people)
          expectOperation(
            person.operationId,
            "TRIP_PERSON",
            "TRIP_PERSON_CREATE",
            person.personId,
            canonical(person),
          );
        const deferredMetadata = queue
          .filter((row) => row.operation_type === "TRIP_METADATA_DEFERRED")
          .map((row) => {
            const action = retainedDeferredTripMetadataSchema.parse(
              JSON.parse(row.payload_json),
            );
            if (action.actionId !== row.id || action.tripId !== tripId)
              throw Error("GUEST_SOURCE_METADATA_SCOPE");
            expectOperation(
              action.actionId,
              "TRIP_LOCAL_ACTION",
              "TRIP_METADATA_DEFERRED",
              tripId,
              canonical(action),
            );
            return action;
          });
        const metadata =
          "formatVersion" in create
            ? structuredTripMetadataSchema.parse({
                name: trip.name,
                destination: null,
                startDate: trip.startDate,
                endDate: trip.endDate,
                destinations: (trip.destinations ?? []).map(
                  ({ ordinal: _ordinal, ...destination }) => destination,
                ),
              })
            : tripMetadataSchema.parse({
                name: trip.name,
                destination: trip.destination,
                startDate: trip.startDate,
                endDate: trip.endDate,
              });
        const { operationId: _operation, tripId: _trip, ...initial } = create;
        let metadataBefore =
          "formatVersion" in initial
            ? structuredTripMetadataSchema.parse(
                (({ formatVersion: _version, ...metadata }) => metadata)(initial),
              )
            : tripMetadataSchema.parse(initial);
        let predecessor = create.operationId;
        const orderedMetadata = [];
        const remaining = [...deferredMetadata];
        while (remaining.length) {
          const candidates = remaining.filter(
            (action) => action.dependencyOperationId === predecessor,
          );
          if (
            candidates.length !== 1 ||
            canonical(candidates[0].before) !== canonical(metadataBefore)
          )
            throw Error("GUEST_SOURCE_METADATA_CHAIN_REQUIRED");
          const action = candidates[0];
          remaining.splice(remaining.indexOf(action), 1);
          orderedMetadata.push(action);
          predecessor = action.operationId;
          metadataBefore = action.after;
        }
        if (canonical(metadataBefore) !== canonical(metadata))
          throw Error("GUEST_SOURCE_METADATA_COVERAGE_REQUIRED");
        const pending = await core.pending(context);
        const intentRows = await database.getAllAsync<{
          operation_id: string;
          queue_operation_id: string;
          intent_sha256: string;
        }>(
          "SELECT operation_id,queue_operation_id,intent_sha256 FROM trip_core_pending_intents WHERE account_id=? AND trip_id=?",
          scope.localId,
          tripId,
        );
        if (intentRows.length !== pending.length)
          throw Error("GUEST_SOURCE_INTENT_COVERAGE_REQUIRED");
        const coreIntents = [];
        for (const intent of pending) {
          const text = canonical(intent.command),
            row = intentRows.find(
              (row) => row.operation_id === intent.command.operationId,
            );
          const sha256 = await coreHashValue(
            "otr-trip-core-intent-v2",
            intent.command,
            tripCoreSha256Hex,
          );
          if (
            !row ||
            row.queue_operation_id !== row.operation_id ||
            row.intent_sha256 !== sha256 ||
            text !== intent.canonical_intent_text ||
            intent.reconciled_revision !== null ||
            !["BLOCKED", "PENDING"].includes(intent.state)
          )
            throw Error("GUEST_SOURCE_INTENT_PIN_REQUIRED");
          expectOperation(
            row.operation_id,
            "TRIP_CORE_V2",
            "CORE_V2_COMMAND",
            intent.command.target.id,
            text,
          );
          coreIntents.push({
            command: intent.command,
            canonicalText: text,
            sha256,
            createdAt: intent.created_at,
            state: intent.state,
          });
        }
        if (
          queue.length !== expected.size ||
          queue.some((row) => {
            const operation = expected.get(row.id);
            return (
              !operation ||
              operation.entity !== row.entity_type ||
              operation.kind !== row.operation_type ||
              operation.target !== row.entity_id ||
              (operation.payload !== undefined &&
                operation.payload !== canonical(JSON.parse(row.payload_json)))
            );
          })
        )
          throw Error("GUEST_SOURCE_QUEUE_COVERAGE_REQUIRED");
        const preference = await database.getFirstAsync<{
          selected_cover_asset_id: string | null;
        }>(
          "SELECT selected_cover_asset_id FROM account_trip_cover_preferences WHERE account_id=? AND trip_id=?",
          scope.localId,
          tripId,
        );
        await assertCurrent();
        result.push({
          create,
          metadata,
          sourceTimeline: { createdAt: trip.createdAt, updatedAt: trip.updatedAt },
          ledgerInitialization,
          creator: { personId: creator.personId, displayName: self.display_name },
          people,
          selectedCoverAssetId: trip.selectedCoverAssetIdRaw ?? null,
          personalCover: preference
            ? { selectedCoverAssetId: preference.selected_cover_asset_id }
            : null,
          deferredMetadata: orderedMetadata,
          coreIntents,
          queueOperationIds: queue.map((row) => row.id),
        });
      }
      return result;
    }
    await database.withTransactionAsync(async () => {
      trips = await readTrips();
      await assertCurrent();
    });
    return trips;
  });
  const operationIds = projected.flatMap((trip) => [
    trip.create.operationId,
    ...trip.people.map((person) => person.operationId),
    ...trip.deferredMetadata.map((action) => action.operationId),
    ...trip.coreIntents.map((intent) => intent.command.operationId),
  ]);
  const queueIds = new Set(projected.flatMap((trip) => trip.queueOperationIds));
  if (
    new Set(operationIds).size !== operationIds.length ||
    projected.some((trip) =>
      trip.deferredMetadata.some((action) => queueIds.has(action.operationId)),
    )
  )
    throw Error("GUEST_SOURCE_DUPLICATE_OPERATION");
  const census = await deps.readCensus();
  if ((await guestCensusTablesSha256(census.tables)) !== qualification.sourceTablesSha256)
    throw Error("GUEST_SOURCE_DATASET_CHANGED");
  const totals = Object.freeze({
    trips: projected.length,
    people: projected.reduce((n, trip) => n + trip.people.length + 1, 0),
    p1Items: census.totals.p1Items,
    queueOperations: projected.reduce((n, trip) => n + trip.queueOperationIds.length, 0),
  });
  if (totals.trips !== census.totals.trips || totals.people !== census.totals.people)
    throw Error("GUEST_SOURCE_CENSUS_COVERAGE_REQUIRED");
  const body = {
    schemaId: "otr.auth.guest-trip-p1-source/1" as const,
    sourceKind: "GUEST" as const,
    capabilityVersion: qualification.capabilityVersion,
    sqliteVersion: census.sqliteVersion,
    sourceGuestLocalId: scope.localId,
    sourceTablesSha256: qualification.sourceTablesSha256,
    totals,
    trips: projected,
    cloudAuthority: false as const,
  };
  const canonicalText = canonical(body),
    sha256 = await tripCoreSha256Hex(new TextEncoder().encode(canonicalText));
  await assertCurrent();
  return Object.freeze({
    schemaId: body.schemaId,
    sourceGuestLocalId: body.sourceGuestLocalId,
    sourceTablesSha256: body.sourceTablesSha256,
    canonicalText,
    sha256,
    files: qualification,
    totals,
    cloudAuthority: false as const,
  });
}
