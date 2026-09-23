import { createApiClient } from "@/data/api/client";
import {
  createPersonalSettlementCheckpointRequestSchema,
  personalSettlementReviewResponseSchema,
} from "@/data/api/ledgerSettlementContracts";
import { readLocalSession } from "@/data/auth/authRepository";
import { z } from "zod";

async function client() {
  const session = await readLocalSession();
  if (!session?.accessToken) throw new Error("Authentication is unavailable.");
  return createApiClient({ accessToken: session.accessToken });
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
