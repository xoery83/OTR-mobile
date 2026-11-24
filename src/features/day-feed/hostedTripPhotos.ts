import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { ReactNode } from "react";

export const hostedTripPhotosEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_TRIP_PHOTOS_QA === "true";

type TripPhotosSheet = {
  content: ReactNode;
  isCurrent(): boolean;
  isBusy(): boolean;
};

let sequence = 0;
let active: { id: string; generation: number; sheet: TripPhotosSheet } | undefined;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach(listener => listener());

export function readTripPhotosSheet(id: string | undefined) {
  if (!active || active.id !== id || active.generation !== getAccountGeneration()) return;
  if (active.sheet.isCurrent()) return active.sheet;
}

export function stageTripPhotosSheet(sheet: TripPhotosSheet) {
  const id = String(++sequence);
  active = { id, generation: getAccountGeneration(), sheet };
  publish();
  return id;
}

export function updateTripPhotosSheet(id: string, content: ReactNode) {
  if (!active || !readTripPhotosSheet(id) || active.sheet.content === content) return;
  active.sheet = { ...active.sheet, content };
  publish();
}

export function releaseTripPhotosSheet(id: string | undefined) {
  if (!active || active.id !== id) return;
  active = undefined;
  publish();
}

export function subscribeTripPhotosSheet(listener: () => void) {
  listeners.add(listener);
  const stop = subscribeAccountGeneration(listener);
  return () => { listeners.delete(listener); stop(); };
}
