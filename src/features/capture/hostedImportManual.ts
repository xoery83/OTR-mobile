import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";

export type ImportManualRequest = {
  tripId?: string;
  isBatchCurrent(): boolean;
};

type ImportManualOwner = ImportManualRequest & {
  generation: number;
  sourceKey: string;
};

let sequence = 0;
let pending: { id: string; owner: ImportManualOwner } | undefined;

subscribeAccountGeneration(() => { pending = undefined; });

export function readImportManualFallback(id: string | undefined) {
  if (!pending || pending.id !== id) return undefined;
  const owner = pending.owner;
  return owner.generation === getAccountGeneration() && owner.isBatchCurrent() ? owner : undefined;
}

export function stageImportManualFallback(owner: ImportManualOwner) {
  if (owner.generation !== getAccountGeneration() || !owner.isBatchCurrent()) return undefined;
  const current = readImportManualFallback(pending?.id);
  if (current) return current.sourceKey === owner.sourceKey ? pending?.id : undefined;
  const id = String(++sequence);
  pending = { id, owner };
  return id;
}

export function releaseImportManualFallback(id: string | undefined) {
  if (pending?.id === id) pending = undefined;
}
