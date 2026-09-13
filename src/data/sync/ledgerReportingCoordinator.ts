import type { MyLedgerPeriod } from "@/data/api/ledgerReadContracts";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";

export async function refreshJourneyLedger(journeyId: string) {
  const repository = await getDefaultLedgerReadRepository();
  const cursor = (await repository.getCursor(journeyId))?.cursor ?? null;
  if (!cursor) {
    const response = await createLedgerReadTransport().bootstrap(journeyId);
    await repository.applyBootstrap(response);
    return;
  }
  const response = await createLedgerReadTransport().pull(journeyId, cursor);
  await repository.applyChanges(journeyId, response);
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
