import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import { ApiClientError, type ApiClientOptions } from "@/data/api/client";
import {
  assertAccountRequestContext,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import {
  tripMetadataReceiptSchema,
  tripMetadataUpdateSchema,
  type TripMetadataUpdate,
  type TripMetadataReceipt,
} from "@/domain/trip/tripMetadataContract";
export type TripMetadataTransport = {
  receipt(scope: AccountScope, operationId: string): Promise<TripMetadataReceipt | null>;
  update(scope: AccountScope, request: TripMetadataUpdate): Promise<TripMetadataReceipt>;
};
export function createTripMetadataTransport(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
): TripMetadataTransport {
  return {
    async receipt(scope, operationId) {
      await assertAccountRequestContext(scope, account);
      try {
        const result = await createAuthenticatedApiClient(
          options,
          tokenProvider,
          scope,
        ).get(`/v2/trip-metadata-operations/${operationId}`, tripMetadataReceiptSchema);
        await assertAccountRequestContext(scope, account);
        if (
          result.actorAccountId !== scope.accountId ||
          result.operationId !== operationId
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
      const request = tripMetadataUpdateSchema.parse(input);
      await assertAccountRequestContext(scope, account);
      const result = await createAuthenticatedApiClient(
        options,
        tokenProvider,
        scope,
      ).post(`/v2/trips/${request.tripId}/metadata`, request, tripMetadataReceiptSchema, {
        "Idempotency-Key": request.operationId,
      });
      await assertAccountRequestContext(scope, account);
      if (
        result.actorAccountId !== scope.accountId ||
        result.operationId !== request.operationId ||
        result.tripId !== request.tripId
      )
        throw new Error("TRIP_METADATA_RECEIPT_MISMATCH");
      return result;
    },
  };
}
