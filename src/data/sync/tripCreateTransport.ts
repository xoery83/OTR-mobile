import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import { ApiClientError, type ApiClientOptions } from "@/data/api/client";
import {
  assertAccountRequestContext,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import {
  tripCreateWireResultSchema as tripCreateResultSchema,
  type TripCreateWireRequest as TripCreateRequest,
  type TripCreateWireResult as TripCreateResult,
} from "@/domain/trip/tripCreateWireContract";

export type TripCreateTransport = {
  receipt(
    scope: AccountScope,
    operationId: string,
    version?: 1 | 2,
  ): Promise<TripCreateResult | null>;
  create(scope: AccountScope, request: TripCreateRequest): Promise<TripCreateResult>;
};
export function createTripCreateTransport(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
  dispatchGuard: () => void = () => {},
): TripCreateTransport {
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
  const client = (scope: AccountScope) =>
    createAuthenticatedApiClient(options, tokenProvider, scope);
  return {
    async receipt(scope, operationId, version = 1) {
      await assertAccountRequestContext(scope, account);
      let result: TripCreateResult;
      try {
        result = await client(scope).get(
          `/v2/trip-create-operations/${operationId}`,
          tripCreateResultSchema,
          version === 2 ? { "OTR-Trip-Create-Version": "2" } : undefined,
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
      if (
        result.actorAccountId !== scope.accountId ||
        result.operationId !== operationId ||
        ("formatVersion" in result ? 2 : 1) !== version
      )
        throw new Error("TRIP_CREATE_RECEIPT_MISMATCH");
      return result;
    },
    async create(scope, request) {
      await assertAccountRequestContext(scope, account);
      const result = await client(scope).post(
        "/v2/trips",
        request,
        tripCreateResultSchema,
        {
          "Idempotency-Key": request.operationId,
          ...("formatVersion" in request ? { "OTR-Trip-Create-Version": "2" } : {}),
        },
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
