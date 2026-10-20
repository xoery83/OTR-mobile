import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import { ApiClientError } from "@/data/api/client";
import { ZodError } from "zod";
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

export type JourneyCurrencyPreviewFailure = {
  kind:
    | "CONFIG_UNAVAILABLE"
    | "CONNECTIVITY"
    | "AUTH"
    | "FORBIDDEN"
    | "CONFLICT"
    | "SERVICE"
    | "INVALID_RESPONSE"
    | "UNKNOWN";
  status?: number;
  code?:
    | "AUTH_REQUIRED"
    | "INVALID_SESSION"
    | "TRIP_WRITE_FORBIDDEN"
    | "JOURNEY_CURRENCY_FINALIZED_LOCK"
    | "JOURNEY_CURRENCY_OPEN_SETTLEMENT"
    | "JOURNEY_CURRENCY_CONFLICT"
    | "JOURNEY_CURRENCY_PREVIEW_STALE"
    | "SETTINGS_REVISION_CONFLICT"
    | "CURRENCY_UNCHANGED"
    | "INVALID_CURRENCY"
    | "BACKEND_UNAVAILABLE";
};

class CurrencyApiConfigurationError extends Error {
  constructor() {
    super("CURRENCY_API_CONFIG_UNAVAILABLE");
  }
}

const safeServerCodes = new Set<NonNullable<JourneyCurrencyPreviewFailure["code"]>>([
  "AUTH_REQUIRED",
  "INVALID_SESSION",
  "TRIP_WRITE_FORBIDDEN",
  "JOURNEY_CURRENCY_FINALIZED_LOCK",
  "JOURNEY_CURRENCY_OPEN_SETTLEMENT",
  "JOURNEY_CURRENCY_CONFLICT",
  "JOURNEY_CURRENCY_PREVIEW_STALE",
  "SETTINGS_REVISION_CONFLICT",
  "CURRENCY_UNCHANGED",
  "INVALID_CURRENCY",
  "BACKEND_UNAVAILABLE",
]);

export function classifyJourneyCurrencyPreviewFailure(
  error: unknown,
): JourneyCurrencyPreviewFailure {
  if (error instanceof CurrencyApiConfigurationError)
    return { kind: "CONFIG_UNAVAILABLE" };
  if (!(error instanceof ApiClientError)) return { kind: "UNKNOWN" };
  const status =
    Number.isInteger(error.status) && error.status! >= 100 && error.status! <= 599
      ? error.status
      : undefined;
  const code =
    error.code &&
    safeServerCodes.has(error.code as NonNullable<JourneyCurrencyPreviewFailure["code"]>)
      ? (error.code as JourneyCurrencyPreviewFailure["code"])
      : undefined;
  if (error.kind === "network" || error.kind === "timeout")
    return { kind: "CONNECTIVITY" };
  if (error.kind === "validation") return { kind: "INVALID_RESPONSE", status };
  if (error.kind !== "http") return { kind: "UNKNOWN" };
  const kind =
    status === 401
      ? "AUTH"
      : status === 403
        ? "FORBIDDEN"
        : status === 409
          ? "CONFLICT"
          : status !== undefined && status >= 500
            ? "SERVICE"
            : "UNKNOWN";
  return { kind, status, code };
}

async function client() {
  try {
    return createAuthenticatedApiClient();
  } catch (error) {
    // The shared client validates the public base URL before token or network work.
    if (error instanceof ZodError) throw new CurrencyApiConfigurationError();
    throw error;
  }
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
