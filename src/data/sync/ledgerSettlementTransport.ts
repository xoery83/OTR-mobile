import { ApiClientError, createApiClient } from "@/data/api/client";
import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import {
  correctSettlementPaymentRequestSchema,
  recordSettlementPaymentRequestSchema,
  settlementPaymentActionRequestSchema,
  settlementPaymentMutationResponseSchema,
  settlementAdjustmentFinalizeRequestSchema,
  settlementAdjustmentMutationResponseSchema,
  settlementAdjustmentPreviewSchema,
  settlementCorrectionConfirmRequestSchema,
  settlementCorrectionMutationResponseSchema,
  settlementCorrectionPreviewRequestSchema,
  settlementCorrectionPreviewSchema,
  settlementFinalizeResponseSchema,
  settlementPreviewSchema,
  type CorrectSettlementPaymentRequest,
  type RecordSettlementPaymentRequest,
  type SettlementPaymentActionRequest,
  type SettlementAdjustmentFinalizeRequest,
  type SettlementCorrectionConfirmRequest,
  type SettlementCorrectionPreviewRequest,
} from "@/data/api/ledgerSettlementContracts";
import { readLocalSession } from "@/data/auth/authRepository";
import { z } from "zod";

type Dependencies = {
  readSession?: typeof readLocalSession;
  createClient?: (accessToken: string) => ReturnType<typeof createApiClient>;
};

async function client(dependencies: Dependencies, timeoutMs = 15_000) {
  if (!dependencies.readSession && !dependencies.createClient)
    return createAuthenticatedApiClient({ timeoutMs });
  const session = await (dependencies.readSession ?? readLocalSession)();
  if (!session?.accessToken)
    throw new ApiClientError(
      "Authentication is unavailable.",
      "http",
      401,
      "AUTH_REQUIRED",
    );
  return (
    dependencies.createClient ?? ((token) => createApiClient({ accessToken: token }))
  )(session.accessToken);
}

export function createLedgerSettlementTransport(dependencies: Dependencies = {}) {
  return {
    async preflight(journeyId: string, forceRetry = false) {
      return (await client(dependencies, 45_000)).post(
        `/v2/trips/${journeyId}/settlements/fx-preflight`,
        { forceRetry },
        z.object({
          claimed: z.number().int(),
          accepted: z.number().int(),
          unavailableExpenseIds: z.array(z.string()),
          pendingPublicationExpenseIds: z.array(z.string()).default([]),
        }),
      );
    },
    async preview(journeyId: string, throughTimestamp: string) {
      return (await client(dependencies)).post(
        `/v2/trips/${journeyId}/settlements/preview`,
        { throughTimestamp },
        settlementPreviewSchema,
      );
    },

    async finalize(
      journeyId: string,
      throughTimestamp: string,
      inputDigest: string,
      idempotencyKey: string,
    ) {
      return (await client(dependencies)).post(
        `/v2/trips/${journeyId}/settlements`,
        { throughTimestamp, inputDigest },
        settlementFinalizeResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
    },

    async previewAdjustment(journeyId: string, rootSettlementId: string) {
      return (await client(dependencies)).post(
        `/v2/trips/${journeyId}/settlements/${rootSettlementId}/adjustments/preview`,
        {},
        settlementAdjustmentPreviewSchema,
      );
    },

    async finalizeAdjustment(
      journeyId: string,
      rootSettlementId: string,
      input: SettlementAdjustmentFinalizeRequest,
      idempotencyKey: string,
    ) {
      return (await client(dependencies)).post(
        `/v2/trips/${journeyId}/settlements/${rootSettlementId}/adjustments`,
        settlementAdjustmentFinalizeRequestSchema.parse(input),
        settlementAdjustmentMutationResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
    },

    async previewCorrection(
      journeyId: string,
      rootSettlementId: string,
      input: SettlementCorrectionPreviewRequest,
    ) {
      return (await client(dependencies)).post(
        `/v2/trips/${journeyId}/settlements/${rootSettlementId}/corrections`,
        settlementCorrectionPreviewRequestSchema.parse(input),
        settlementCorrectionPreviewSchema,
      );
    },

    async confirmCorrection(
      journeyId: string,
      rootSettlementId: string,
      input: SettlementCorrectionConfirmRequest,
      idempotencyKey: string,
    ) {
      return (await client(dependencies)).post(
        `/v2/trips/${journeyId}/settlements/${rootSettlementId}/corrections/confirm`,
        settlementCorrectionConfirmRequestSchema.parse(input),
        settlementCorrectionMutationResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
    },

    async recordPayment(
      journeyId: string,
      transferId: string,
      input: RecordSettlementPaymentRequest,
      idempotencyKey: string,
    ) {
      return (await client(dependencies)).post(
        `/v2/trips/${journeyId}/transfers/${transferId}/payments`,
        recordSettlementPaymentRequestSchema.parse(input),
        settlementPaymentMutationResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
    },

    async actOnPayment(
      journeyId: string,
      paymentId: string,
      action: "confirm" | "reject" | "dispute",
      input: SettlementPaymentActionRequest,
      idempotencyKey: string,
    ) {
      return (await client(dependencies)).post(
        `/v2/trips/${journeyId}/transfer-payments/${paymentId}/${action}`,
        settlementPaymentActionRequestSchema.parse(input),
        settlementPaymentMutationResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
    },

    async correctPayment(
      journeyId: string,
      paymentId: string,
      input: CorrectSettlementPaymentRequest,
      idempotencyKey: string,
    ) {
      return (await client(dependencies)).post(
        `/v2/trips/${journeyId}/transfer-payments/${paymentId}/correct`,
        correctSettlementPaymentRequestSchema.parse(input),
        settlementPaymentMutationResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
    },
  };
}
