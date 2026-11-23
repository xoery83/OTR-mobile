import { createContext } from "react";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { ManualItineraryProps } from "./ManualItineraryContent";

export const hostedManualItineraryEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_MANUAL_ITINERARY_QA === "true";

export const ManualItineraryExitContext = createContext<{
  registerClose(handler: () => void): () => void;
  allowClose(): void;
} | null>(null);

let sequence = 0;
let pending: { id: string; read(): ManualItineraryProps | undefined } | undefined;
subscribeAccountGeneration(() => { pending = undefined; });

export function stageManualItinerary(read: () => ManualItineraryProps | undefined) {
  const id = String(++sequence);
  pending = { id, read };
  return id;
}

export function readManualItinerary(id: string | undefined) {
  if (!pending || pending.id !== id) return undefined;
  const entry = pending.read();
  return entry?.generation === getAccountGeneration() ? entry : undefined;
}

export function releaseManualItinerary(id: string | undefined) {
  if (pending?.id === id) pending = undefined;
}
