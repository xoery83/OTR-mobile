import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type { ReportingFilters } from "@/domain/ledger/reporting";
import type { LedgerSearchFilterProps } from "./LedgerSearchScreen";

export const hostedLedgerSearchFiltersEnabled =
  process.env.EXPO_PUBLIC_OTR_SHEET_LEDGER_SEARCH_QA === "true";

type AttentionChoice = Pick<ReportingFilters, "valuation" | "conflict">;

export type LedgerSearchChoice = { title: string } & (
  | { kind: "options"; values: readonly { label: string; value?: string }[]; selected?: string;
      confirm?: boolean; onChoose(value: string | undefined): void }
  | { kind: "attention"; initial: AttentionChoice; onChoose(value: AttentionChoice): void }
);

type RootState = {
  key: string;
  index: number;
  routes: readonly { key: string; name: string }[];
};

export function captureLedgerSearchOrigin(readRoot: () => RootState | undefined, isFocused: () => boolean) {
  const root = readRoot();
  const origin = root?.routes[root.index];
  if (!root || !origin || !isFocused()) return;
  const rootKey = root.key;
  const originKey = origin.key;
  let sheetKey: string | undefined;

  function returnedToOrigin() {
    const state = readRoot();
    return state?.key === rootKey && state.routes[state.index]?.key === originKey && isFocused();
  }

  return {
    returnedToOrigin,
    isCurrent() {
      if (returnedToOrigin()) return true;
      const state = readRoot();
      if (state?.key !== rootKey) return false;
      const top = state.routes[state.index];
      if (top?.name !== "ledger-search-filters" || state.routes[state.index - 1]?.key !== originKey) return false;
      sheetKey ??= top.key;
      return sheetKey === top.key;
    },
  };
}

type SearchFilterInvocation = {
  generation: number;
  isCurrent(): boolean;
  fields: Omit<LedgerSearchFilterProps, "onApply" | "onCancel" | "openChoice" | "panel" | "exitPending" | "isExitPending"> & {
    prepareApply(filters: ReportingFilters): Promise<(() => void) | undefined>;
  };
};

let sequence = 0;
let active: { id: string; invocation: SearchFilterInvocation; choice?: { id: string; value: LedgerSearchChoice } } | undefined;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

subscribeAccountGeneration(() => {
  active = undefined;
  notify();
});

export function subscribeLedgerSearchFilters(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function openLedgerSearchFilters(invocation: SearchFilterInvocation) {
  if (invocation.generation !== getAccountGeneration() || !invocation.isCurrent() || readLedgerSearchFilters(active?.id)) return undefined;
  const id = String(++sequence);
  active = { id, invocation };
  notify();
  return id;
}

export function readLedgerSearchFilters(id: string | undefined) {
  if (
    !active ||
    active.id !== id ||
    active.invocation.generation !== getAccountGeneration() ||
    !active.invocation.isCurrent()
  )
    return undefined;
  return active.invocation.fields;
}

export function releaseLedgerSearchFilters(id: string | undefined) {
  if (!active || active.id !== id) return;
  active = undefined;
  notify();
}

export function openLedgerSearchChoice(invocation: string | undefined, value: LedgerSearchChoice) {
  if (!active || active.choice || !readLedgerSearchFilters(invocation)) return undefined;
  const id = String(++sequence);
  active.choice = { id, value };
  notify();
  return id;
}

export function readLedgerSearchChoice(invocation: string | undefined, selection: string | undefined) {
  return active?.choice?.id === selection && readLedgerSearchFilters(invocation) ? active?.choice?.value : undefined;
}

export function releaseLedgerSearchChoice(invocation: string | undefined, selection: string | undefined) {
  if (active?.id !== invocation || !active?.choice || active.choice.id !== selection) return;
  active.choice = undefined;
  notify();
}
