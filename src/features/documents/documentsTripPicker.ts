import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";

export const hostedDocumentsTripPickerEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_DOCUMENTS_TRIP_QA === "true";

type TripChoice = { id: string; name: string };
type Picker = {
  accountId: string;
  generation: number;
  isCurrent(): boolean;
  select(trip: TripChoice): void;
};

let sequence = 0;
let active: { id: string; picker: Picker } | undefined;

subscribeAccountGeneration(() => { active = undefined; });

export function openDocumentsTripPicker(picker: Picker) {
  const id = String(++sequence);
  active = { id, picker };
  return id;
}

export function readDocumentsTripPicker(id: string | undefined) {
  if (active?.id !== id || active?.picker.generation !== getAccountGeneration() || !active.picker.isCurrent())
    return undefined;
  return active.picker;
}

export function releaseDocumentsTripPicker(id: string | undefined) {
  if (active?.id === id) active = undefined;
}
