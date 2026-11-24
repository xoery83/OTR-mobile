import { createContext } from "react";
import { createItineraryPickerHandoff } from "./itineraryPickerHandoff";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { createCalendarRangePickerHandoff } from "./calendarRangePickerHandoff";

export const hostedTripCreatePickersEnabled: boolean = true;

const listeners = new Set<() => void>();
let version = 0;

export const getTripCreatePickerVersion = () => version;
export function subscribeTripCreatePickers(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function notifyRelease() {
  version += 1;
  listeners.forEach(listener => listener());
}
subscribeAccountGeneration(notifyRelease);

const tripCreateCalendar = createCalendarRangePickerHandoff();
export function releaseTripCreateCalendar(selection: string | undefined) {
  if (!selection) return;
  tripCreateCalendar.release(selection);
  notifyRelease();
}

export function readTripCreateCalendar(selection: string | undefined) {
  return hostedTripCreatePickersEnabled ? tripCreateCalendar.read(selection) : undefined;
}

export function stageTripCreateCalendar(
  generation: number,
  read: Parameters<typeof tripCreateCalendar.stage>[0],
) {
  return tripCreateCalendar.stage(() => generation === getAccountGeneration() ? read() : null);
}


export type TripCreateNameEntry = {
  self: boolean;
  initial: string;
  disabled: boolean;
  apply(value: string): void;
  onClose(): void;
};

export const OpenTripCreateNameContext =
  createContext<((read: () => TripCreateNameEntry | null) => boolean) | null>(null);

const tripCreateName = createItineraryPickerHandoff<TripCreateNameEntry>();
export function releaseTripCreateName(selection: string | undefined) {
  if (!selection) return;
  tripCreateName.release(selection);
  notifyRelease();
}

export function readTripCreateName(selection: string | undefined) {
  return hostedTripCreatePickersEnabled ? tripCreateName.read(selection) : undefined;
}

export function stageTripCreateName(generation: number, read: () => TripCreateNameEntry | null) {
  return tripCreateName.stage(() => generation === getAccountGeneration() ? read() : null);
}
