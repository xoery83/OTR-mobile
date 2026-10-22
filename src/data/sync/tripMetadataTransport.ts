import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import { ApiClientError, type ApiClientOptions } from "@/data/api/client";
import {
  assertAccountRequestContext,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import {
  tripMetadataWireReceiptSchema,
  tripMetadataWireUpdateSchema,
  tripMetadataV2SnapshotSchema,
  metadataRequestFromReceipt,
  type TripMetadataWireUpdate,
  type TripMetadataWireReceipt,
  type TripMetadataV2Snapshot,
} from "@/domain/trip/tripMetadataV2Contract";
export type TripMetadataTransport = {
  receipt(
    scope: AccountScope,
    operationId: string,
    version?: 1 | 2,
  ): Promise<TripMetadataWireReceipt | null>;
  update(
    scope: AccountScope,
    request: TripMetadataWireUpdate,
  ): Promise<TripMetadataWireReceipt>;
  snapshot(
    scope: AccountScope,
    tripId: string,
    operationId: string,
  ): Promise<TripMetadataV2Snapshot>;
};
export function createTripMetadataTransport(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
): TripMetadataTransport {
  return {
    async receipt(scope, operationId, version = 1) {
      await assertAccountRequestContext(scope, account);
      try {
        const result = await createAuthenticatedApiClient(
          options,
          tokenProvider,
          scope,
        ).get(
          `/v2/trip-metadata-operations/${operationId}`,
          tripMetadataWireReceiptSchema,
          version === 2 ? { "OTR-Trip-Metadata-Version": "2" } : undefined,
        );
        await assertAccountRequestContext(scope, account);
        if (
          result.actorAccountId !== scope.accountId ||
          result.operationId !== operationId ||
          ("formatVersion" in result ? 2 : 1) !== version
        )
          throw new Error("TRIP_METADATA_RECEIPT_MISMATCH");
        return result;
      } catch (error) {
        await assertAccountRequestContext(scope, account);
        if (
          error instanceof ApiClientError &&
          error.status === 404 &&
          error.code === "TRIP_METADATA_RECEIPT_NOT_FOUND"
        )
          return null;
        throw error;
      }
    },
    async update(scope, input) {
      const request = tripMetadataWireUpdateSchema.parse(input);
      await assertAccountRequestContext(scope, account);
      const result = await createAuthenticatedApiClient(
        options,
        tokenProvider,
        scope,
      ).post(
        `/v2/trips/${request.tripId}/metadata`,
        request,
        tripMetadataWireReceiptSchema,
        {
          "Idempotency-Key": request.operationId,
          ...("formatVersion" in request ? { "OTR-Trip-Metadata-Version": "2" } : {}),
        },
      );
      await assertAccountRequestContext(scope, account);
      if (
        result.actorAccountId !== scope.accountId ||
        canonicalCoreJson(metadataRequestFromReceipt(result) as Json) !==
          canonicalCoreJson(request as Json)
      )
        throw new Error("TRIP_METADATA_RECEIPT_MISMATCH");
      return result;
    },
    async snapshot(scope, tripId, operationId) {
      coreUuid.parse(tripId);
      coreUuid.parse(operationId);
      await assertAccountRequestContext(scope, account);
      const result = await createAuthenticatedApiClient(
        options,
        tokenProvider,
        scope,
      ).get(`/v2/trips/${tripId}/metadata`, tripMetadataV2SnapshotSchema, {
        "OTR-Trip-Metadata-Version": "2",
        "OTR-Metadata-Operation-Id": operationId,
      });
      await assertAccountRequestContext(scope, account);
      if (result.actorAccountId !== scope.accountId || result.tripId !== tripId)
        throw new Error("TRIP_METADATA_SNAPSHOT_MISMATCH");
      return result;
    },
  };
}
