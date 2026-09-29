import { requireActiveUserId } from "@/data/auth/authRepository";
import { getDefaultLedgerFxSnapshotRepository } from "@/data/repositories/defaultLedgerFxSnapshotRepository";
import { createLedgerReadTransport } from "./ledgerReadTransport";

const activeRefreshes = new Map<string, Promise<Awaited<ReturnType<typeof refresh>>>>();

export async function refreshLedgerFxSnapshotCache(force = false) {
  const accountId = await requireActiveUserId();
  const key = `${accountId}:${force}`;
  const active = activeRefreshes.get(key);
  if (active) return active;
  const request = refresh(accountId, force).finally(() => {
    if (activeRefreshes.get(key) === request) activeRefreshes.delete(key);
  });
  activeRefreshes.set(key, request);
  return request;
}

async function refresh(accountId: string, force: boolean) {
  const repository = await getDefaultLedgerFxSnapshotRepository(accountId);
  const cached = await repository.list();
  const observedAt = cached?.snapshots[0]?.observedAt;
  if (!force && observedAt && Date.now() - Date.parse(observedAt) < 24 * 60 * 60_000)
    return cached;
  const bundle = await createLedgerReadTransport().referenceRateSnapshots();
  await repository.cacheBundle(bundle);
  return bundle;
}
