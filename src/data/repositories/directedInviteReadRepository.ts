import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import type { ApiClientOptions } from "@/data/api/client";
import {
  directedInviteRecipientsSchema,
  directedIncomingInvitationsSchema,
  directedInvitationDetailSchema,
} from "@/data/api/directedInviteReadContracts";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import { coreUuid } from "@/domain/trip/tripCoreV2";

// Proposed normal reader ABI; no caller/runtime mount until the owning server readers are qualified.
export function createDirectedInviteReadRepository(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  function client(scope: AccountScope) {
    return createAuthenticatedApiClient(
      {
        ...options,
        maxResponseBytes: 196608,
        fetchImplementation: async (url, init) => {
          await assertAccountRequestContext(scope, account);
          return (options.fetchImplementation ?? fetch)(url, {
            ...init,
            redirect: "error",
          });
        },
      },
      tokenProvider,
      scope,
    );
  }
  return {
    async incoming(input: AccountScope) {
      const context = Object.freeze({ ...input });
      coreUuid.parse(context.accountId);
      await assertAccountRequestContext(context, account);
      const result = await client(context).get(
        "/v1/account/directed-invitations",
        directedIncomingInvitationsSchema,
      );
      await assertAccountRequestContext(context, account);
      if (result.accountId !== context.accountId)
        throw Error("DIRECTED_INCOMING_SCOPE_MISMATCH");
      return result;
    },
    async recipients(input: AccountRequestContext) {
      const context = Object.freeze({ ...input });
      coreUuid.parse(context.accountId);
      coreUuid.parse(context.tripId);
      await assertAccountRequestContext(context, account);
      const result = await client(context).get(
        `/v2/trips/${context.tripId}/directed-invite-recipients`,
        directedInviteRecipientsSchema,
      );
      await assertAccountRequestContext(context, account);
      if (result.accountId !== context.accountId || result.tripId !== context.tripId)
        throw Error("DIRECTED_INVITE_RECIPIENT_SCOPE_MISMATCH");
      return result;
    },
    async invitation(input: AccountScope, inviteId: string) {
      const context = Object.freeze({ ...input });
      coreUuid.parse(context.accountId);
      coreUuid.parse(inviteId);
      await assertAccountRequestContext(context, account);
      const result = await client(context).get(
        `/v1/account/directed-invitations/${inviteId}`,
        directedInvitationDetailSchema,
      );
      await assertAccountRequestContext(context, account);
      if (
        result.accountId !== context.accountId ||
        result.invitation.inviteId !== inviteId
      )
        throw Error("DIRECTED_INVITATION_SCOPE_MISMATCH");
      // Invitation status is not an accepted Person, membership, role or Item-access grant.
      return result;
    },
  };
}
