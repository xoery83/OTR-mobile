import { createAuthenticatedApiClient } from "../api/authenticatedClient";
import { ApiClientError } from "../api/client";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  personCloudCreateKind,
  personCloudCreateSchema,
  personCloudCreateReceiptSchema,
  type PersonCloudCreate,
  type PersonCloudCreateReceipt,
} from "@/domain/trip/tripPersonCloudCreate";
import type { createTripPersonCloudCreateRepository } from "../repositories/tripPersonCloudCreateRepository";
import type { SyncWorker } from "./syncEngine";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
export type PersonCloudTransport = {
  receipt(
    scope: AccountRequestContext,
    operationId: string,
  ): Promise<PersonCloudCreateReceipt | null>;
  create(
    scope: AccountRequestContext,
    request: PersonCloudCreate,
  ): Promise<PersonCloudCreateReceipt>;
};
export function createPersonCloudTransport(
  account: () => Promise<string>,
  enabled: () => boolean,
): PersonCloudTransport {
  const guard = async (scope: AccountRequestContext) => {
    await assertAccountRequestContext(scope, account);
    if (!enabled()) throw Error("PERSON_PORT_CLOSED");
  };
  return {
    async receipt(scope, operation) {
      await guard(scope);
      try {
        const result = await createAuthenticatedApiClient(
          {
            fetchImplementation: async (input, init) => {
              await guard(scope);
              const response = await fetch(input, init);
              await guard(scope);
              return response;
            },
          },
          undefined,
          scope,
        ).get(
          `/v2/trips/${scope.tripId}/person-create-operations/${operation}`,
          personCloudCreateReceiptSchema,
        );
        await guard(scope);
        return result;
      } catch (e) {
        await guard(scope);
        if (
          e instanceof ApiClientError &&
          e.status === 404 &&
          e.code === "PERSON_CREATE_NOT_FOUND"
        )
          return null;
        throw e;
      }
    },
    async create(scope, request) {
      await guard(scope);
      const result = await createAuthenticatedApiClient(
        {
          fetchImplementation: async (input, init) => {
            await guard(scope);
            const response = await fetch(input, init);
            await guard(scope);
            return response;
          },
        },
        undefined,
        scope,
      ).post(
        `/v2/trips/${scope.tripId}/people`,
        request,
        personCloudCreateReceiptSchema,
        { "Idempotency-Key": request.operationId },
      );
      await guard(scope);
      return result;
    },
  };
}
export function createPersonCloudSyncWorker(
  repository: Pick<ReturnType<typeof createTripPersonCloudCreateRepository>, "accept">,
  transport: PersonCloudTransport,
  account: () => Promise<string>,
): SyncWorker {
  return {
    async push(op) {
      if (
        op.entityType !== "TRIP_PERSON" ||
        op.operationType !== personCloudCreateKind ||
        op.id !== op.idempotencyKey ||
        !op.tripId
      )
        throw Error("PERSON_QUEUE_BINDING");
      const scope = await captureAccountRequestContext(op.tripId, account);
      if (scope.accountId !== op.ownerUserId) throw Error("PERSON_ACCOUNT_CHANGED");
      const request = personCloudCreateSchema.parse(JSON.parse(op.payloadJson));
      if (
        request.personId !== op.entityId ||
        request.operationId !== op.id ||
        request.tripId !== op.tripId
      )
        throw Error("PERSON_QUEUE_BINDING");
      let result = await transport.receipt(scope, op.id);
      await assertAccountRequestContext(scope, account);
      if (!result) result = await transport.create(scope, request);
      await assertAccountRequestContext(scope, account);
      // An immutable acceptance alone is insufficient to qualify participants: reconcile via the owning read endpoint.
      const readback = await transport.receipt(scope, op.id);
      await assertAccountRequestContext(scope, account);
      if (
        !readback ||
        canonicalCoreJson(result as unknown as Json) !==
          canonicalCoreJson(readback as unknown as Json) ||
        readback.actorAccountId !== scope.accountId ||
        canonicalCoreJson(readback.request as unknown as Json) !==
          canonicalCoreJson(request as unknown as Json)
      )
        throw Error("PERSON_READBACK_MISMATCH");
      await repository.accept(readback, scope);
    },
  };
}
