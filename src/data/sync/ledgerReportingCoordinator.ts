import type { MyLedgerPeriod } from "@/data/api/ledgerReadContracts";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { ApiClientError } from "@/data/api/client";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { refreshLedgerPersonalPayments } from "./ledgerPersonalPaymentCoordinator";
import { refreshPersonalSettlementReview } from "./personalSettlementReviewCoordinator";

type JourneyPullResult = {
  changed: boolean;
  incomplete: boolean;
  pullApiRequestCount: number;
};
const activePulls = new Map<string, Promise<JourneyPullResult>>();

export function refreshJourneyLedger(journeyId: string) {
  return refreshJourneyLedgerWithStatus(journeyId).then((result) => result.changed);
}

export function refreshJourneyLedgerWithStatus(journeyId: string) {
  const key = `${getAccountGeneration()}:${journeyId}`;
  const active = activePulls.get(key);
  if (active) return active;
  const pull = pullJourneyLedger(journeyId).finally(() => {
    if (activePulls.get(key) === pull) activePulls.delete(key);
  });
  activePulls.set(key, pull);
  return pull;
}

async function pullJourneyLedger(journeyId: string) {
  let personalChanged = false;
  let personalError: unknown;
  let reviewError = false;
  let pullApiRequestCount = 0;
  const countRequest = () => {
    pullApiRequestCount += 1;
  };
  try {
    personalChanged = await refreshLedgerPersonalPayments(journeyId, countRequest);
  } catch (error) {
    personalError = error;
  }
  try {
    countRequest();
    await refreshPersonalSettlementReview(journeyId);
  } catch {
    // A blocked personal statement must not block ordinary Ledger refresh.
    reviewError = true;
  }
  const finish = (changed: boolean): JourneyPullResult => ({
    changed,
    incomplete: Boolean(personalError) || reviewError,
    pullApiRequestCount,
  });
  const repository = await getDefaultLedgerReadRepository();
  const cursor = (await repository.getCursor(journeyId))?.cursor ?? null;
  if (!cursor) {
    try {
      countRequest();
      const response = await createLedgerReadTransport().bootstrap(journeyId);
      await repository.applyBootstrap(response);
      return finish(true);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 403 &&
        error.code === "TRIP_READ_FORBIDDEN"
      ) {
        if (personalError) throw personalError;
        return finish(personalChanged);
      }
      throw error;
    }
  }
  const transport = createLedgerReadTransport();
  let nextCursor: string | null = cursor;
  let changed = false;
  try {
    do {
      countRequest();
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
      return finish(personalChanged);
    }
    if (!(error instanceof ApiClientError) || error.code !== "INVALID_CURSOR")
      throw error;
    countRequest();
    const response = await transport.bootstrap(journeyId);
    await repository.applyBootstrap(response);
    return finish(true);
  }
  return finish(changed || personalChanged);
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
}
