import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import type { ApiClientOptions } from "@/data/api/client";
import {
  accountProfileBootstrapPath,
  accountProfileBootstrapSchema,
} from "@/data/api/accountProfileContracts";
import { assertAccountRequestContext, type AccountScope } from "./accountRequestContext";

// Online sync preflight only. Launch/offline Session restoration must not await it.
export function createAccountProfileRepository(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  return {
    async ensure(input: AccountScope) {
      const scope = Object.freeze({ ...input });
      await assertAccountRequestContext(scope, account);
      const client = createAuthenticatedApiClient(
        { ...options, maxResponseBytes: 4096 },
        tokenProvider,
        scope,
      );
      const result = await client.post(
        accountProfileBootstrapPath,
        {},
        accountProfileBootstrapSchema,
      );
      await assertAccountRequestContext(scope, account);
      if (result.accountId !== scope.accountId)
        throw Error("ACCOUNT_PROFILE_IDENTITY_REQUIRED");
      return result;
    },
  };
}
