import type { ComponentProps, ReactElement } from "react";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { createCalendarRangePickerHandoff } from "./calendarRangePickerHandoff";
import { createItineraryPickerHandoff } from "./itineraryPickerHandoff";
import type { LedgerCurrencyChoice } from "@/features/ledger/ledgerCurrencySheet";

import { tripMetadataCoverBusy } from "./tripCoverSheet";
import type { TripBasicEditor } from "./TripBasicEditor";

export const hostedTripMetadataEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_TRIP_SETUP_QA === "true";

export type MetadataEditorElement = ReactElement<Pick<ComponentProps<typeof TripBasicEditor>, "SheetPanel" | "openCoverLibrary" | "openCurrencySettings">>;

type MetadataEditor = {
  editor: MetadataEditorElement | null;
  requestClose(): void;
};

type MetadataCurrency = {
  id: string;
  tripId: string;
  editorKey: string;
  onClose(): void;
  working: boolean;
};

let sequence = 0;
let active: {
  id: string;
  generation: number;
  value: MetadataEditor & { open: boolean };
  currency?: MetadataCurrency;
} | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export const metadataCalendar = createCalendarRangePickerHandoff();
export const metadataCurrencyPicker = createItineraryPickerHandoff<LedgerCurrencyChoice>();

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
  if (!tripMetadataCoverBusy(id) && !active?.currency?.working) sheet.requestClose();
  return true;
}

export function releaseTripMetadataSheet(id: string | undefined) {
  if (active?.id !== id) return;
  active = undefined;
  notify();
}

export function stageTripMetadataCurrency(invocation: string, tripId: string, editorKey: string, onClose: () => void) {
  if (!active || !readTripMetadataSheet(invocation)?.open || active.currency) return undefined;
  const id = String(++sequence);
  active.currency = { id, tripId, editorKey, onClose, working: false };
  return id;
}

export function readTripMetadataCurrency(invocation: string | undefined, currency: string | undefined) {
  if (!readTripMetadataSheet(invocation)?.open || active?.currency?.id !== currency) return undefined;
  return active?.currency;
}

export function setTripMetadataCurrencyWorking(entry: MetadataCurrency | undefined, working: boolean) {
  if (!entry || active?.currency !== entry || !readTripMetadataSheet(active.id)?.open) return false;
  entry.working = working;
  return true;
}

export function releaseTripMetadataCurrency(invocation: string | undefined, currency: string | undefined) {
  const entry = readTripMetadataCurrency(invocation, currency);
  if (!active || !entry) return;
  active.currency = undefined;
  entry.onClose();
}
