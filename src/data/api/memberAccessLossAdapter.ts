import { createAuthenticatedApiClient } from "./authenticatedClient";
import { ApiClientError, type ApiClientOptions } from "./client";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { coreAccessLossSchema } from "@/domain/trip/tripCoreMemberAccess";

// B's own authenticated observation only. No A receipt, optimistic denial or mutation queue.
export function createMemberAccessLossAdapter(
  account: () => Promise<string>,
  cache: Pick<ReturnType<typeof createTripCoreV2Repository>, "revoke">,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  return async (input: AccountRequestContext) => {
    const context = Object.freeze({ ...input });
    coreUuid.parse(context.accountId);
    coreUuid.parse(context.tripId);
    await assertAccountRequestContext(context, account);
    const client = createAuthenticatedApiClient(
      {
        ...options,
        maxResponseBytes: 4096,
        fetchImplementation: async (url, init) => {
          await assertAccountRequestContext(context, account);
          return (options.fetchImplementation ?? fetch)(url, {
            ...init,
            redirect: "error",
          });
        },
      },
      tokenProvider,
      context,
    );
    let loss;
    try {
      loss = await client.get(
        `/v2/trips/${context.tripId}/core/access-loss`,
        coreAccessLossSchema,
        { "X-OTR-Core-Contract-Version": "2" },
      );
    } catch (error) {
      await assertAccountRequestContext(context, account);
      if (error instanceof ApiClientError && error.status === 404)
        return { status: "ABSENT_UNCONFIRMED" as const };
      throw error;
    }
    await assertAccountRequestContext(context, account);
    if (loss.accountId !== context.accountId || loss.tripId !== context.tripId)
      throw Error("MEMBER_ACCESS_LOSS_SCOPE_MISMATCH");
    await cache.revoke(context, loss.coreReference.accessRevision);
    await assertAccountRequestContext(context, account);
    return { status: "ACCESS_REVOKED" as const, observation: loss };
  };
}
