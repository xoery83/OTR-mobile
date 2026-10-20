import { createAuthenticatedApiClient } from "./authenticatedClient";
import { ApiClientError, type ApiClientOptions } from "./client";
import {
  assertAccountRequestContext,
  captureAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { participationCapabilitiesSchema } from "@/domain/trip/personParticipationRuntime";
import {
  participationCommandSchema,
  participationResultSchema,
  participationIntentBytes,
  participationResultBytes,
  participationCommandsEnabled,
  type ParticipationCommand,
} from "@/domain/trip/personParticipationCommand";
import { hashTripPersonBytes } from "@/data/repositories/tripPersonCertificate";
export function createTripPersonParticipationTransport(
  getUserId: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  const api = (context: AccountRequestContext) =>
    createAuthenticatedApiClient(options, tokenProvider, context);
  async function validate(command: ParticipationCommand, context: AccountRequestContext) {
    participationCommandSchema.parse(command);
    if (
      context.accountId !== command.actorUserId ||
      context.tripId !== command.tripId ||
      (await hashTripPersonBytes(participationIntentBytes(command))) !==
        command.intentDigest
    )
      throw new Error("Participation request binding mismatch.");
    await assertAccountRequestContext(context, getUserId);
  }
  async function request(
    command: ParticipationCommand,
    context: AccountRequestContext,
    post: boolean,
  ) {
    await validate(command, context);
    const path = `/v2/trips/${command.tripId}/`;
    let data;
    try {
      data = post
        ? await api(context).post(
            path + `persons/${command.personId}/participation-commands`,
            command,
            participationResultSchema,
            { "Idempotency-Key": command.operationId },
          )
        : await api(context).get(
            path + `person-participation-operations/${command.operationId}`,
            participationResultSchema,
          );
    } catch (error) {
      await assertAccountRequestContext(context, getUserId);
      throw error;
    }
    const r = data.receipt;
    if (
      r.actorUserId !== context.accountId ||
      r.tripId !== command.tripId ||
      r.personId !== command.personId ||
      r.operationId !== command.operationId ||
      r.intentDigest !== command.intentDigest ||
      r.expectedParticipation.revision !== command.expectedParticipation.revision ||
      r.expectedParticipation.isParticipating !==
        command.expectedParticipation.isParticipating ||
      r.desiredParticipation !== command.isParticipating ||
      (command.actorMemberId !== null && command.actorMemberId !== r.actorMemberId) ||
      (await hashTripPersonBytes(participationResultBytes(r))) !== data.resultDigest
    )
      throw new Error("Participation response binding mismatch.");
    await assertAccountRequestContext(context, getUserId);
    return { context, data };
  }
  return {
    async capabilities(tripId: string) {
      // Same canonical UUID schema used by the command contracts.
      participationCommandSchema.shape.tripId.parse(tripId);
      const context = await captureAccountRequestContext(tripId, getUserId);
      const data = await api(context).get(
        `/v2/trips/${tripId}/person-participation-capabilities`,
        participationCapabilitiesSchema,
      );
      await assertAccountRequestContext(context, getUserId);
      return { context, data };
    },
    async submit(command: ParticipationCommand) {
      const context = await captureAccountRequestContext(command.tripId, getUserId);
      await validate(command, context);
      if (!participationCommandsEnabled)
        throw new ApiClientError(
          "Participation commands are disabled.",
          "http",
          503,
          "PARTICIPATION_COMMANDS_DISABLED",
        );
      return request(command, context, true);
    },
    async receipt(command: ParticipationCommand, context?: AccountRequestContext) {
      return request(
        command,
        context ?? (await captureAccountRequestContext(command.tripId, getUserId)),
        false,
      );
    },
  };
}
