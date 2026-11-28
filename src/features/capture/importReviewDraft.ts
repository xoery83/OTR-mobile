import { createContext } from "react";
import type { UniversalV3Decision } from "@/data/operations/universalV3Review";

export type ImportReviewDraft = {
  expanded?: string;
  source?: string;
  values: Record<string, Record<string, string>>;
  choices: Record<string, UniversalV3Decision>;
};

// The mounted Import sheet owns these in-memory edits. They are never submission intent.
export const ImportReviewDraftContext = createContext<Map<string, ImportReviewDraft> | null>(null);
