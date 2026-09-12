import { createApiClient } from "@/data/api/client";
import {
  settlementFinalizeResponseSchema,
  settlementPreviewSchema,
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
  };
}
