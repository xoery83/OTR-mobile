import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import type { ApiClientOptions } from "@/data/api/client";
import {
  memberClaimCommandSchema,
  memberClaimOutcomeSchema,
  memberClaimRecoverySchema,
  type MemberClaimCommand,
} from "@/data/api/memberClaimContracts";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { coreUuid } from "@/domain/trip/tripCoreV2";

// Online authority only. Caller retains the original command across UNKNOWN; no optimistic queue or retry here.
export function createMemberClaimRepository(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  async function send(
    input: AccountRequestContext,
    original: MemberClaimCommand,
    recovery: boolean,
  ) {
    const context = Object.freeze({ ...input });
    coreUuid.parse(context.accountId);
    coreUuid.parse(context.tripId);
    const command = memberClaimCommandSchema.parse(original);
    if (command.tripId !== context.tripId) throw Error("MEMBER_CLAIM_SCOPE_MISMATCH");
    await assertAccountRequestContext(context, account);
    const client = createAuthenticatedApiClient(
      {
        ...options,
        maxResponseBytes: 8192,
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
    const result = await client.post(
      `/v2/trips/${context.tripId}/member-claim-operations${recovery ? "/recovery" : ""}`,
      command,
      recovery ? memberClaimRecoverySchema : memberClaimOutcomeSchema,
      { "Idempotency-Key": command.operationId },
    );
    await assertAccountRequestContext(context, account);
    if (result.status === "ABSENT_UNCONFIRMED") return result;
    const compatible =
      command.kind === "ISSUE_TARGETED_INVITE"
        ? result.status === "ISSUED"
        : command.kind === "REVOKE_UNCLAIMED_INVITE"
          ? result.status === "INVITE_REVOKED"
          : result.status === "LINKED" || result.status === "ALREADY_LINKED";
    if (
      !compatible ||
      result.personId !== command.personId ||
      (command.kind !== "ISSUE_TARGETED_INVITE" && result.inviteId !== command.inviteId)
    )
      throw Error("MEMBER_CLAIM_RESULT_MISMATCH");
    // Historical disposition and current access only; Native must refresh through the owning Core Reader.
    return result;
  }
  return {
    execute: (context: AccountRequestContext, command: MemberClaimCommand) =>
      send(context, command, false),
    recover: (context: AccountRequestContext, original: MemberClaimCommand) =>
      send(context, original, true),
  };
}
