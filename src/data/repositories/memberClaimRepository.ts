import { ApiClientError } from "@/data/api/client";
import { createRequestBoundary, readBoundedJson, boundedJsonResponse } from "@/data/api/requestBoundary";
import { z } from "zod";
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

export class MemberClaimNoCommitError extends ApiClientError {
  constructor(
    public readonly rejection: "CLOSED_BEFORE_AUTHORITY" | "DENIED_WITHOUT_MUTATION",
  ) {
    super(
      "Member claim was rejected before mutation.",
      "http",
      rejection === "CLOSED_BEFORE_AUTHORITY" ? 503 : 403,
      rejection === "CLOSED_BEFORE_AUTHORITY"
        ? "MEMBER_CLAIM_CLOSED"
        : "MEMBER_CLAIM_DENIED",
    );
  }
}

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
          const response = await (options.fetchImplementation ?? fetch)(url, {
            ...init,
            redirect: "error",
          });
          if (recovery || ![403, 503].includes(response.status)) return response;
          // Extract only exact owning refusal metadata here; shared transport deliberately strips error bodies.
          const boundary = createRequestBoundary(
            options.timeoutMs ?? 15000,
            init?.signal ?? undefined,
          );
          try {
            const payload = await readBoundedJson(response, 8192, boundary);
            await assertAccountRequestContext(context, account);
            if (
              response.status === 503 &&
              z
                .strictObject({
                  error: z.strictObject({ code: z.literal("MEMBER_CLAIM_CLOSED") }),
                })
                .safeParse(payload).success
            )
              throw new MemberClaimNoCommitError("CLOSED_BEFORE_AUTHORITY");
            if (
              response.status === 403 &&
              z.strictObject({ status: z.literal("DENIED") }).safeParse(payload).success
            )
              throw new MemberClaimNoCommitError("DENIED_WITHOUT_MUTATION");
            return boundedJsonResponse(payload, {
              status: response.status,
              headers: response.headers,
            });
          } finally {
            boundary.close();
          }
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
