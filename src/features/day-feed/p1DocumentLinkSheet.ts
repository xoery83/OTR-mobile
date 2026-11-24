import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";

export const hostedP1DocumentLinkEnabled: boolean = true;

type Owner = {
  tripId: string;
  itemId: string;
  itemRevision: number;
  generation: number;
  originKey: string;
  isCurrent(): boolean;
  revisionCurrent(): boolean;
  onQueued(): void;
};

let sequence = 0;
let active: (Owner & { id: string; busy: boolean; queued: boolean }) | undefined;
let revision = 0;
const listeners = new Set<() => void>();

export const p1DocumentLinkVersion = () => revision;
export function subscribeP1DocumentLink(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyP1DocumentLink(id: string | undefined) {
  if (active?.id !== id || !active) return;
  publish();
}

function publish() {
  revision += 1;
  listeners.forEach(listener => listener());
}

export function stageP1DocumentLink(owner: Owner) {
  if (active || owner.generation !== getAccountGeneration() || !owner.isCurrent()) return;
  active = { ...owner, id: String(++sequence), busy: false, queued: false };
  return active.id;
}

export function readP1DocumentLink(id: string | undefined) {
  return active?.id === id && active?.generation === getAccountGeneration() ? active : undefined;
}

export function beginP1DocumentLink(id: string | undefined) {
  const entry = readP1DocumentLink(id);
  if (!entry || entry.busy || entry.queued) return false;
  entry.busy = true;
  publish();
  return true;
}

export function finishP1DocumentLink(id: string | undefined, queued: boolean) {
  const entry = readP1DocumentLink(id);
  if (!entry) return;
  entry.busy = false;
  entry.queued = queued;
  publish();
}

export function releaseP1DocumentLink(id: string | undefined, returned = false) {
  if (!active || active.id !== id) return;
  const entry = active;
  active = undefined;
  publish();
  if (returned && entry.queued && entry.generation === getAccountGeneration() && entry.isCurrent()) entry.onQueued();
}

subscribeAccountGeneration(() => releaseP1DocumentLink(active?.id));
