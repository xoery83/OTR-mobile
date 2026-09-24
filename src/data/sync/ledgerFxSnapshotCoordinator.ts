import { requireActiveUserId } from "@/data/auth/authRepository";
import { getDefaultLedgerFxSnapshotRepository } from "@/data/repositories/defaultLedgerFxSnapshotRepository";
import { createLedgerReadTransport } from "./ledgerReadTransport";

const activeRefreshes = new Map<string, Promise<Awaited<ReturnType<typeof refresh>>>>();

export async function refreshLedgerFxSnapshotCache() {
  const accountId = await requireActiveUserId();
  const active = activeRefreshes.get(accountId);
  if (active) return active;
  const request = refresh(accountId).finally(() => {
    if (activeRefreshes.get(accountId) === request) activeRefreshes.delete(accountId);
  });
  activeRefreshes.set(accountId, request);
  return request;
}

async function refresh(accountId: string) {
  const repository = await getDefaultLedgerFxSnapshotRepository(accountId);
  const cached = await repository.list();
  const observedAt = cached?.snapshots[0]?.observedAt;
  if (observedAt && Date.now() - Date.parse(observedAt) < 24 * 60 * 60_000) return cached;
  const bundle = await createLedgerReadTransport().referenceRateSnapshots();
  await repository.cacheBundle(bundle);
  return bundle;
}
