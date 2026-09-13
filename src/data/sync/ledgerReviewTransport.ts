import { ApiClientError, createApiClient } from "@/data/api/client";
import {
  ledgerReviewActionSchema,
  ledgerReviewFindingSchema,
  ledgerReviewResponseSchema,
  type LedgerReviewActionRequest,
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
  finding: ledgerReviewFindingSchema,
  action: ledgerReviewActionSchema,
  idempotentReplay: z.boolean(),
});

export function createLedgerReviewTransport() {
  return {
    async refresh(journeyId: string) {
      return (await client()).post(
        `/v2/trips/${journeyId}/ledger/review/refresh`,
        {},
        ledgerReviewResponseSchema,
      );
    },
    async act(
      journeyId: string,
      findingId: string,
      idempotencyKey: string,
      input: LedgerReviewActionRequest,
    ) {
      return (await client()).post(
        `/v2/trips/${journeyId}/review-findings/${findingId}/actions`,
        input,
        actionResponse,
        { "Idempotency-Key": idempotencyKey },
      );
    },
  };
}
