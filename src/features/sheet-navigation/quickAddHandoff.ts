import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { TripQuickAddProps } from "@/components/TripQuickAddMenu";

let next = 0;
let current: { id: string; generation: number; props: TripQuickAddProps } | undefined;

subscribeAccountGeneration(() => { current = undefined; });

export function stageHostedQuickAdd(props: TripQuickAddProps) {
  const id = String(++next);
  current = { id, generation: getAccountGeneration(), props };
  return id;
}

export function readHostedQuickAdd(id: string | undefined) {
  if (current?.id === id && current?.generation === getAccountGeneration()) return current.props;
  return undefined;
}

export function releaseHostedQuickAdd(id: string | undefined) {
  if (current?.id === id) current = undefined;
}
