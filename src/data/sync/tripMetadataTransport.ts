import { tripMetadataRevisionedSnapshotSchema } from "@/domain/trip/tripMetadataV2Contract";
import { structuredTripMetadataSnapshotSchema } from "@/domain/trip/tripStructuredDestinationContract";
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
  metadataRequestFromReceipt,
  type TripMetadataWireUpdate,
  type TripMetadataWireReceipt,
  type TripMetadataV2Snapshot,
} from "@/domain/trip/tripMetadataV2Contract";
export type TripMetadataTransport = {
  receipt(
    scope: AccountScope,
    operationId: string,
    version?: 1 | 2 | 3,
  ): Promise<TripMetadataWireReceipt | null>;
  update(
    scope: AccountScope,
    request: TripMetadataWireUpdate,
  ): Promise<TripMetadataWireReceipt>;
  snapshot(
    scope: AccountScope,
    tripId: string,
    operationId: string,
    version?: 2 | 3,
  ): Promise<
    | TripMetadataV2Snapshot
    | import("zod").z.infer<typeof structuredTripMetadataSnapshotSchema>
  >;
};
export function createTripMetadataTransport(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
  dispatchGuard: () => void = () => {},
): TripMetadataTransport {
  const underlyingFetch = options.fetchImplementation ?? fetch;
  options = {
    ...options,
    fetchImplementation: async (input, init) => {
      dispatchGuard();
      const response = await underlyingFetch(input, init);
      dispatchGuard();
      return response;
    },
  };
  return {
    async receipt(scope, operationId, version = 1) {
      await assertAccountRequestContext(scope, account);
      dispatchGuard();
      try {
        const result = await createAuthenticatedApiClient(
          options,
          tokenProvider,
          scope,
        ).get(
          `/v2/trip-metadata-operations/${operationId}`,
          tripMetadataWireReceiptSchema,
          version !== 1 ? { "OTR-Trip-Metadata-Version": String(version) } : undefined,
        );
        await assertAccountRequestContext(scope, account);
        dispatchGuard();
        if (
          result.actorAccountId !== scope.accountId ||
          result.operationId !== operationId ||
          ("formatVersion" in result ? result.formatVersion : 1) !== version
        )
          throw new Error("TRIP_METADATA_RECEIPT_MISMATCH");
        return result;
      } catch (error) {
        await assertAccountRequestContext(scope, account);
        dispatchGuard();
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
      dispatchGuard();
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
          ...("formatVersion" in request
            ? { "OTR-Trip-Metadata-Version": String(request.formatVersion) }
            : {}),
        },
      );
      await assertAccountRequestContext(scope, account);
      dispatchGuard();
      if (
        result.actorAccountId !== scope.accountId ||
        canonicalCoreJson(metadataRequestFromReceipt(result) as Json) !==
          canonicalCoreJson(request as Json)
      )
        throw new Error("TRIP_METADATA_RECEIPT_MISMATCH");
      return result;
    },
    async snapshot(scope, tripId, operationId, version = 2) {
      coreUuid.parse(tripId);
      coreUuid.parse(operationId);
      await assertAccountRequestContext(scope, account);
      dispatchGuard();
      const result = await createAuthenticatedApiClient(
        options,
        tokenProvider,
        scope,
      ).get(`/v2/trips/${tripId}/metadata`, tripMetadataRevisionedSnapshotSchema, {
        "OTR-Trip-Metadata-Version": String(version),
        "OTR-Metadata-Operation-Id": operationId,
      });
      await assertAccountRequestContext(scope, account);
      dispatchGuard();
      if (
        result.formatVersion !== version ||
        result.actorAccountId !== scope.accountId ||
        result.tripId !== tripId
      )
        throw new Error("TRIP_METADATA_SNAPSHOT_MISMATCH");
      return result;
    },
  };
}
