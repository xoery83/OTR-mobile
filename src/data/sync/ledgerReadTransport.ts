import { ApiClientError, createApiClient } from "@/data/api/client";
import {
  ledgerAnalysisResponseSchema,
  ledgerBootstrapResponseSchema,
  ledgerChangesResponseSchema,
  ledgerExpenseListResponseSchema,
  myLedgerResponseSchema,
  ledgerRateQuoteSchema,
  type MyLedgerPeriod,
} from "@/data/api/ledgerReadContracts";
import { z } from "zod";
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

async function client(dependencies: Dependencies, timeoutMs = 15_000) {
  const session = await (dependencies.readSession ?? readLocalSession)();
  if (!session?.accessToken)
    throw new ApiClientError(
      "Authentication is unavailable.",
      "http",
      401,
      "AUTH_REQUIRED",
    );
  return (
    dependencies.createClient ??
    ((token) => createApiClient({ accessToken: token, timeoutMs }))
  )(session.accessToken);
}

export function createLedgerReadTransport(dependencies: Dependencies = {}) {
  return {
    async bootstrap(journeyId: string) {
      const response = await (
        await client(dependencies, 120_000)
      ).get(`/v2/trips/${journeyId}/ledger/bootstrap`, ledgerBootstrapResponseSchema, {
        "X-Review-Protocol": "2",
      });
      if (
        response.reviewProtocol !== 2 ||
        !response.reviewFindings ||
        !response.reviewActions
      )
        throw new ApiClientError("Review 2.0 backend is required.", "validation");
      return response;
    },

    async pull(journeyId: string, cursor: string | null) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await (
        await client(dependencies)
      ).get(
        `/v2/trips/${journeyId}/ledger/changes${query}`,
        ledgerChangesResponseSchema,
        { "X-Review-Protocol": "2" },
      );
      if (
        response.reviewProtocol !== 2 ||
        !response.reviewFindings ||
        !response.reviewActions
      )
        throw new ApiClientError("Review 2.0 backend is required.", "validation");
      return response;
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

    async rateQuotes(journeyId: string, quoteCurrency: string, baseCurrency: string) {
      const query = new URLSearchParams({ quoteCurrency, baseCurrency }).toString();
      return (await client(dependencies)).get(
        `/v2/trips/${journeyId}/ledger/rate-quotes?${query}`,
        z.array(ledgerRateQuoteSchema),
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
