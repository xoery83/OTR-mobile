import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { LedgerJourneyContext } from "@/domain/ledger/journeyContext";
import type { JourneyPickerSection } from "./dashboardPresentation";

export const hostedLedgerJourneySheetEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_LEDGER_JOURNEY_QA === "true";

export type LedgerJourneySheetEntry = {
  selected: string | null;
  initialQuery: string;
  sections(query: string): JourneyPickerSection[];
  isCurrent(): boolean;
  originKey: string;
  originFocused(): boolean;
  choose(item: LedgerJourneyContext, isPresent: () => boolean): Promise<boolean>;
};

type OriginNavigation = {
  getState(): { key: string; index: number; routes: readonly { key: string }[] } | undefined;
  getParent(): OriginNavigation | undefined;
};

export function captureLedgerJourneyOrigin(navigation: OriginNavigation, rootKey: string) {
  const activeRoutes: (() => boolean)[] = [];
  for (let navigator: OriginNavigation | undefined = navigation; navigator; navigator = navigator.getParent()) {
    const current = navigator;
    const state = current.getState();
    const routeKey = state?.routes[state.index]?.key;
    if (!state || !routeKey) return undefined;
    if (state.key === rootKey) return () => activeRoutes.every(isActive => isActive());
    activeRoutes.push(() => {
      const latest = current.getState();
      return latest?.key === state.key && latest.routes[latest.index]?.key === routeKey;
    });
  }
  return undefined;
}

let sequence = 0;
let active: { id: string; generation: number; entry: LedgerJourneySheetEntry } | undefined;
subscribeAccountGeneration(() => { active = undefined; });

export function stageLedgerJourneySheet(entry: LedgerJourneySheetEntry) {
  if (active && active.generation === getAccountGeneration() && active.entry.isCurrent()) return undefined;
  const id = String(++sequence);
  active = { id, generation: getAccountGeneration(), entry };
  return id;
}

export function readLedgerJourneySheet(id?: string) {
  if (active?.id !== id || !active || active.generation !== getAccountGeneration() || !active.entry.isCurrent()) return undefined;
  return active.entry;
}

export function releaseLedgerJourneySheet(id?: string) {
  if (active?.id === id) active = undefined;
}
