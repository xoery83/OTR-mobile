import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { ReceiptScanSource } from "./ReceiptScanSourceFields";

type ReceiptSource = {
  count: number;
  slots: number;
  isCurrent(): boolean;
  choose(source: ReceiptScanSource): void;
};

let sequence = 0;
let active: { id: string; generation: number; source: ReceiptSource } | undefined;

subscribeAccountGeneration(() => { active = undefined; });

export function readLedgerReceiptSource(id: string | undefined) {
  return active?.id === id && active?.generation === getAccountGeneration() && active.source.isCurrent()
    ? active.source
    : undefined;
}

export function openLedgerReceiptSource(source: ReceiptSource, generation: number) {
  if (generation !== getAccountGeneration() || !source.isCurrent() ||
      (active && readLedgerReceiptSource(active.id))) return;
  const id = String(++sequence);
  active = { id, generation, source };
  return id;
}

export function releaseLedgerReceiptSource(id: string | undefined) {
  if (active?.id === id) active = undefined;
}
