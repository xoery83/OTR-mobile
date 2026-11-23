import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";

let sequence = 0;
let active: { id: string; generation: number; create(): void } | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
subscribeAccountGeneration(() => { active = undefined; notify(); });

export function subscribeStartTrip(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function stageStartTrip(create: () => void) {
  if (active) return undefined;
  const id = String(++sequence);
  active = { id, generation: getAccountGeneration(), create };
  notify();
  return id;
}

export function readStartTrip(id?: string) {
  return active?.id === id && active?.generation === getAccountGeneration() ? active : undefined;
}

export function releaseStartTrip(id?: string) {
  if (!active || active.id !== id) return;
  active = undefined;
  notify();
}
