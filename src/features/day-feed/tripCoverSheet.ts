import type { ComponentProps } from "react";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { TripCoverPicker } from "./TripCoverPicker";

export const hostedTripCoverEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_TRIP_SETUP_QA === "true";

type Cover = Pick<ComponentProps<typeof TripCoverPicker>, "trip" | "selectedRaw" | "onSelect" | "onChoosePhoto">;

let sequence = 0;
let active: { id: string; generation: number; cover: Cover; busy: boolean } | undefined;
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

export function openTripCoverSheet(generation: number, cover: Cover) {
  if (active || generation !== getAccountGeneration()) return undefined;
  const id = String(++sequence);
  active = { id, generation, cover, busy: false };
  notify();
  return id;
}

export function readTripCoverSheet(id: string | undefined) {
  return active && active.id === id && active.generation === getAccountGeneration()
    ? active.cover : undefined;
}

export function updateTripCoverSheet(id: string | undefined, cover: Cover) {
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

export function releaseTripCoverSheet(id: string | undefined) {
  if (active?.id !== id) return;
  active = undefined;
  notify();
}
