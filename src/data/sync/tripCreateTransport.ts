import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import { ApiClientError, type ApiClientOptions } from "@/data/api/client";
import {
  assertAccountRequestContext,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import {
  tripCreateResultSchema,
  type TripCreateRequest,
  type TripCreateResult,
} from "@/domain/trip/tripCreateContract";

export type TripCreateTransport = {
  receipt(scope: AccountScope, operationId: string): Promise<TripCreateResult | null>;
  create(scope: AccountScope, request: TripCreateRequest): Promise<TripCreateResult>;
};
export function createTripCreateTransport(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
): TripCreateTransport {
  const client = (scope: AccountScope) =>
    createAuthenticatedApiClient(options, tokenProvider, scope);
  return {
    async receipt(scope, operationId) {
      await assertAccountRequestContext(scope, account);
      let result: TripCreateResult;
      try {
        result = await client(scope).get(
          `/v2/trip-create-operations/${operationId}`,
          tripCreateResultSchema,
        );
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.status === 404 &&
          error.code === "TRIP_CREATE_RECEIPT_NOT_FOUND"
        )
          return null;
        throw error;
      }
      await assertAccountRequestContext(scope, account);
      if (result.actorAccountId !== scope.accountId || result.operationId !== operationId)
        throw new Error("TRIP_CREATE_RECEIPT_MISMATCH");
      return result;
    },
    async create(scope, request) {
      await assertAccountRequestContext(scope, account);
      const result = await client(scope).post(
        "/v2/trips",
        request,
        tripCreateResultSchema,
        { "Idempotency-Key": request.operationId },
      );
      await assertAccountRequestContext(scope, account);
      if (
        result.actorAccountId !== scope.accountId ||
        result.operationId !== request.operationId ||
        result.tripId !== request.tripId
      )
        throw new Error("TRIP_CREATE_RECEIPT_MISMATCH");
      return result;
    },
  };
}
