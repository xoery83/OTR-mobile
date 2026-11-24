import { createContext } from "react";
import type { CaptureSelection } from "@/features/capture/captureStaging";
import { createItineraryPickerHandoff } from "./itineraryPickerHandoff";

export const formScanSourceOptions = [
  ["camera", "ui.camera"],
  ["photos", "formAutofill.photos"],
  ["files", "formAutofill.files"],
] as const;

export type FormScanSource = CaptureSelection["source"];
export type FormScanSourceEntry = {
  enabled(source: FormScanSource): boolean;
  canPick: boolean;
  choose(source: FormScanSource, isCurrent?: () => boolean): void | Promise<void>;
};

export const OpenFormScanSourceContext = createContext<((read: () => FormScanSourceEntry | null) => void) | null>(null);
export const createFormScanSourceHandoff = () => createItineraryPickerHandoff<FormScanSourceEntry & {
  acquire(source: FormScanSource): void;
}>();
export const FormScanSourceHandoffContext = createContext<ReturnType<typeof createFormScanSourceHandoff> | null>(null);
