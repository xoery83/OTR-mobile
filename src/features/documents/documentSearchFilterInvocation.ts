import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type { DocumentSearchFilters } from "./documentListPresentation";

type Invocation = {
  generation: number;
  initial: DocumentSearchFilters;
  isCurrent(): boolean;
  apply(filters: DocumentSearchFilters): void;
};

let sequence = 0;
let active: { id: string; invocation: Invocation } | undefined;

subscribeAccountGeneration(() => {
  active = undefined;
});

export function openDocumentSearchFilters(invocation: Invocation) {
  const id = String(++sequence);
  active = { id, invocation };
  return id;
}

export function readDocumentSearchFilters(id: string | undefined) {
  if (!active || active.id !== id) return undefined;
  const { invocation } = active;
  if (invocation.generation !== getAccountGeneration() || !invocation.isCurrent())
    return undefined;
  return invocation;
}

export function releaseDocumentSearchFilters(id: string | undefined) {
  if (active?.id === id) active = undefined;
}
