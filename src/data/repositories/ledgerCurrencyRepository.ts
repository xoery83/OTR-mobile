import { createApiClient, ApiClientError } from "@/data/api/client";
import {
  journeyCurrencyCommitSchema,
  journeyCurrencyPreviewSchema,
  type JourneyCurrencyPreview,
} from "@/data/api/ledgerCurrencyContracts";
import { readLocalSession } from "@/data/auth/authRepository";
import {
  refreshJourneyLedger,
  revalidateJourneyLedger,
} from "@/data/sync/ledgerReportingCoordinator";

export type { JourneyCurrencyPreview } from "@/data/api/ledgerCurrencyContracts";

async function client() {
  const session = await readLocalSession();
  if (!session?.accessToken)
    throw new ApiClientError(
      "Reconnect to review Journey Currency.",
      "http",
      401,
      "AUTH_REQUIRED",
    );
  return createApiClient({ accessToken: session.accessToken });
}

export const ledgerCurrencyRepository = {
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
