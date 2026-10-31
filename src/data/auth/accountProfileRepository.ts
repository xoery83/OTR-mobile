import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import type { ApiClientOptions } from "@/data/api/client";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  privateAccountProfilePath,
  privateAccountProfileMutationSchema,
  privateAccountProfileReceiptSchema,
  privateAccountProfileSnapshotSchema,
  type PrivateAccountProfileMutation,
} from "@/data/api/privateAccountProfileContracts";
import {
  accountProfileBootstrapPath,
  accountProfileBootstrapSchema,
} from "@/data/api/accountProfileContracts";
import { assertAccountRequestContext, type AccountScope } from "./accountRequestContext";
import { createPrivateProfileLocalStore, type PrivateProfileDatabase } from "./privateAccountProfileLocal";

// Online sync preflight only. Launch/offline Session restoration must not await it.
export function createAccountProfileRepository(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
  localDatabase?: PrivateProfileDatabase,
) {
  const local = localDatabase ? createPrivateProfileLocalStore(localDatabase, account) : undefined;
  async function privateClient(input: AccountScope) {
    const scope = Object.freeze({ ...input });
    await assertAccountRequestContext(scope, account);
    const client = createAuthenticatedApiClient(
      {
        ...options,
        maxResponseBytes: 65536,
        fetchImplementation: async (target, init) => {
          await assertAccountRequestContext(scope, account);
          return (options.fetchImplementation ?? fetch)(target, {
            ...init,
            redirect: "error",
          });
        },
      },
      tokenProvider,
      scope,
    );
    return { scope, client };
  }
  return {
    local: local ? { read: local.read, saveDraft: local.saveDraft } : undefined,
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
    // Optional private-profile API candidate; no Native caller or storage activation.
    async readPrivate(input: AccountScope) {
      const { scope, client } = await privateClient(input);
      const result = await client.get(
        privateAccountProfilePath,
        privateAccountProfileSnapshotSchema,
      );
      await assertAccountRequestContext(scope, account);
      if (result.accountId !== scope.accountId)
        throw Error("ACCOUNT_PROFILE_IDENTITY_REQUIRED");
      await local?.cacheServer(scope, result);
      await assertAccountRequestContext(scope, account);
      return result;
    },
    async savePrivate(input: AccountScope, mutation: PrivateAccountProfileMutation) {
      const request = privateAccountProfileMutationSchema.parse(mutation);
      const { scope, client } = await privateClient(input);
      const result = await client.post(
        privateAccountProfilePath + "/operations",
        request,
        privateAccountProfileReceiptSchema,
        { "Idempotency-Key": request.operationId },
      );
      await assertAccountRequestContext(scope, account);
      if (
        result.accountId !== scope.accountId ||
        result.operationId !== request.operationId ||
        result.revision !== request.expectedRevision + 1
      )
        throw Error("ACCOUNT_PROFILE_RECEIPT_REQUIRED");
      return result;
    },
    async privateReceipt(input: AccountScope, operationId: string) {
      const operation = coreUuid.parse(operationId);
      const { scope, client } = await privateClient(input);
      const result = await client.get(
        privateAccountProfilePath + "/operations/" + operation,
        privateAccountProfileReceiptSchema,
      );
      await assertAccountRequestContext(scope, account);
      if (result.accountId !== scope.accountId || result.operationId !== operation)
        throw Error("ACCOUNT_PROFILE_RECEIPT_REQUIRED");
      return result;
    },
  };
}
