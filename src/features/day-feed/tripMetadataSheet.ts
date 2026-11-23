import type { ComponentProps, ReactElement } from "react";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { createCalendarRangePickerHandoff } from "./calendarRangePickerHandoff";

import type { TripBasicEditor } from "./TripBasicEditor";

export const hostedTripMetadataEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_TRIP_SETUP_QA === "true";

export type MetadataEditorElement = ReactElement<Pick<ComponentProps<typeof TripBasicEditor>, "SheetPanel">>;

type MetadataEditor = {
  editor: MetadataEditorElement | null;
  requestClose(): void;
};

let sequence = 0;
let active: { id: string; generation: number; value: MetadataEditor & { open: boolean } } | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export const metadataCalendar = createCalendarRangePickerHandoff();

subscribeAccountGeneration(() => {
  active = undefined;
  notify();
});

export function subscribeTripMetadataSheet(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function openTripMetadataSheet(generation: number, value: MetadataEditor) {
  if (active || generation !== getAccountGeneration() || !value.editor) return undefined;
  const id = String(++sequence);
  active = { id, generation, value: { ...value, open: true } };
  notify();
  return id;
}

export function readTripMetadataSheet(id: string | undefined) {
  return active && active.id === id && active.generation === getAccountGeneration()
    ? active.value : undefined;
}

export function updateTripMetadataSheet(id: string | undefined, value: MetadataEditor) {
  if (!active || !readTripMetadataSheet(id)) return;
  active.value = { ...value, open: !!value.editor };
  notify();
}

export function interceptTripMetadataClose(id: string | undefined) {
  const sheet = readTripMetadataSheet(id);
  if (!sheet?.open) return false;
  sheet.requestClose();
  return true;
}

export function releaseTripMetadataSheet(id: string | undefined) {
  if (active?.id !== id) return;
  active = undefined;
  notify();
}
