import { ApiClientError, createApiClient } from "@/data/api/client";
import {
  ledgerReviewActionSchema,
  ledgerReviewFindingSchema,
  ledgerReviewRaiseResponseSchema,
  ledgerReviewResponseSchema,
  type LedgerReviewActionRequest,
  type LedgerReviewRaiseRequest,
} from "@/data/api/ledgerReviewContracts";
import { readLocalSession } from "@/data/auth/authRepository";
import { z } from "zod";

async function client() {
  const session = await readLocalSession();
  if (!session?.accessToken)
    throw new ApiClientError(
      "Authentication is unavailable.",
      "http",
      401,
      "AUTH_REQUIRED",
    );
  return createApiClient({ accessToken: session.accessToken });
}

const actionResponse = z.object({
  reviewProtocol: z.literal(2).optional(),
  finding: ledgerReviewFindingSchema,
  action: ledgerReviewActionSchema,
  idempotentReplay: z.boolean(),
});

export function createLedgerReviewTransport() {
  return {
    async raise(
      journeyId: string,
      idempotencyKey: string,
      input: LedgerReviewRaiseRequest,
    ) {
      const response = await (
        await client()
      ).post(
        `/v2/trips/${journeyId}/review-findings`,
        input,
        ledgerReviewRaiseResponseSchema,
        { "Idempotency-Key": idempotencyKey, "X-Review-Protocol": "2" },
      );
      if (response.reviewProtocol !== 2)
        throw new ApiClientError("Review 2.0 backend is required.", "validation");
      return response;
    },
    async refresh(journeyId: string) {
      const response = await (
        await client()
      ).post(
        `/v2/trips/${journeyId}/ledger/review/refresh`,
        {},
        ledgerReviewResponseSchema,
        { "X-Review-Protocol": "2" },
      );
      if (response.reviewProtocol !== 2)
        throw new ApiClientError("Review 2.0 backend is required.", "validation");
      return response;
    },
    async act(
      journeyId: string,
      findingId: string,
      idempotencyKey: string,
      input: LedgerReviewActionRequest,
    ) {
      const response = await (
        await client()
      ).post(
        `/v2/trips/${journeyId}/review-findings/${findingId}/actions`,
        input,
        actionResponse,
        { "Idempotency-Key": idempotencyKey, "X-Review-Protocol": "2" },
      );
      if (response.reviewProtocol !== 2)
        throw new ApiClientError("Review 2.0 backend is required.", "validation");
      return response;
    },
  };
}
