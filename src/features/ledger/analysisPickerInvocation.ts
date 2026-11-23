import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type {
  AnalysisExpense,
  AnalysisRange,
  AnalysisRangePreset,
} from "@/domain/ledger/spendingAnalysis";

import type { ReportingScope } from "@/domain/ledger/reporting";

export const hostedLedgerAnalysisPickerEnabled =
  process.env.EXPO_PUBLIC_OTR_SHEET_LEDGER_ANALYSIS_QA === "true";

export type AnalysisPicker =
  | {
      kind: "excluded";
      scope: ReportingScope;
      expenses: readonly AnalysisExpense[];
      open(id: string): void;
    }
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
  | { id: string; generation: number; isCurrent(): boolean; originFocused(): boolean; picker: AnalysisPicker }
  | undefined;

subscribeAccountGeneration(() => {
  active = undefined;
});

export function openAnalysisPicker(
  picker: AnalysisPicker,
  isCurrent: () => boolean,
  originFocused: () => boolean,
) {
  const id = String(++sequence);
  active = { id, generation: getAccountGeneration(), isCurrent, originFocused, picker };
  return id;
}

export function completeAnalysisPicker(id: string | undefined, picker: AnalysisPicker, apply: () => void) {
  if (readAnalysisPicker(id) !== picker || !active?.originFocused()) return;
  active = undefined;
  apply();
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
