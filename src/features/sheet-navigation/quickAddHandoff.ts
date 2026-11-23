import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { TripQuickAddProps } from "@/components/TripQuickAddMenu";

let next = 0;
let current: { id: string; generation: number; props: TripQuickAddProps } | undefined;

const listeners = new Set<() => void>();
const publish = () => listeners.forEach(listener => listener());
subscribeAccountGeneration(() => {
  current = undefined;
  publish();
});

export function subscribeHostedQuickAdd(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function releaseStaleHostedQuickAdd() {
  if (current && current.props.isCurrentOwner?.() === false) releaseHostedQuickAdd(current.id);
}

export function stageHostedQuickAdd(props: TripQuickAddProps) {
  const id = String(++next);
  current = { id, generation: getAccountGeneration(), props };
  publish();
  return id;
}

export function readHostedQuickAdd(id: string | undefined) {
  if (current?.id === id && current?.generation === getAccountGeneration() && current?.props.isCurrentOwner?.() !== false) return current.props;
  return undefined;
}

export function releaseHostedQuickAdd(id: string | undefined) {
  if (!current || current.id !== id) return;
  current = undefined;
  publish();
}
