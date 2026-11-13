import { authorizedTripVersionSchema } from "@/domain/trip/tripAuthorizedVersion";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { createAuthenticatedApiClient } from "./authenticatedClient";
import type { ApiClientOptions } from "./client";

// Unmounted until the owning Backend endpoint is qualified and deployed.
export function createTripAuthorizedVersionTransport(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  return {
    async read(context: AccountRequestContext) {
      await assertAccountRequestContext(context, account);
      const result = await createAuthenticatedApiClient(
        { ...options, maxResponseBytes: 4096 },
        tokenProvider,
        context,
      ).get(
        `/v2/trips/${coreUuid.parse(context.tripId)}/core/authorized-version`,
        authorizedTripVersionSchema,
        { "X-OTR-Core-Contract-Version": "2", "X-OTR-Core-Local-Document": "1" },
      );
      await assertAccountRequestContext(context, account);
      if (result.actorAccountId !== context.accountId || result.tripId !== context.tripId)
        throw Error("CORE_VERSION_SCOPE_MISMATCH");
      return result;
    },
  };
}
