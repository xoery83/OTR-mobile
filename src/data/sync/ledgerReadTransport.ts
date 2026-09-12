import { createApiClient } from "@/data/api/client";
import {
  ledgerAnalysisResponseSchema,
  ledgerBootstrapResponseSchema,
  ledgerChangesResponseSchema,
  ledgerExpenseListResponseSchema,
  myLedgerResponseSchema,
  type MyLedgerPeriod,
} from "@/data/api/ledgerReadContracts";
import type {
  ReportingDimension,
  ReportingFilters,
  ReportingScope,
} from "@/domain/ledger/reporting";
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

    async expenses(journeyId: string, filters: ReportingFilters = {}) {
      return (await client(dependencies)).get(
        `/v2/trips/${journeyId}/expenses${queryString(filters)}`,
        ledgerExpenseListResponseSchema,
      );
    },

    async analysis(
      journeyId: string,
      scope: ReportingScope,
      dimension: ReportingDimension,
      filters: ReportingFilters = {},
    ) {
      return (await client(dependencies)).get(
        `/v2/trips/${journeyId}/ledger/analysis${queryString({ ...filters, scope, dimension })}`,
        ledgerAnalysisResponseSchema,
      );
    },

    async myLedger(
      period: MyLedgerPeriod,
      bounds: { from: string | null; to: string | null },
    ) {
      return (await client(dependencies)).get(
        `/v2/me/ledger${queryString({ period, ...bounds })}`,
        myLedgerResponseSchema,
      );
    },
  };
}

function queryString(values: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
