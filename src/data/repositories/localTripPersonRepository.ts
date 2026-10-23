import {
  assertAccountRequestContext,
  captureAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  localPersonCreateKind,
  localPersonCreateSchema,
  localPersonNameSlotSchema,
  type LocalPersonCreate,
  type LocalPersonNameSlot,
} from "@/domain/trip/localTripPerson";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { tripCreateWireRequestSchema as tripCreateRequestSchema } from "@/domain/trip/tripCreateWireContract";
import type { LedgerReadDatabase } from "./ledgerReadRepository";

async function localPersonCreator(
  database: LedgerReadDatabase,
  context: AccountRequestContext,
  account: () => Promise<string>,
) {
  await assertAccountRequestContext(context, account);
  const creator = await database.getFirstAsync<{
    operationId: string;
    personId: string;
    payload: string;
    acceptedAt: string | null;
    createStatus: string;
  }>(
    `SELECT binding.create_operation_id AS operationId,
    binding.person_id AS personId,op.payload_json AS payload,trip.accepted_at AS acceptedAt,
    op.status AS createStatus
   FROM local_trip_ledger_bindings binding
   JOIN local_trip_containers trip ON trip.account_id=binding.account_id
     AND trip.id=binding.trip_id AND trip.create_operation_id=binding.create_operation_id
   JOIN sync_operations op ON op.id=binding.create_operation_id
   JOIN ledger_actor_context actor ON actor.journey_id=binding.trip_id
     AND actor.user_id=binding.account_id
     AND actor.member_id=COALESCE(trip.owner_person_id,binding.person_id)
   WHERE binding.account_id=? AND binding.trip_id=? AND binding.authority='LOCAL_CREATOR'
     AND actor.role='owner'
     AND op.owner_user_id=binding.account_id AND op.trip_id=binding.trip_id
     AND op.entity_type='TRIP' AND op.entity_id=binding.trip_id
     AND op.operation_type='CREATE_TRIP' AND op.id=op.idempotency_key
     AND op.status IN ('PENDING','DEPENDENCY_BLOCKED','PROCESSING','RETRYABLE','COMPLETED')`,
    context.accountId,
    context.tripId,
  );
  if (!creator) throw new Error("TRIP_PERSON_LOCAL_CREATOR_REQUIRED");
  const create = tripCreateRequestSchema.parse({
    operationId: creator.operationId,
    ...JSON.parse(creator.payload),
  });
  if (create.tripId !== context.tripId || create.operationId !== creator.operationId)
    throw new Error("TRIP_PERSON_CREATE_BINDING_INVALID");
  await assertAccountRequestContext(context, account);
  return creator;
}

/** Caller holds the Account gate/transaction and the existing local creator proof. */
export async function readLocalTripPersonRosterWithinTransaction(
  database: LedgerReadDatabase,
  context: AccountRequestContext,
  account: () => Promise<string>,
  expectedTripCreateOperationId: string,
) {
  const creator = await localPersonCreator(database, context, account);
  if (creator.operationId !== expectedTripCreateOperationId)
    throw new Error("TRIP_PERSON_CREATE_BINDING_INVALID");
  const rows = await database.getAllAsync<{
    operationId: string;
    personId: string;
    displayName: string;
    payload: string;
  }>(
    `SELECT op.id AS operationId,m.id AS personId,m.display_name AS displayName,
       op.payload_json AS payload
     FROM sync_operations op JOIN ledger_members m
       ON m.id=op.entity_id AND m.journey_id=op.trip_id
     WHERE op.owner_user_id=? AND op.trip_id=? AND op.entity_type='TRIP_PERSON'
       AND op.operation_type=? AND op.id=op.idempotency_key
       AND op.status IN ('PENDING','DEPENDENCY_BLOCKED','PROCESSING','RETRYABLE')
       AND m.status='local' AND m.role IS NULL
       AND m.participation_revision IS NULL AND m.participation_active IS NULL
     ORDER BY m.id,op.id`,
    context.accountId,
    context.tripId,
    localPersonCreateKind,
  );
  const roster: LocalPersonCreate[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const parsed = localPersonCreateSchema.safeParse(JSON.parse(row.payload));
    if (!parsed.success) throw new Error("TRIP_PERSON_INTENT_REUSE_MISMATCH");
    const command = parsed.data;
    if (
      command.operationId !== row.operationId ||
      command.personId !== row.personId ||
      command.tripId !== context.tripId ||
      command.accountId !== context.accountId ||
      command.tripCreateOperationId !== creator.operationId ||
      command.displayName !== row.displayName ||
      seen.has(command.personId)
    )
      throw new Error("TRIP_PERSON_INTENT_REUSE_MISMATCH");
    if (command.personId === creator.personId)
      throw new Error("TRIP_PERSON_CREATOR_ID_RESERVED");
    seen.add(command.personId);
    roster.push(command);
  }
  await assertAccountRequestContext(context, account);
  return roster;
}

// Called inside the existing Trip create transaction; never starts or commits one.
export async function initializeLocalTripPersons(
  database: LedgerReadDatabase,
  context: AccountRequestContext,
  account: () => Promise<string>,
  input: readonly LocalPersonNameSlot[],
  clock = () => new Date().toISOString(),
) {
  const tripId = coreUuid.parse(context.tripId);
  const slots = input
    .map((slot) => localPersonNameSlotSchema.parse(slot))
    .map((slot) => ({ ...slot, displayName: slot.displayName.trim() }))
    .filter((slot) => slot.displayName.length > 0);
  if (
    new Set(slots.map((slot) => slot.operationId)).size !== slots.length ||
    new Set(slots.map((slot) => slot.personId)).size !== slots.length
  )
    throw new Error("TRIP_PERSON_DUPLICATE_INTENT");
  const saved: LocalPersonCreate[] = [];
  const creator = await localPersonCreator(database, context, account);
  for (const slot of slots) {
    if (slot.personId === creator.personId)
      throw new Error("TRIP_PERSON_CREATOR_ID_RESERVED");
    const command = localPersonCreateSchema.parse({
      version: 1,
      ...slot,
      tripId,
      accountId: context.accountId,
      tripCreateOperationId: creator.operationId,
    });
    const payload = JSON.stringify(command);
    const prior = await database.getFirstAsync<{
      owner: string;
      trip: string;
      person: string;
      kind: string;
      entity: string;
      key: string;
      payload: string;
    }>(
      `SELECT owner_user_id AS owner,trip_id AS trip,entity_id AS person,
       operation_type AS kind,entity_type AS entity,idempotency_key AS key,
       payload_json AS payload FROM sync_operations WHERE id=?`,
      slot.operationId,
    );
    const person = await database.getFirstAsync<{
      trip: string;
      name: string;
      role: string | null;
      status: string | null;
      revision: number | null;
    }>(
      `SELECT journey_id AS trip,display_name AS name,role,status,
      participation_revision AS revision FROM ledger_members WHERE id=?`,
      slot.personId,
    );
    if (prior) {
      if (
        prior.owner !== context.accountId ||
        prior.trip !== tripId ||
        prior.person !== slot.personId ||
        prior.entity !== "TRIP_PERSON" ||
        prior.kind !== localPersonCreateKind ||
        prior.key !== slot.operationId ||
        prior.payload !== payload ||
        !person ||
        person.trip !== tripId ||
        person.name !== slot.displayName ||
        person.role !== null ||
        person.status !== "local" ||
        person.revision !== null
      )
        throw new Error("TRIP_PERSON_INTENT_REUSE_MISMATCH");
    } else {
      if (creator.acceptedAt || creator.createStatus === "COMPLETED")
        throw new Error("TRIP_PERSON_LOCAL_INITIALIZATION_CLOSED");
      if (person) throw new Error("TRIP_PERSON_ID_COLLISION");
      const now = clock();
      await database.runAsync(
        `INSERT INTO ledger_members
        (id,journey_id,display_name,role,status,updated_at)
        VALUES(?,?,?,NULL,'local',?)`,
        slot.personId,
        tripId,
        slot.displayName,
        now,
      );
      // No success dependency: Trip sync must not dispatch an uninstalled Person writer.
      await database.runAsync(
        `INSERT INTO sync_operations
        (id,trip_id,entity_type,entity_id,operation_type,idempotency_key,
         payload_json,owner_user_id,status,attempt_count,next_attempt_at,
         last_error_code,failure_category,created_at,updated_at)
        VALUES(?,?,'TRIP_PERSON',?,?,?,?,?,'DEPENDENCY_BLOCKED',0,NULL,
          'PERSON_CREATE_HOSTED_UNAVAILABLE','DEPENDENCY',?,?)`,
        slot.operationId,
        tripId,
        slot.personId,
        localPersonCreateKind,
        slot.operationId,
        payload,
        context.accountId,
        now,
        now,
      );
    }
    saved.push(command);
  }
  await assertAccountRequestContext(context, account);
  return saved;
}

// A local Person is a saved name/identity, never an Account link or Hosted grant.
export function createLocalTripPersonRepository(
  database: LedgerReadDatabase,
  account: () => Promise<string>,
  clock = () => new Date().toISOString(),
) {
  return {
    async initialize(tripId: string, input: readonly LocalPersonNameSlot[]) {
      coreUuid.parse(tripId);
      const context = await captureAccountRequestContext(tripId, account);
      let people: LocalPersonCreate[] = [];
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          people = await initializeLocalTripPersons(
            database,
            context,
            account,
            input,
            clock,
          );
        }),
      );
      return { context, people };
    },
  };
}
