import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import {
  journeyCurrencyCommitSchema,
  journeyCurrencyPreviewSchema,
  type JourneyCurrencyPreview,
} from "@/data/api/ledgerCurrencyContracts";
import {
  refreshJourneyLedger,
  revalidateJourneyLedger,
} from "@/data/sync/ledgerReportingCoordinator";
import type {
  LedgerRateLookupRequest,
  LedgerRateLookupResponse,
} from "@/data/api/ledgerFxContracts";
import { getDefaultLedgerExpenseRepository } from "./defaultLedgerExpenseRepository";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { cachedRateLookup, identityRateLookup } from "./ledgerRateLookup";

export type { JourneyCurrencyPreview } from "@/data/api/ledgerCurrencyContracts";
export type LedgerRateLookupResult = LedgerRateLookupResponse;

async function client() {
  return createAuthenticatedApiClient();
}

export const ledgerCurrencyRepository = {
  async cachedRateLookup(journeyId: string, input: LedgerRateLookupRequest) {
    if (input.quoteCurrency === input.baseCurrency) return identityRateLookup(input);
    const repository = await getDefaultLedgerExpenseRepository();
    return cachedRateLookup(
      input,
      await repository.listRateQuotes(journeyId, input.quoteCurrency, input.baseCurrency),
    );
  },

  async refreshRateLookup(journeyId: string, input: LedgerRateLookupRequest) {
    if (input.quoteCurrency === input.baseCurrency) return identityRateLookup(input);
    const transport = createLedgerReadTransport();
    const response = await transport.rateLookup(journeyId, input);
    if (response.decimalRate) {
      try {
        const repository = await getDefaultLedgerExpenseRepository();
        const quotes = await transport.rateQuotes(
          journeyId,
          input.quoteCurrency,
          input.baseCurrency,
        );
        for (const quote of quotes.filter(
          (item) => item.economicDate === input.requestedDate,
        ))
          await repository.cacheRateQuote(quote);
      } catch {
        // The fresh result remains useful even if its read-through cache update fails.
      }
    }
    return response;
  },

  async preview(journeyId: string, proposedCurrency: string) {
    return (await client()).post(
      `/v2/trips/${journeyId}/ledger/journey-currency/preview`,
      { proposedCurrency },
      journeyCurrencyPreviewSchema,
    );
  },

  async commit(journeyId: string, preview: JourneyCurrencyPreview, operationId: string) {
    const response = await (
      await client()
    ).post(
      `/v2/trips/${journeyId}/ledger/journey-currency/commit`,
      {
        proposedCurrency: preview.proposedCurrency,
        baseSettingsRevision: preview.settingsRevision,
        previewDigest: preview.previewDigest,
      },
      journeyCurrencyCommitSchema,
      { "Idempotency-Key": operationId },
    );
    await refreshJourneyLedger(journeyId);
    await revalidateJourneyLedger(journeyId);
    return response;
  },
};
