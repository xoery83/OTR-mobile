import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type {
  AnalysisRange,
  AnalysisRangePreset,
} from "@/domain/ledger/spendingAnalysis";

export const hostedLedgerAnalysisPickerEnabled =
  process.env.EXPO_PUBLIC_OTR_SHEET_LEDGER_ANALYSIS_QA === "true";

export type AnalysisPicker =
  | {
      kind: "range";
      presets: readonly AnalysisRangePreset[];
      today: string;
      initial: { from: string; through: string };
      choose(range: AnalysisRange): void;
    }
  | {
      kind: "category";
      options: readonly string[];
      selected: string | null;
      choose(category: string | null): void;
    };

let sequence = 0;
let active:
  | { id: string; generation: number; isCurrent(): boolean; picker: AnalysisPicker }
  | undefined;

subscribeAccountGeneration(() => {
  active = undefined;
});

export function openAnalysisPicker(picker: AnalysisPicker, isCurrent: () => boolean) {
  const id = String(++sequence);
  active = { id, generation: getAccountGeneration(), isCurrent, picker };
  return id;
}

export function readAnalysisPicker(id: string | undefined) {
  if (
    !active ||
    active.id !== id ||
    active.generation !== getAccountGeneration() ||
    !active.isCurrent()
  )
    return undefined;
  return active.picker;
}

export function releaseAnalysisPicker(id: string | undefined) {
  if (active?.id === id) active = undefined;
}
