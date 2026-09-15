import type { MyLedgerPeriod } from "@/data/api/ledgerReadContracts";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { ApiClientError } from "@/data/api/client";

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
  const repository = await getDefaultLedgerReadRepository();
  const cursor = (await repository.getCursor(journeyId))?.cursor ?? null;
  if (!cursor) {
    const response = await createLedgerReadTransport().bootstrap(journeyId);
    await repository.applyBootstrap(response);
    return true;
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
    if (!(error instanceof ApiClientError) || error.code !== "INVALID_CURSOR")
      throw error;
    const response = await transport.bootstrap(journeyId);
    await repository.applyBootstrap(response);
    return true;
  }
  return changed;
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
  await (await getDefaultLedgerReadRepository()).cacheMyLedger(response);
}
