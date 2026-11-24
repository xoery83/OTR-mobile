import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { TripCoverSheetValue } from "./TripCoverPicker";

export const hostedTripCoverEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_TRIP_SETUP_QA === "true";

let sequence = 0;
let active: { id: string; generation: number; cover: TripCoverSheetValue; busy: boolean; metadataOwner?: string } | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

subscribeAccountGeneration(() => {
  active = undefined;
  notify();
});

export function subscribeTripCoverSheet(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function openTripCoverSheet(generation: number, cover: TripCoverSheetValue, metadataOwner?: string) {
  if (active || generation !== getAccountGeneration()) return undefined;
  const id = String(++sequence);
  active = { id, generation, cover, busy: false, metadataOwner };
  notify();
  return id;
}

export function readTripCoverSheet(id: string | undefined) {
  return active && active.id === id && active.generation === getAccountGeneration()
    ? active.cover : undefined;
}

export function updateTripCoverSheet(id: string | undefined, cover: TripCoverSheetValue) {
  if (!active || !readTripCoverSheet(id) || active.cover.trip.id !== cover.trip.id) return;
  active.cover = cover;
  notify();
}

export function setTripCoverSheetBusy(id: string | undefined, busy: boolean) {
  if (!active || !readTripCoverSheet(id) || active.busy === busy) return;
  active.busy = busy;
  notify();
}

export function tripCoverSheetBusy(id: string | undefined) {
  return Boolean(readTripCoverSheet(id) && active?.busy);
}

export function readTripMetadataCover(invocation: string | undefined, selection: string | undefined) {
  return invocation && active?.metadataOwner === invocation ? readTripCoverSheet(selection) : undefined;
}

export function tripMetadataCoverBusy(invocation: string | undefined) {
  return Boolean(invocation && active?.metadataOwner === invocation && tripCoverSheetBusy(active.id));
}

export function releaseTripMetadataCover(invocation: string | undefined, selection: string | undefined) {
  if (readTripMetadataCover(invocation, selection)) releaseTripCoverSheet(selection);
}

export function releaseTripMetadataCoverOwner(invocation: string | undefined) {
  if (invocation && active?.metadataOwner === invocation) releaseTripCoverSheet(active.id);
}

export function releaseTripCoverSheet(id: string | undefined) {
  if (active?.id !== id) return;
  active = undefined;
  notify();
}
