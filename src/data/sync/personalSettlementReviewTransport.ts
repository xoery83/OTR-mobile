import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import {
  createPersonalSettlementCheckpointRequestSchema,
  personalSettlementReviewResponseSchema,
} from "@/data/api/ledgerSettlementContracts";
import { z } from "zod";

async function client() {
  return createAuthenticatedApiClient();
}

const createResponse = personalSettlementReviewResponseSchema.extend({
  idempotentReplay: z.boolean(),
});

export function createPersonalSettlementReviewTransport() {
  return {
    async read(journeyId: string) {
      return (await client()).get(
        `/v2/trips/${journeyId}/settlement-review`,
        personalSettlementReviewResponseSchema,
      );
    },
    async checkpoint(journeyId: string, key: string, input: unknown) {
      const parsed = createPersonalSettlementCheckpointRequestSchema.parse(input);
      return (await client()).post(
        `/v2/trips/${journeyId}/settlement-review`,
        parsed,
        createResponse,
        { "Idempotency-Key": key },
      );
    },
  };
}
