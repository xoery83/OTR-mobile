import { structuredTripCreateRequestSchema } from "@/domain/trip/tripStructuredDestinationContract";
import type { LedgerReadDatabase } from "./ledgerReadRepository";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { requireLocalTripPersonCreator } from "./localTripPersonRepository";
import {
  personCloudCreateKind,
  personCloudCreateSchema,
  personCloudCreateReceiptSchema,
  type PersonCloudCreate,
  type PersonCloudCreateReceipt,
} from "@/domain/trip/tripPersonCloudCreate";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
const json = (v: unknown) => canonicalCoreJson(v as Json);
export async function retainAuthoredCloudTravelerWithinTransaction(
  database: LedgerReadDatabase,
  scope: AccountRequestContext,
  account: () => Promise<string>,
  input: Omit<PersonCloudCreate, "version" | "tripCreateOperationId">,
  clock = () => new Date().toISOString(),
) {
  if (input.tripId !== scope.tripId || input.dataOwnership !== "CLOUD_SHARED_AUTHORED")
    throw Error("PERSON_EXPLICIT_AUTHORING_REQUIRED");
  if (
    !(await database.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='trip_person_cloud_create_receipts'",
    ))
  )
    throw Error("PERSON_RECEIPT_STORAGE_REQUIRED");
  const creator = await requireLocalTripPersonCreator(database, scope, account);
  structuredTripCreateRequestSchema.parse({
    ...JSON.parse(creator.payload),
    operationId: creator.operationId,
  });
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
    "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,dependency_operation_id,last_error_code,created_at,updated_at) VALUES(?,?,'TRIP_PERSON',?,?,?,?,?,'DEPENDENCY_BLOCKED',0,?,'PERSON_CREATE_DEPENDENCY',?,?)",
    request.operationId,
    request.tripId,
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
  return request;
}

export function createTripPersonCloudCreateRepository(
  database: LedgerReadDatabase,
  account: () => Promise<string>,
  clock = () => new Date().toISOString(),
) {
  return {
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
