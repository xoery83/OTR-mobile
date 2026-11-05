import type { z } from "zod";
import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import type { ApiClientOptions } from "@/data/api/client";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  selfNicknameContextSchema,
  selfNicknameObservationSchema,
  selfNicknameMutationResponseSchema,
  selfNicknameRecoverRequestSchema,
  selfNicknameRecoverResponseSchema,
  parseSelfNicknameCommand,
  parseSelfNicknameObservation,
  parseSelfNicknameMutationResponse,
  parseSelfNicknameRecoverResponse,
  type SelfNicknameCommand,
} from "@/domain/trip/tripPersonSelfNickname";
export type SelfNicknameRequestContext = AccountRequestContext &
  Readonly<{ personId: string }>;

// Explicit consumer only: no runtime caller, queue, optimistic save or automatic resubmission.
export function createSelfTripNicknameRepository(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  async function clientFor(input: SelfNicknameRequestContext) {
    const scope = Object.freeze({ ...input });
    const context = selfNicknameContextSchema.parse({
      accountId: scope.accountId,
      tripId: scope.tripId,
      personId: scope.personId,
    });
    await assertAccountRequestContext(scope, account);
    const client = createAuthenticatedApiClient(
      {
        ...options,
        maxResponseBytes: 65536,
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
    const path = `/v1/trips/${context.tripId}/persons/${context.personId}/self-nickname`;
    return { scope, context, client, path };
  }
  function mutate(
    input: SelfNicknameRequestContext,
    raw: SelfNicknameCommand,
    recovery: true,
  ): Promise<z.infer<typeof selfNicknameRecoverResponseSchema>>;
  function mutate(
    input: SelfNicknameRequestContext,
    raw: SelfNicknameCommand,
    recovery: false,
  ): Promise<z.infer<typeof selfNicknameMutationResponseSchema>>;
  async function mutate(
    input: SelfNicknameRequestContext,
    raw: SelfNicknameCommand,
    recovery: boolean,
  ) {
    // Copy before account/token awaits; caller cannot replace the original operation/CAS.
    const scope = Object.freeze({ ...input });
    const trusted = selfNicknameContextSchema.parse({
      accountId: scope.accountId,
      tripId: scope.tripId,
      personId: scope.personId,
    });
    const command = parseSelfNicknameCommand(raw, trusted);
    const { client, path } = await clientFor(scope);
    if (recovery) {
      const body = selfNicknameRecoverRequestSchema.parse({
        intentDigest: command.intentDigest,
      });
      const result = await client.post(
        `${path}/operations/${command.operationId}/recover`,
        body,
        selfNicknameRecoverResponseSchema,
      );
      await assertAccountRequestContext(scope, account);
      return parseSelfNicknameRecoverResponse(result, command, trusted);
    }
    const result = await client.post(
      `${path}/commands`,
      command,
      selfNicknameMutationResponseSchema,
      { "Idempotency-Key": command.operationId },
    );
    await assertAccountRequestContext(scope, account);
    return parseSelfNicknameMutationResponse(result, command, trusted);
  }
  return {
    async read(input: SelfNicknameRequestContext) {
      const { scope, context, client, path } = await clientFor(input);
      const result = await client.get(path, selfNicknameObservationSchema);
      await assertAccountRequestContext(scope, account);
      return parseSelfNicknameObservation(result, context);
    },
    execute: (scope: SelfNicknameRequestContext, command: SelfNicknameCommand) =>
      mutate(scope, command, false),
    recover: (scope: SelfNicknameRequestContext, original: SelfNicknameCommand) =>
      mutate(scope, original, true),
  };
}
export type SelfTripNicknameRepository = ReturnType<
  typeof createSelfTripNicknameRepository
>;
