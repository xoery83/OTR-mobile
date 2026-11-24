import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { createItineraryPickerHandoff } from "./itineraryPickerHandoff";

type ClockField = {
  label: string;
  disabled: boolean;
  mode?: "date" | "datetime";
  zoneHint?: string;
  apply(date: Date): void;
  clear(): void;
  onClose?(): void;
};

type ClockEntry = ClockField & { initial: Date; onClose(): void };

export const OpenItineraryClockContext = createContext<((read: () => ClockEntry | null) => boolean) | null>(null);
export const createItineraryClockHandoff = () => createItineraryPickerHandoff<ClockEntry>();
export const ItineraryClockHandoffContext = createContext<ReturnType<typeof createItineraryClockHandoff> | null>(null);

export function formatLocalClock(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function useHostedItineraryClock(field: ClockField) {
  const open = useContext(OpenItineraryClockContext);
  const latest = useRef<ClockField | null>(null);
  const active = useRef(false);
  const generation = getAccountGeneration();
  useLayoutEffect(() => {
    latest.current = field;
    return () => { latest.current = null; };
  }, [field]);

  if (!open) return undefined;
  return (initial: Date) => {
    if (active.current) return;
    active.current = true;
    const close = () => {
      active.current = false;
      latest.current?.onClose?.();
    };
    if (!open(() => {
      if (generation !== getAccountGeneration() || !latest.current) return null;
      return { ...latest.current, initial, onClose: close };
    })) close();
  };
}
