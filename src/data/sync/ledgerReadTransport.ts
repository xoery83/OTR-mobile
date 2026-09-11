import { createApiClient } from "@/data/api/client";
import {
  ledgerBootstrapResponseSchema,
  ledgerChangesResponseSchema,
  myLedgerResponseSchema,
} from "@/data/api/ledgerReadContracts";
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

export function createLedgerReadTransport(dependencies: Dependencies = {}) {
  return {
    async bootstrap(journeyId: string) {
      return (await client(dependencies)).get(
        `/v2/trips/${journeyId}/ledger/bootstrap`,
        ledgerBootstrapResponseSchema,
      );
    },

    async pull(journeyId: string, cursor: string | null) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return (await client(dependencies)).get(
        `/v2/trips/${journeyId}/ledger/changes${query}`,
        ledgerChangesResponseSchema,
      );
    },

    async myLedger() {
      return (await client(dependencies)).get("/v2/me/ledger", myLedgerResponseSchema);
    },
  };
}
