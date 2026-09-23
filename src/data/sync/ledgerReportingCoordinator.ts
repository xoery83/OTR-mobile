import type { MyLedgerPeriod } from "@/data/api/ledgerReadContracts";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { ApiClientError } from "@/data/api/client";
import { refreshLedgerPersonalPayments } from "./ledgerPersonalPaymentCoordinator";
import { refreshPersonalSettlementReview } from "./personalSettlementReviewCoordinator";

const activePulls = new Map<string, Promise<boolean>>();

export function refreshJourneyLedger(journeyId: string) {
  const active = activePulls.get(journeyId);
  if (active) return active;
  const pull = pullJourneyLedger(journeyId).finally(() => {
    if (activePulls.get(journeyId) === pull) activePulls.delete(journeyId);
  });
  activePulls.set(journeyId, pull);
  return pull;
}

async function pullJourneyLedger(journeyId: string) {
  let personalChanged = false;
  let personalError: unknown;
  try {
    personalChanged = await refreshLedgerPersonalPayments(journeyId);
  } catch (error) {
    personalError = error;
  }
  try {
    await refreshPersonalSettlementReview(journeyId);
  } catch {
    // A blocked personal statement must not block ordinary Ledger refresh.
  }
  const repository = await getDefaultLedgerReadRepository();
  const cursor = (await repository.getCursor(journeyId))?.cursor ?? null;
  if (!cursor) {
    try {
      const response = await createLedgerReadTransport().bootstrap(journeyId);
      await repository.applyBootstrap(response);
      return true;
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 403 &&
        error.code === "TRIP_READ_FORBIDDEN"
      ) {
        if (personalError) throw personalError;
        return personalChanged;
      }
      throw error;
    }
  }
  const transport = createLedgerReadTransport();
  let nextCursor: string | null = cursor;
  let changed = false;
  try {
    do {
      const response = await transport.pull(journeyId, nextCursor);
      await repository.applyChanges(journeyId, response);
      changed ||= response.changes.length > 0;
      nextCursor = response.cursor;
      if (!response.hasMore) break;
    } while (true);
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      error.status === 403 &&
      error.code === "TRIP_READ_FORBIDDEN"
    ) {
      if (personalError) throw personalError;
      return personalChanged;
    }
    if (!(error instanceof ApiClientError) || error.code !== "INVALID_CURSOR")
      throw error;
    const response = await transport.bootstrap(journeyId);
    await repository.applyBootstrap(response);
    return true;
  }
  return changed || personalChanged;
}

export async function revalidateJourneyLedger(journeyId: string) {
  const response = await createLedgerReadTransport().bootstrap(journeyId);
  await (await getDefaultLedgerReadRepository()).applyBootstrap(response);
  return response;
}

export async function refreshMyLedger(
  period: MyLedgerPeriod,
  bounds: { from: string | null; to: string | null },
) {
  const response = await createLedgerReadTransport().myLedger(period, bounds);
  const repository = await getDefaultLedgerReadRepository();
  await repository.cacheMyLedger(response);
  for (const { journeyId } of response.journeys) {
    try {
      if (!(await repository.getCursor(journeyId))) await refreshJourneyLedger(journeyId);
    } catch {
      // Keep the authorized My Ledger summary; retry this Journey on the next refresh.
    }
  }
}
