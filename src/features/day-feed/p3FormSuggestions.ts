import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import {
  manualStayFieldsSchema,
  type ManualStayFields,
} from "@/data/repositories/manualStayRepository";

export const staySuggestionKeys = [
  "title",
  "location",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "description",
] as const;
export type StaySuggestionKey = (typeof staySuggestionKeys)[number];
export type StaySuggestionBinding = {
  formId: string;
  tripId: string;
  itemId: string;
  generation: number;
  revision: number;
  itemRevision?: number | null;
  mode: "CREATE" | "EDIT";
};
export type SyntheticStayCandidate = {
  id: string;
  targetItemId?: string;
  unsupported?: readonly { field: string; state: "UNSUPPORTED" | "NEEDS_INPUT" }[];
  fields: Partial<Pick<ManualStayFields, StaySuggestionKey>>;
};
export type SyntheticStayResult = {
  kind: "SYNTHETIC_STAY_SUGGESTIONS";
  binding: StaySuggestionBinding;
  candidates: readonly SyntheticStayCandidate[];
};

export function applyStaySuggestions(
  result: SyntheticStayResult,
  current: StaySuggestionBinding,
  candidateId: string,
  selected: readonly StaySuggestionKey[],
  fields: ManualStayFields,
): ManualStayFields | null {
  if (result.kind !== "SYNTHETIC_STAY_SUGGESTIONS") return null;
  return applyStaySuggestionFields(result, current, candidateId, selected, fields);
}

export function applyStaySuggestionFields(
  result: Pick<SyntheticStayResult, "binding" | "candidates">,
  current: StaySuggestionBinding,
  candidateId: string,
  selected: readonly StaySuggestionKey[],
  fields: ManualStayFields,
): ManualStayFields | null {
  if (
    Object.keys(current).some(
      (key) =>
        current[key as keyof StaySuggestionBinding] !==
        result.binding[key as keyof StaySuggestionBinding],
    ) ||
    new Set(result.candidates.map((candidate) => candidate.id)).size !==
      result.candidates.length
  )
    return null;
  const candidate = result.candidates.find((value) => value.id === candidateId);
  if (
    !candidate ||
    (current.mode === "EDIT" && candidate.targetItemId !== current.itemId)
  )
    return null;
  const next = structuredClone(fields);
  for (const key of selected) {
    if (!staySuggestionKeys.includes(key) || !Object.hasOwn(candidate.fields, key))
      return null;
    const value = manualStayFieldsSchema.shape[key].safeParse(candidate.fields[key]);
    if (!value.success) return null;
    if (key === "startDate" || key === "endDate") {
      try {
        validateCalendarDate(String(value.data));
      } catch {
        return null;
      }
    }
    Object.assign(next, { [key]: value.data });
    if (key === "title")
      next.stayDetails = { ...next.stayDetails, propertyName: String(value.data) };
  }
  // Suggestions may fill an incomplete Create draft; Save still owns full qualification.
  if (
    next.startDate &&
    next.endDate &&
    (next.endDate < next.startDate ||
      (next.endDate === next.startDate &&
        next.startTime &&
        next.endTime &&
        next.endTime < next.startTime))
  )
    return null;
  return next;
}
