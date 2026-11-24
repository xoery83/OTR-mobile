import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { LedgerJourneyContext } from "@/domain/ledger/journeyContext";
import type { JourneyPickerSection } from "./dashboardPresentation";
export { captureActiveChildRoutes as captureLedgerJourneyOrigin } from "@/features/sheet-navigation/captureActiveChildRoutes";

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
