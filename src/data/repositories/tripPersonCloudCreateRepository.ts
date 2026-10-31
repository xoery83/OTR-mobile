import {
  localPersonCreateKind,
  localPersonCreateSchema,
} from "@/domain/trip/localTripPerson";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { structuredTripCreateRequestSchema } from "@/domain/trip/tripStructuredDestinationContract";
import type { LedgerReadDatabase } from "./ledgerReadRepository";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { requireLocalTripPersonCreator } from "./localTripPersonRepository";
import { createTripPersonRepository } from "./tripPersonRepository";
import {
  personCloudCreateKind,
  personCloudCreateSchema,
  personCloudCreateReceiptSchema,
  type PersonCloudCreate,
  type PersonCloudCreateReceipt,
} from "@/domain/trip/tripPersonCloudCreate";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
import {
  createTripCoreV2Repository,
  type CoreAcceptedSnapshot,
} from "./tripCoreV2Repository";
import {
  structuredTripCreateResultSchema,
  type TripCreateWireResult,
} from "@/domain/trip/tripCreateWireContract";
const json = (v: unknown) => canonicalCoreJson(v as Json);
type ParentReadEvidence = {
  receipt: TripCreateWireResult;
  snapshot: CoreAcceptedSnapshot;
};

async function requireServerParentCreator(
  database: LedgerReadDatabase,
  scope: AccountRequestContext,
  parent: ParentReadEvidence,
) {
  const receipt = structuredTripCreateResultSchema.parse(parent.receipt);
  if (
    receipt.actorAccountId !== scope.accountId ||
    receipt.tripId !== scope.tripId ||
    parent.snapshot.actor.accountId !== scope.accountId ||
    parent.snapshot.actor.tripId !== scope.tripId ||
    parent.snapshot.actor.personId !== receipt.ownerPersonId ||
    parent.snapshot.certificate.epoch !== receipt.coreEpoch
  )
    throw Error("PERSON_PARENT_CONTEXT_MISMATCH");
  // This is local roster continuity, not a new permission grant. The server still authorizes the mutation.
  const current = await database.getFirstAsync(
    `SELECT a.member_id FROM ledger_actor_context a
     JOIN ledger_members m ON m.id=a.member_id AND m.journey_id=a.journey_id
     JOIN trip_core_read_certificates c ON c.account_id=a.user_id AND c.trip_id=a.journey_id
     JOIN trip_core_scopes s ON s.account_id=c.account_id AND s.trip_id=c.trip_id
     WHERE a.user_id=? AND a.journey_id=? AND a.member_id=? AND a.role='owner'
       AND m.role='owner' AND m.status='linked' AND c.complete=1
       AND c.epoch=? AND c.manifest_sha256=?
       AND s.revoked=0 AND s.access_revision=c.access_revision`,
    scope.accountId,
    scope.tripId,
    receipt.ownerPersonId,
    receipt.coreEpoch,
    parent.snapshot.certificate.manifest_sha256,
  );
  if (!current) throw Error("PERSON_PARENT_CONTEXT_CHANGED");
  return { operationId: receipt.operationId, personId: receipt.ownerPersonId };
}

// UI authoring stays bound to the opening Account/Trip across asynchronous DB access.
export async function saveAuthoredTripTraveler(
  origin: AccountRequestContext,
  input: Readonly<Pick<PersonCloudCreate, "operationId" | "personId" | "displayName">>,
) {
  return saveTripTraveler(origin, input, false);
}

export async function readServerParentPeopleContext(origin: AccountRequestContext) {
  const scope = Object.freeze({ ...origin });
  const { requireAdoptedUserId } = await import("../auth/authRepository");
  const account = async () => {
    await assertAccountRequestContext(scope, requireAdoptedUserId);
    return scope.accountId;
  };
  await account();
  const { createTripCreateTransport } = await import("../sync/tripCreateTransport");
  const transport = createTripCreateTransport(account);
  if (!transport.parentReceipt) throw Error("PERSON_PARENT_READER_CLOSED");
  const parent = await transport.parentReceipt(scope);
  await account();
  if (!parent) throw Error("PERSON_PARENT_RECEIPT_REQUIRED");
  const { readInitializedDatabase } = await import("../db/database");
  const database = await readInitializedDatabase();
  const creator = await createTripPersonCloudCreateRepository(
    database,
    account,
  ).readServerParentCreator(scope.tripId, parent);
  await account();
  return { context: scope, ownerPersonId: creator.personId };
}

export async function saveServerParentTripTraveler(
  origin: AccountRequestContext,
  input: Readonly<Pick<PersonCloudCreate, "operationId" | "personId" | "displayName">>,
) {
  return saveTripTraveler(origin, input, true);
}

async function saveTripTraveler(
  origin: AccountRequestContext,
  input: Readonly<Pick<PersonCloudCreate, "operationId" | "personId" | "displayName">>,
  serverParent: boolean,
) {
  const scope = Object.freeze({ ...origin });
  const draft = Object.freeze({ ...input });
  const { requireAdoptedUserId } = await import("../auth/authRepository");
  const account = async () => {
    await assertAccountRequestContext(scope, requireAdoptedUserId);
    return scope.accountId;
  };
  await account();
  const { readInitializedDatabase } = await import("../db/database");
  const database = await readInitializedDatabase();
  const repository = createTripPersonCloudCreateRepository(database, account);
  const request = {
    ...draft,
    tripId: scope.tripId,
    dataOwnership: "CLOUD_SHARED_AUTHORED" as const,
  };
  let result: PersonCloudCreate;
  if (serverParent) {
    const { createTripCreateTransport } = await import("../sync/tripCreateTransport");
    const transport = createTripCreateTransport(account);
    if (!transport.parentReceipt) throw Error("PERSON_PARENT_READER_CLOSED");
    const parent = await transport.parentReceipt(scope);
    await account();
    if (!parent) throw Error("PERSON_PARENT_RECEIPT_REQUIRED");
    result = await repository.createAuthoredFromParentReceipt(request, parent);
  } else result = await repository.createAuthored(request);
  const people = await createTripPersonRepository(database, account).listTripPersons(
    scope.tripId,
  );
  await account();
  return { request: result, people };
}

export async function retainAuthoredCloudTravelerWithinTransaction(
  database: LedgerReadDatabase,
  scope: AccountRequestContext,
  account: () => Promise<string>,
  input: Omit<PersonCloudCreate, "version" | "tripCreateOperationId">,
  clock = () => new Date().toISOString(),
  parent?: ParentReadEvidence,
) {
  if (input.tripId !== scope.tripId || input.dataOwnership !== "CLOUD_SHARED_AUTHORED")
    throw Error("PERSON_EXPLICIT_AUTHORING_REQUIRED");
  await assertAccountRequestContext(scope, account);
  if (
    !(await database.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='trip_person_cloud_create_receipts'",
    ))
  )
    throw Error("PERSON_RECEIPT_STORAGE_REQUIRED");
  let creator: { operationId: string; personId: string };
  if (parent) {
    creator = await requireServerParentCreator(database, scope, parent);
  } else {
    const local = await requireLocalTripPersonCreator(database, scope, account);
    structuredTripCreateRequestSchema.parse({
      ...JSON.parse(local.payload),
      operationId: local.operationId,
    });
    creator = local;
  }
  const request = personCloudCreateSchema.parse({
    ...input,
    version: 1,
    tripCreateOperationId: creator.operationId,
  });
  if (request.personId === creator.personId) throw Error("PERSON_CREATOR_ID_RESERVED");
  const prior = await database.getFirstAsync<{
    payload_json: string;
    owner_user_id: string;
    entity_type: string;
    operation_type: string;
    entity_id: string;
    trip_id: string;
    idempotency_key: string;
  }>("SELECT * FROM sync_operations WHERE id=?", request.operationId);
  if (prior) {
    if (
      prior.entity_id !== request.personId ||
      prior.trip_id !== request.tripId ||
      prior.idempotency_key !== request.operationId ||
      prior.owner_user_id !== scope.accountId ||
      prior.entity_type !== "TRIP_PERSON" ||
      prior.operation_type !== personCloudCreateKind ||
      prior.payload_json !== json(request)
    )
      throw Error("PERSON_OPERATION_COLLISION");
    const person = await database.getFirstAsync<{
      journey_id: string;
      display_name: string;
    }>("SELECT journey_id,display_name FROM ledger_members WHERE id=?", request.personId);
    if (
      !person ||
      person.journey_id !== request.tripId ||
      person.display_name !== request.displayName
    )
      throw Error("PERSON_LOCAL_READBACK_CONFLICT");
    await assertAccountRequestContext(scope, account);
    return request;
  }
  if (
    await database.getFirstAsync(
      "SELECT id FROM ledger_members WHERE id=?",
      request.personId,
    )
  )
    throw Error("PERSON_ID_COLLISION");
  const now = clock();
  await database.runAsync(
    "INSERT INTO ledger_members(id,journey_id,display_name,role,status,updated_at) VALUES(?,?,?,NULL,'local',?)",
    request.personId,
    request.tripId,
    request.displayName,
    now,
  );
  await database.runAsync(
    "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,dependency_operation_id,last_error_code,created_at,updated_at) VALUES(?,?,'TRIP_PERSON',?,?,?,?,?,?,0,?,?,?,?)",
    request.operationId,
    request.tripId,
    request.personId,
    personCloudCreateKind,
    request.operationId,
    json(request),
    scope.accountId,
    parent ? "PENDING" : "DEPENDENCY_BLOCKED",
    parent ? null : creator.operationId,
    parent ? null : "PERSON_CREATE_DEPENDENCY",
    now,
    now,
  );
  await assertAccountRequestContext(scope, account);
  return request;
}

export function createTripPersonCloudCreateRepository(
  database: LedgerReadDatabase,
  account: () => Promise<string>,
  clock = () => new Date().toISOString(),
) {
  return {
    async readServerParentCreator(tripId: string, rawParent: unknown) {
      const receipt = structuredTripCreateResultSchema.parse(rawParent);
      const scope = await captureAccountRequestContext(tripId, account);
      const snapshot = await createTripCoreV2Repository(
        database,
        account,
        tripCoreSha256Hex,
      ).acceptedSnapshot(scope);
      if (!snapshot) throw Error("PERSON_PARENT_COLLECTION_REQUIRED");
      const creator = await requireServerParentCreator(database, scope, {
        receipt,
        snapshot,
      });
      await assertAccountRequestContext(scope, account);
      return creator;
    },
    // Only an owning reader supplies this receipt. Never synthesize a local CREATE_TRIP queue or replay Create.
    async createAuthoredFromParentReceipt(
      rawInput: Omit<PersonCloudCreate, "version" | "tripCreateOperationId">,
      rawParent: unknown,
    ) {
      const input = Object.freeze({ ...rawInput });
      const receipt = structuredTripCreateResultSchema.parse(rawParent);
      const scope = await captureAccountRequestContext(input.tripId, account);
      if (receipt.actorAccountId !== scope.accountId || receipt.tripId !== scope.tripId)
        throw Error("PERSON_PARENT_CONTEXT_MISMATCH");
      const snapshot = await createTripCoreV2Repository(
        database,
        account,
        tripCoreSha256Hex,
      ).acceptedSnapshot(scope);
      if (!snapshot) throw Error("PERSON_PARENT_COLLECTION_REQUIRED");
      let request: PersonCloudCreate | undefined;
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          request = await retainAuthoredCloudTravelerWithinTransaction(
            database,
            scope,
            account,
            input,
            clock,
            { receipt, snapshot },
          );
        }),
      );
      announceLedgerQueueWorkAvailable();
      return request!;
    },
    async createAuthored(
      input: Omit<PersonCloudCreate, "version" | "tripCreateOperationId">,
    ) {
      // This explicit method is called only for the current Add Traveler action. Never scan/promote old local names.
      if (input.dataOwnership !== "CLOUD_SHARED_AUTHORED")
        throw Error("PERSON_EXPLICIT_AUTHORING_REQUIRED");
      const scope = await captureAccountRequestContext(input.tripId, account);
      let request: PersonCloudCreate | undefined;
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          request = await retainAuthoredCloudTravelerWithinTransaction(
            database,
            scope,
            account,
            input,
            clock,
          );
        }),
      );
      announceLedgerQueueWorkAvailable();
      return request!;
    },
    // Explicit confirmation only: preserves the old local intent and every Person reference.
    async confirmLocalShared(input: {
      tripId: string;
      localOperationId: string;
      operationId: string;
      confirmedDisplayNameSha256: string;
      dataOwnership: "CLOUD_SHARED_AUTHORED";
    }) {
      input = { ...input };
      coreUuid.parse(input.tripId);
      coreUuid.parse(input.localOperationId);
      coreUuid.parse(input.operationId);
      if (
        input.dataOwnership !== "CLOUD_SHARED_AUTHORED" ||
        input.localOperationId === input.operationId ||
        !/^[a-f0-9]{64}$/.test(input.confirmedDisplayNameSha256)
      )
        throw Error("PERSON_EXPLICIT_CONFIRMATION_REQUIRED");
      const scope = await captureAccountRequestContext(input.tripId, account);
      let request: PersonCloudCreate | undefined;
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(scope, account);
          const creator = await requireLocalTripPersonCreator(database, scope, account);
          const old = await database.getFirstAsync<{
            owner_user_id: string;
            trip_id: string;
            entity_id: string;
            entity_type: string;
            operation_type: string;
            idempotency_key: string;
            payload_json: string;
            status: string;
            attempt_count: number;
            claim_owner: string | null;
            lease_expires_at: string | null;
            last_request_id: string | null;
            last_attempt_at: string | null;
            first_failed_at: string | null;
            next_attempt_at: string | null;
            last_error_code: string | null;
            created_at: string;
            updated_at: string;
          }>(
            "SELECT * FROM sync_operations WHERE id=? AND owner_user_id=? AND trip_id=?",
            input.localOperationId,
            scope.accountId,
            scope.tripId,
          );
          if (!old || old.payload_json.length > 8192)
            throw Error("PERSON_LOCAL_CONFIRMATION_MISMATCH");
          const local = localPersonCreateSchema.parse(JSON.parse(old.payload_json));
          if (
            old.entity_type !== "TRIP_PERSON" ||
            old.operation_type !== localPersonCreateKind ||
            old.idempotency_key !== input.localOperationId ||
            local.operationId !== input.localOperationId ||
            local.accountId !== scope.accountId ||
            local.tripId !== scope.tripId ||
            local.personId !== old.entity_id ||
            local.personId === creator.personId ||
            local.tripCreateOperationId !== creator.operationId ||
            (await tripCoreSha256Hex(new TextEncoder().encode(local.displayName))) !==
              input.confirmedDisplayNameSha256
          )
            throw Error("PERSON_LOCAL_CONFIRMATION_MISMATCH");
          structuredTripCreateRequestSchema.parse({
            ...JSON.parse(creator.payload),
            operationId: creator.operationId,
          });
          request = personCloudCreateSchema.parse({
            version: 1,
            operationId: input.operationId,
            tripId: scope.tripId,
            personId: local.personId,
            tripCreateOperationId: creator.operationId,
            displayName: local.displayName,
            dataOwnership: input.dataOwnership,
          });
          const prior = await database.getFirstAsync<{
            owner_user_id: string;
            trip_id: string;
            entity_id: string;
            entity_type: string;
            operation_type: string;
            idempotency_key: string;
            payload_json: string;
          }>("SELECT * FROM sync_operations WHERE id=?", input.operationId);
          const other = await database.getFirstAsync<{ id: string }>(
            "SELECT id FROM sync_operations WHERE entity_type='TRIP_PERSON' AND operation_type=? AND entity_id=? AND id<>? LIMIT 1",
            personCloudCreateKind,
            local.personId,
            input.operationId,
          );
          if (other) throw Error("PERSON_CONFIRMATION_OPERATION_COLLISION");
          if (prior) {
            if (
              old.status !== "COMPLETED" ||
              old.last_error_code !== "PERSON_SHARED_CONFIRMED" ||
              prior.owner_user_id !== scope.accountId ||
              prior.trip_id !== scope.tripId ||
              prior.entity_id !== local.personId ||
              prior.entity_type !== "TRIP_PERSON" ||
              prior.operation_type !== personCloudCreateKind ||
              prior.idempotency_key !== input.operationId ||
              prior.payload_json !== json(request)
            )
              throw Error("PERSON_CONFIRMATION_OPERATION_COLLISION");
            await assertAccountRequestContext(scope, account);
            return;
          }
          const person = await database.getFirstAsync<{
            display_name: string;
            status: string;
            role: string | null;
            participation_revision: number | null;
            participation_active: number | null;
          }>(
            "SELECT * FROM ledger_members WHERE id=? AND journey_id=?",
            local.personId,
            scope.tripId,
          );
          if (
            old.status !== "DEPENDENCY_BLOCKED" ||
            old.attempt_count !== 0 ||
            old.last_error_code !== "PERSON_CREATE_HOSTED_UNAVAILABLE" ||
            old.claim_owner !== null ||
            old.lease_expires_at !== null ||
            old.last_request_id !== null ||
            old.last_attempt_at !== null ||
            old.first_failed_at !== null ||
            old.next_attempt_at !== null ||
            old.updated_at !== old.created_at ||
            !person ||
            person.display_name !== local.displayName ||
            person.status !== "local" ||
            person.role !== null ||
            person.participation_revision !== null ||
            person.participation_active !== null
          )
            throw Error("PERSON_LOCAL_CONFIRMATION_UNSAFE");
          const now = clock();
          const changed = await database.runAsync(
            "UPDATE sync_operations SET status='COMPLETED',failure_category=NULL,last_error_code='PERSON_SHARED_CONFIRMED',updated_at=? WHERE id=? AND owner_user_id=? AND trip_id=? AND entity_type='TRIP_PERSON' AND operation_type='TRIP_PERSON_CREATE' AND entity_id=? AND idempotency_key=? AND status='DEPENDENCY_BLOCKED' AND attempt_count=0 AND claim_owner IS NULL AND lease_expires_at IS NULL AND payload_json=?",
            now,
            input.localOperationId,
            scope.accountId,
            scope.tripId,
            local.personId,
            input.localOperationId,
            old.payload_json,
          );
          if (changed.changes !== 1) throw Error("PERSON_LOCAL_CONFIRMATION_CAS");
          await database.runAsync(
            "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,dependency_operation_id,last_error_code,created_at,updated_at) VALUES(?,?,'TRIP_PERSON',?,?,?,?,?,'DEPENDENCY_BLOCKED',0,?,'PERSON_CREATE_DEPENDENCY',?,?)",
            request.operationId,
            scope.tripId,
            request.personId,
            personCloudCreateKind,
            request.operationId,
            json(request),
            scope.accountId,
            creator.operationId,
            now,
            now,
          );
          await assertAccountRequestContext(scope, account);
        }),
      );
      announceLedgerQueueWorkAvailable();
      return request!;
    },
    async resume(context: AccountRequestContext, operationId: string) {
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(context, account);
          const row = await database.getFirstAsync<{
            payload_json: string;
            entity_id: string;
            idempotency_key: string;
          }>(
            "SELECT * FROM sync_operations WHERE id=? AND owner_user_id=? AND trip_id=? AND entity_type='TRIP_PERSON' AND operation_type=?",
            operationId,
            context.accountId,
            context.tripId,
            personCloudCreateKind,
          );
          if (!row) throw Error("PERSON_QUEUE_BINDING");
          const request = personCloudCreateSchema.parse(JSON.parse(row.payload_json));
          if (
            request.operationId !== operationId ||
            row.idempotency_key !== operationId ||
            request.personId !== row.entity_id ||
            request.tripId !== context.tripId
          )
            throw Error("PERSON_QUEUE_BINDING");
          await database.runAsync(
            "UPDATE sync_operations SET status='PENDING',last_error_code=NULL,failure_category=NULL,updated_at=? WHERE id=? AND owner_user_id=? AND status='DEPENDENCY_BLOCKED' AND dependency_operation_id=? AND EXISTS(SELECT 1 FROM sync_operations parent WHERE parent.id=? AND parent.owner_user_id=? AND parent.trip_id=? AND parent.operation_type='CREATE_TRIP' AND parent.status='COMPLETED')",
            clock(),
            operationId,
            context.accountId,
            request.tripCreateOperationId,
            request.tripCreateOperationId,
            context.accountId,
            context.tripId,
          );
          await assertAccountRequestContext(context, account);
        }),
      );
    },
    async accept(receiptInput: PersonCloudCreateReceipt, scope: AccountRequestContext) {
      const receipt = personCloudCreateReceiptSchema.parse(receiptInput);
      if (
        receipt.actorAccountId !== scope.accountId ||
        receipt.request.tripId !== scope.tripId
      )
        throw Error("PERSON_RECEIPT_CONTEXT");
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(scope, account);
          const row = await database.getFirstAsync<{
            payload_json: string;
            entity_type: string;
            operation_type: string;
            owner_user_id: string;
            entity_id: string;
            trip_id: string;
            idempotency_key: string;
          }>("SELECT * FROM sync_operations WHERE id=?", receipt.request.operationId);
          if (
            !row ||
            row.owner_user_id !== scope.accountId ||
            row.entity_type !== "TRIP_PERSON" ||
            row.operation_type !== personCloudCreateKind ||
            row.entity_id !== receipt.request.personId ||
            row.trip_id !== scope.tripId ||
            row.idempotency_key !== receipt.request.operationId ||
            row.payload_json !== json(receipt.request)
          )
            throw Error("PERSON_RECEIPT_INTENT_MISMATCH");
          const person = await database.getFirstAsync<{
            display_name: string;
            status: string;
            participation_revision: number | null;
          }>(
            "SELECT display_name,status,participation_revision FROM ledger_members WHERE id=? AND journey_id=?",
            receipt.person.personId,
            scope.tripId,
          );
          if (
            !person ||
            person.display_name !== receipt.person.displayName ||
            !["local", "unlinked"].includes(person.status) ||
            (person.participation_revision !== null &&
              person.participation_revision !== 0)
          )
            throw Error("PERSON_LOCAL_READBACK_CONFLICT");
          const prior = await database.getFirstAsync<{ receipt_json: string }>(
            "SELECT receipt_json FROM trip_person_cloud_create_receipts WHERE account_id=? AND operation_id=?",
            scope.accountId,
            receipt.request.operationId,
          );
          if (prior && prior.receipt_json !== json(receipt))
            throw Error("PERSON_RECEIPT_COLLISION");
          if (!prior)
            await database.runAsync(
              "INSERT INTO trip_person_cloud_create_receipts(account_id,operation_id,trip_id,person_id,request_json,receipt_json,accepted_at) VALUES(?,?,?,?,?,?,?)",
              scope.accountId,
              receipt.request.operationId,
              scope.tripId,
              receipt.request.personId,
              json(receipt.request),
              json(receipt),
              receipt.acceptedAt,
            );
          // No User ID, role grant, invitation or account link is inferred from a name.
          await database.runAsync(
            "UPDATE ledger_members SET status='unlinked',participation_active=1,participation_revision=0,updated_at=? WHERE id=? AND journey_id=? AND display_name=? AND status IN ('local','unlinked')",
            clock(),
            receipt.person.personId,
            scope.tripId,
            receipt.person.displayName,
          );
          await assertAccountRequestContext(scope, account);
        }),
      );
    },
  };
}
