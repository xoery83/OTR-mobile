import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { DayMoveConfirmation } from "./useP1Move";

export const hostedDayMoveEnabled: boolean = true;

type Entry = {
  generation: number;
  originKey: string;
  originCurrent(): boolean;
  originFocused(): boolean;
  confirmation: DayMoveConfirmation;
};

let sequence = 0;
let current: (Entry & { id: string; retired: boolean }) | undefined;
let version = 0;
const listeners = new Set<() => void>();

export const dayMoveVersion = () => version;
export function subscribeDayMove(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function notify() {
  version += 1;
  listeners.forEach(listener => listener());
}

export function readDayMoveSheet(id: string | undefined) {
  return current?.id === id && current?.generation === getAccountGeneration() ? current : undefined;
}

export function stageDayMoveSheet(entry: Entry) {
  if (current || !entry.originKey || entry.generation !== getAccountGeneration() ||
      !entry.originCurrent() || !entry.confirmation.isCurrent())
    return undefined;
  current = { ...entry, id: String(++sequence), retired: false };
  return current.id;
}

export function updateDayMoveSheet(id: string, confirmation: DayMoveConfirmation | null) {
  const entry = readDayMoveSheet(id);
  if (!entry || entry.retired) return;
  if (entry.confirmation.proposalIdentity !== confirmation?.proposalIdentity) {
    entry.retired = true;
    notify();
    return;
  }
  if (entry.confirmation === confirmation) return;
  entry.confirmation = confirmation;
  notify();
}

export function releaseDayMoveSheet(id: string | undefined, dismiss = false) {
  if (!current || current.id !== id) return;
  const entry = current;
  current = undefined;
  if (dismiss && entry.generation === getAccountGeneration() && entry.originCurrent() &&
      entry.originFocused()) entry.confirmation.dismiss();
  notify();
}

subscribeAccountGeneration(() => releaseDayMoveSheet(current?.id));
