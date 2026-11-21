import { z } from "zod";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import type { ApiClientOptions } from "@/data/api/client";
import { createRequestBoundary, readBoundedJson, boundedJsonResponse } from "@/data/api/requestBoundary";
import { assertAccountRequestContext, type AccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  claimResolutionCommandSchema, claimResolutionResultSchema, claimResolutionRecoverySchema,
  claimResolutionReceiptSchema, claimRequestSnapshotSchema, pendingClaimPreviewInputSchema,
  pendingClaimPreviewSchema, claimResolutionIntentText, type ClaimResolutionCommand,
  claimResolutionRequestViewSchema,
  claimResolutionRequestIndexSchema,
  claimCreatePersonContextSchema,
} from "@/data/api/claimResolutionContracts";
import { claimProvisionalViewSchema } from "@/data/api/claimProvisionalContracts";
import { parseCoreJson } from "@/domain/trip/tripCoreV2Json";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { claimOriginVerificationInputSchema, claimOriginVerificationSchema, claimGeneralInitialPersonsInputSchema, claimGeneralInitialPersonsSchema } from "@/data/api/claimOriginContracts";

export const resolutionIntentDigest = (scope: AccountRequestContext, command: ClaimResolutionCommand) =>
  bytesToHex(sha256(claimResolutionIntentText({ actorAccountId: scope.accountId, tripId: scope.tripId }, command)));

export function resolutionReceiptForCommand(scope: AccountRequestContext, command: ClaimResolutionCommand, input: unknown) {
  const receipt = claimResolutionReceiptSchema.parse(input);
  const expected = command.kind === "SUBMIT_PENDING_CLAIM" ? "PENDING_REVIEW"
    : command.kind === "CONSENT_TO_RESOLUTION" ? "LINKED"
      : command.decision.kind === "CONFIRM" ? "LINKED"
        : command.decision.kind === "REJECT" ? "REJECTED" : "AWAITING_CONSENT";
  if (receipt.actorAccountId !== scope.accountId || receipt.tripId !== scope.tripId ||
      receipt.operationId !== command.operationId || receipt.requestId !== command.requestId ||
      receipt.commandKind !== command.kind || receipt.beforeRevision !== command.expectedRevision ||
      receipt.intentDigest !== resolutionIntentDigest(scope, command) ||
      (receipt.outcome !== expected && receipt.outcome !== "EXPIRED"))
    throw Error("CLAIM_RESOLUTION_RECEIPT_SCOPE_MISMATCH");
  return receipt;
}

// Existing authenticated transport only; execution must be checkpointed by memberClaimAttemptRepository.
export function createClaimResolutionRepository(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  async function scoped(input: AccountRequestContext, responseOptions: Pick<ApiClientOptions, "maxResponseBytes" | "parseBoundedResponseText"> = { maxResponseBytes: 131072 }) {
    const context = Object.freeze({ ...input });
    coreUuid.parse(context.accountId); coreUuid.parse(context.tripId);
    await assertAccountRequestContext(context, account);
    const client = createAuthenticatedApiClient({
      // Fifty Unicode labels need128KiB; provisional graph uses the existing Core1MiB budget/codec.
      ...options, ...responseOptions,
      fetchImplementation: async (url, init) => {
        await assertAccountRequestContext(context, account);
        const response = await (options.fetchImplementation ?? fetch)(url, { ...init, redirect: "error" });
        if (![403, 404, 409, 503].includes(response.status)) return response;
        const boundary = createRequestBoundary(options.timeoutMs ?? 15000, init?.signal ?? undefined);
        try {
          const payload = await readBoundedJson(response, 8192, boundary);
          await assertAccountRequestContext(context, account);
          const absent = z.strictObject({ error: z.strictObject({ code: z.enum(["CLAIM_REQUEST_NOT_VISIBLE", "CLAIM_ORIGIN_NOT_VISIBLE"]) }) }).safeParse(payload);
          if (response.status === 404 && absent.success)
            return boundedJsonResponse(null);
          const result = (String(url).endsWith("/recovery") ? claimResolutionRecoverySchema : claimResolutionResultSchema).safeParse(payload);
          if (result.success && ((response.status === 403 && result.data.status === "DENIED") ||
              (response.status === 409 && result.data.status === "CONFLICT") ||
              (response.status === 503 && ["CLOSED", "UNAVAILABLE"].includes(result.data.status))))
            return boundedJsonResponse(result.data);
          return boundedJsonResponse(payload, { status: response.status });
        } finally { boundary.close(); }
      },
    }, tokenProvider, context);
    return { context, client, path: `/v2/trips/${context.tripId}` };
  }
  const snapshot = (context: AccountRequestContext, requestId: string, input: unknown) => {
    const value = claimRequestSnapshotSchema.nullable().parse(input);
    if (value && (value.tripId !== context.tripId || value.requestId !== requestId))
      throw Error("CLAIM_RESOLUTION_READ_SCOPE_MISMATCH");
    return value;
  };
  return {
    async createPersonContext(contextInput: AccountRequestContext, requestId: string) {
      coreUuid.parse(requestId); const { context, client, path } = await scoped(contextInput);
      const value = await client.get(`${path}/claim-requests/${requestId}/create-person-context`, claimCreatePersonContextSchema.nullable());
      await assertAccountRequestContext(context, account);
      if (value && (value.actorAccountId !== context.accountId || value.tripId !== context.tripId || value.requestId !== requestId))
        throw Error("CLAIM_PERSON_CONTEXT_SCOPE_MISMATCH");
      return value;
    },
    async provisional(contextInput: AccountRequestContext, requestId: string) {
      coreUuid.parse(requestId);
      const { context, client, path } = await scoped(contextInput, { maxResponseBytes: 1048576, parseBoundedResponseText: text => parseCoreJson(text, 1048576) });
      const value = await client.get(`${path}/claim-requests/${requestId}/provisional`, claimProvisionalViewSchema.nullable());
      await assertAccountRequestContext(context, account);
      if (value && (value.accountId !== context.accountId || value.tripId !== context.tripId || value.requestId !== requestId))
        throw Error("CLAIM_PROVISIONAL_SCOPE_MISMATCH");
      return value;
    },
    async initialPersons(contextInput: AccountRequestContext, input: z.infer<typeof claimGeneralInitialPersonsInputSchema>) {
      const page = claimGeneralInitialPersonsInputSchema.parse(input);
      const { context, client, path } = await scoped(contextInput);
      const value = await client.get(`${path}/claim-origins/${page.inviteId}/requests/${page.requestId}/people${page.afterPersonId ? `?after=${page.afterPersonId}` : ""}`, claimGeneralInitialPersonsSchema.nullable());
      await assertAccountRequestContext(context, account);
      if (value && (value.accountId !== context.accountId || value.tripId !== context.tripId || value.requestId !== page.requestId || value.inviteId !== page.inviteId ||
          value.persons.some((p, i) => (page.afterPersonId !== null && p.personId <= page.afterPersonId) || (i > 0 && p.personId <= value.persons[i - 1].personId))))
        throw Error("CLAIM_GENERAL_PERSON_INDEX_SCOPE_MISMATCH");
      return value;
    },
    async verifyOrigin(contextInput: AccountRequestContext, input: z.infer<typeof claimOriginVerificationInputSchema>) {
      const value = claimOriginVerificationInputSchema.parse(input);
      const { context, client, path } = await scoped(contextInput);
      const result = await client.post(`${path}/claim-origins/verify`, value, claimOriginVerificationSchema);
      await assertAccountRequestContext(context, account);
      if (result.accountId !== context.accountId || result.tripId !== context.tripId ||
          result.requestId !== value.requestId || result.inviteId !== value.inviteId)
        throw Error("CLAIM_ORIGIN_SCOPE_MISMATCH");
      return result;
    },
    async pending(contextInput: AccountRequestContext, afterRequestId: string | null = null) {
      if (afterRequestId !== null) coreUuid.parse(afterRequestId);
      const { context, client, path } = await scoped(contextInput);
      const value = await client.get(`${path}/claim-requests${afterRequestId ? `?after=${afterRequestId}` : ""}`, claimResolutionRequestIndexSchema);
      await assertAccountRequestContext(context, account);
      if (value.accountId !== context.accountId || value.tripId !== context.tripId)
        throw Error("CLAIM_RESOLUTION_INDEX_SCOPE_MISMATCH");
      return value;
    },
    async readView(contextInput: AccountRequestContext, requestId: string) {
      coreUuid.parse(requestId);
      const { context, client, path } = await scoped(contextInput);
      const value = await client.get(`${path}/claim-requests/${requestId}/decision-view`, claimResolutionRequestViewSchema.nullable());
      await assertAccountRequestContext(context, account);
      if (value && (value.accountId !== context.accountId || value.tripId !== context.tripId || value.requestId !== requestId))
        throw Error("CLAIM_RESOLUTION_VIEW_SCOPE_MISMATCH");
      return value;
    },
    async preview(contextInput: AccountRequestContext, input: z.infer<typeof pendingClaimPreviewInputSchema>) {
      const inputValue = pendingClaimPreviewInputSchema.parse(input);
      const { context, client, path } = await scoped(contextInput);
      const value = await client.post(`${path}/claim-requests/preview`, inputValue, pendingClaimPreviewSchema.nullable());
      await assertAccountRequestContext(context, account);
      if (value && (value.claimantAccountId !== context.accountId || value.tripId !== context.tripId ||
          value.requestId !== inputValue.requestId || value.inviteId !== inputValue.inviteId || value.requestedPersonId !== inputValue.requestedPersonId))
        throw Error("CLAIM_RESOLUTION_PREVIEW_SCOPE_MISMATCH");
      return value;
    },
    async read(contextInput: AccountRequestContext, requestId: string) {
      coreUuid.parse(requestId);
      const { context, client, path } = await scoped(contextInput);
      const value = await client.get(`${path}/claim-requests/${requestId}`, claimRequestSnapshotSchema.nullable());
      await assertAccountRequestContext(context, account);
      return snapshot(context, requestId, value);
    },
    async execute(contextInput: AccountRequestContext, input: ClaimResolutionCommand) {
      const command = claimResolutionCommandSchema.parse(input);
      const { context, client, path } = await scoped(contextInput);
      const result = await client.post(`${path}/claim-request-operations`, command, claimResolutionResultSchema, { "Idempotency-Key": command.operationId });
      await assertAccountRequestContext(context, account);
      if (result.status === "RECORDED") {
        resolutionReceiptForCommand(context, command, result.receipt);
        const value = snapshot(context, command.requestId, result.snapshot);
        if (value && (value.revision < result.receipt.afterRevision ||
            (command.kind !== "RESOLVE_CLAIM_REQUEST" && value.claimantAccountId !== context.accountId)))
          throw Error("CLAIM_RESOLUTION_READ_SCOPE_MISMATCH");
      }
      return result;
    },
    async recover(contextInput: AccountRequestContext, input: ClaimResolutionCommand) {
      const command = claimResolutionCommandSchema.parse(input);
      const { context, client, path } = await scoped(contextInput);
      const result = await client.post(`${path}/claim-request-operations/recovery`, {
        operationId: command.operationId, requestId: command.requestId, intentDigest: resolutionIntentDigest(context, command),
      }, claimResolutionRecoverySchema, { "Idempotency-Key": command.operationId });
      await assertAccountRequestContext(context, account);
      if (result.status === "FOUND") resolutionReceiptForCommand(context, command, result.receipt);
      return result;
    },
  };
}
