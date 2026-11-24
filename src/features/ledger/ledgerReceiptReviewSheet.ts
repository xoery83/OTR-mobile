import { createContext, type ComponentProps, type RefObject } from "react";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { ReceiptReviewSheet } from "./ReceiptReviewSheet";
import type { ReceiptScanSource } from "./ReceiptScanSourceFields";

export const hostedLedgerReceiptReviewEnabled: boolean = true;

export const LedgerReceiptReviewInvocationContext = createContext<RefObject<string | undefined> | null>(null);

type Review = ComponentProps<typeof ReceiptReviewSheet>;

export type ReceiptReviewChoice = { title: string; isCurrent(): boolean } & (
  | { kind: "currency"; selected: string; suggestions: string[]; choose(code: string): void }
  | { kind: "receipt-candidates"; options: readonly {
      key: string; label: string; selected: boolean; onPress(): void;
    }[] }
  | { kind: "receipt-source"; count: number; slots: number; choose(source: ReceiptScanSource): void }
);

type Picker = { id: string; revision: number; choice: ReceiptReviewChoice };
let sequence = 0;
let active: { id: string; generation: number; review: Review; picker?: Picker } | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

subscribeAccountGeneration(() => { active = undefined; notify(); });

export function subscribeLedgerReceiptReview(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function readEntry(id: string | undefined) {
  return active && active.id === id && active.generation === getAccountGeneration() ? active : undefined;
}

export function readLedgerReceiptReview(id: string | undefined) {
  return readEntry(id)?.review;
}

export function openLedgerReceiptReview(review: Review, generation: number) {
  if (active || !review.visible || generation !== getAccountGeneration()) return;
  const id = String(++sequence);
  active = { id, generation, review };
  notify();
  return id;
}

export function updateLedgerReceiptReview(id: string | undefined, review: Review) {
  const entry = readEntry(id);
  if (!entry || entry.review === review || entry.review.session.sessionId !== review.session.sessionId ||
      review.session.revision < entry.review.session.revision) return;
  entry.review = review;
  notify();
}

export function bindLedgerReceiptReviewPicker(id: string | undefined, choice: ReceiptReviewChoice) {
  const entry = readEntry(id);
  if (!entry?.review.visible || entry.picker || entry.review.isPickingSource?.() || !choice.isCurrent()) return;
  const picker = String(++sequence);
  entry.picker = { id: picker, revision: entry.review.session.revision, choice };
  return picker;
}

export function readLedgerReceiptReviewPicker(id: string | undefined, picker: string | undefined) {
  const entry = readEntry(id);
  if (!entry?.review.visible || !entry.picker || entry.picker.id !== picker ||
      entry.picker.revision !== entry.review.session.revision) return;
  return entry.picker.choice;
}

export function releaseLedgerReceiptReviewPicker(id: string | undefined, picker: string | undefined) {
  const entry = readEntry(id);
  if (entry?.picker && entry.picker.id === picker) entry.picker = undefined;
}

export function releaseLedgerReceiptReview(id: string | undefined) {
  if (!readEntry(id)) return;
  active = undefined;
  notify();
}
