import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import type { ApiClientOptions } from "@/data/api/client";
import { createRequestBoundary, readBoundedJson, boundedJsonResponse } from "@/data/api/requestBoundary";
import { assertAccountRequestContext, type AccountRequestContext } from "@/data/auth/accountRequestContext";
import { generalInviteIssueSchema, generalInviteResultSchema, generalInviteRecoverySchema, generalInviteDeliverySchema,
  generalInviteReceiptForOriginal, type GeneralInviteIssue } from "@/data/api/generalInviteContracts";
import { coreUuid } from "@/domain/trip/tripCoreV2";

export function createGeneralInviteRepository(account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  async function scoped(input: AccountRequestContext) {
    const context = Object.freeze({ ...input }); coreUuid.parse(context.accountId); coreUuid.parse(context.tripId);
    await assertAccountRequestContext(context, account);
    const client = createAuthenticatedApiClient({ ...options, maxResponseBytes: 16384,
      fetchImplementation: async (url, init) => {
        await assertAccountRequestContext(context, account);
        const response = await (options.fetchImplementation ?? fetch)(url, { ...init, redirect: "error" });
        if (![403, 409, 503].includes(response.status) || String(url).endsWith("/delivery")) return response;
        const boundary = createRequestBoundary(options.timeoutMs ?? 15000, init?.signal ?? undefined);
        try {
          const raw = await readBoundedJson(response, 8192, boundary);
          await assertAccountRequestContext(context, account);
          const value = (String(url).endsWith("/recovery") ? generalInviteRecoverySchema : generalInviteResultSchema).safeParse(raw);
          if (value.success && ((response.status === 403 && value.data.status === "DENIED") ||
              (response.status === 409 && value.data.status === "CONFLICT") || (response.status === 503 && ["CLOSED", "UNAVAILABLE"].includes(value.data.status)))) return boundedJsonResponse(value.data);
          return boundedJsonResponse(raw, { status: response.status });
        } finally { boundary.close(); }
      },
    }, tokenProvider, context);
    return { context, client, path: `/v2/trips/${context.tripId}/general-invite-operations` };
  }
  return {
    async issue(contextInput: AccountRequestContext, input: GeneralInviteIssue) {
      const original = generalInviteIssueSchema.parse(input), { context, client, path } = await scoped(contextInput);
      const value = await client.post(path, original, generalInviteResultSchema, { "Idempotency-Key": original.operationId });
      await assertAccountRequestContext(context, account);
      if (value.status === "RECORDED") generalInviteReceiptForOriginal({ actorAccountId: context.accountId, tripId: context.tripId }, original, value.receipt);
      return value;
    },
    async recover(contextInput: AccountRequestContext, input: GeneralInviteIssue) {
      const original = generalInviteIssueSchema.parse(input), { context, client, path } = await scoped(contextInput);
      const value = await client.post(`${path}/recovery`, { operationId: original.operationId }, generalInviteRecoverySchema, { "Idempotency-Key": original.operationId });
      await assertAccountRequestContext(context, account);
      if (value.status === "FOUND") generalInviteReceiptForOriginal({ actorAccountId: context.accountId, tripId: context.tripId }, original, value.receipt);
      return value;
    },
    // Sensitive token is transient for explicit Native Share only; no receipt/checkpoint caching.
    async delivery(contextInput: AccountRequestContext, input: GeneralInviteIssue, receipt: unknown) {
      const original = generalInviteIssueSchema.parse(input), { context, client, path } = await scoped(contextInput);
      const accepted = generalInviteReceiptForOriginal({ actorAccountId: context.accountId, tripId: context.tripId }, original, receipt);
      const value = await client.post(`${path}/delivery`, { operationId: original.operationId }, generalInviteDeliverySchema, { "Idempotency-Key": original.operationId });
      await assertAccountRequestContext(context, account);
      if (value.accountId !== context.accountId || value.tripId !== context.tripId || value.operationId !== original.operationId ||
          value.inviteId !== accepted.inviteId || Date.parse(value.expiresAt) !== Date.parse(accepted.expiresAt)) throw Error("GENERAL_INVITE_DELIVERY_BINDING");
      return value;
    },
  };
}
