import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { ReceiptScanSource } from "./ReceiptScanSourceFields";

type ReceiptSource = {
  count: number;
  slots: number;
  isCurrent(): boolean;
  choose(source: ReceiptScanSource): void;
  onClose(id: string): void;
};

let sequence = 0;
let active: {
  id: string;
  generation: number;
  source: ReceiptSource;
  awaitingNativeTransition?: ReceiptScanSource;
} | undefined;

subscribeAccountGeneration(() => releaseLedgerReceiptSource(active?.id));

export function readLedgerReceiptSource(id: string | undefined) {
  return active?.id === id && active?.generation === getAccountGeneration() && active.source.isCurrent()
    ? active.source
    : undefined;
}

export function openLedgerReceiptSource(source: ReceiptSource, generation: number) {
  if (generation !== getAccountGeneration() || !source.isCurrent() ||
      (active && readLedgerReceiptSource(active.id))) return;
  releaseLedgerReceiptSource(active?.id);
  const id = String(++sequence);
  active = { id, generation, source };
  return id;
}

export function releaseLedgerReceiptSource(id: string | undefined) {
  if (!active || active.id !== id) return;
  const source = active.source;
  active = undefined;
  source.onClose(id);
}

export function stageLedgerReceiptNativeHandoff(id: string | undefined, kind: ReceiptScanSource) {
  if (!active || !readLedgerReceiptSource(id) || active.awaitingNativeTransition) return;
  active.awaitingNativeTransition = kind;
}

export function releaseLedgerReceiptSourceRoute(id: string | undefined) {
  if (active?.id === id && !active?.awaitingNativeTransition) releaseLedgerReceiptSource(id);
}

export function finishLedgerReceiptNativeTransition() {
  const kind = active?.awaitingNativeTransition;
  if (!kind) return;
  const id = active?.id;
  const source = readLedgerReceiptSource(id);
  releaseLedgerReceiptSource(id);
  source?.choose(kind);
}
