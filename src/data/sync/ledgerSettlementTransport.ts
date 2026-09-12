import { createApiClient } from "@/data/api/client";
import {
  correctSettlementPaymentRequestSchema,
  recordSettlementPaymentRequestSchema,
  settlementPaymentActionRequestSchema,
  settlementPaymentMutationResponseSchema,
  settlementAdjustmentFinalizeRequestSchema,
  settlementAdjustmentMutationResponseSchema,
  settlementAdjustmentPreviewSchema,
  settlementFinalizeResponseSchema,
  settlementPreviewSchema,
  type CorrectSettlementPaymentRequest,
  type RecordSettlementPaymentRequest,
  type SettlementPaymentActionRequest,
  type SettlementAdjustmentFinalizeRequest,
} from "@/data/api/ledgerSettlementContracts";
import { readLocalSession } from "@/data/auth/authRepository";

type Dependencies = {
  readSession?: typeof readLocalSession;
  createClient?: (accessToken: string) => ReturnType<typeof createApiClient>;
};

async function client(dependencies: Dependencies) {
  const session = await (dependencies.readSession ?? readLocalSession)();
  if (!session?.accessToken) throw new Error("A Supabase Dev session is required.");
  return (
    dependencies.createClient ?? ((token) => createApiClient({ accessToken: token }))
  )(session.accessToken);
}

export function createLedgerSettlementTransport(dependencies: Dependencies = {}) {
  return {
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
