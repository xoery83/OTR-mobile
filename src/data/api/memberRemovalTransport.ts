import { z } from "zod";
import { createAuthenticatedApiClient } from "./authenticatedClient";
import { ApiClientError, type ApiClientOptions } from "./client";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  coreMemberRevokeCommandSchema,
  validateCoreMemberRevokeReceipt,
  type CoreMemberRevokeCommand,
} from "@/domain/trip/tripCoreMemberAccess";
import type { ImportHash } from "@/domain/trip/flightImportReview";

const full = z.strictObject({
  projection: z.literal("FULL"),
  domainReceiptId: coreUuid,
  receipt: z.unknown(),
});

// Existing Core command/original Receipt routes only. No retry, queue or B cache mutation.
export function createMemberRemovalTransport(
  account: () => Promise<string>,
  hash: ImportHash,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  async function request(
    context: AccountRequestContext,
    input: CoreMemberRevokeCommand,
    recover: boolean,
  ) {
    context = Object.freeze({ ...context });
    const command = coreMemberRevokeCommandSchema.parse(input);
    coreUuid.parse(context.accountId);
    coreUuid.parse(context.tripId);
    await assertAccountRequestContext(context, account);
    if (
      command.tripId !== context.tripId ||
      command.payload.targetAccountId === context.accountId
    )
      throw Error("MEMBER_REMOVAL_SCOPE_MISMATCH");
    const client = createAuthenticatedApiClient(
      {
        ...options,
        maxResponseBytes: 16384,
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
    const path = `/v2/trips/${context.tripId}/core`;
    const headers = { "X-OTR-Core-Contract-Version": "2" };
    try {
      const projection = recover
        ? await client.get(`${path}/operations/${command.operationId}`, full, headers)
        : await client.post(`${path}/commands`, command, full, headers);
      await assertAccountRequestContext(context, account);
      const receipt = await validateCoreMemberRevokeReceipt(
        projection.receipt,
        context.accountId,
        context.tripId,
        command.operationId,
        hash,
        command,
      );
      await assertAccountRequestContext(context, account);
      return { ...projection, receipt };
    } catch (error) {
      await assertAccountRequestContext(context, account);
      if (recover && error instanceof ApiClientError && error.status === 404) return null;
      throw error;
    }
  }
  return {
    execute: (context: AccountRequestContext, command: CoreMemberRevokeCommand) =>
      request(context, command, false),
    recover: (context: AccountRequestContext, command: CoreMemberRevokeCommand) =>
      request(context, command, true),
  };
}
