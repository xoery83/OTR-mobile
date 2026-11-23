import { createContext } from "react";
import { createItineraryPickerHandoff } from "./itineraryPickerHandoff";
import type { TripCalendarRangePickerProps, TripDateRange } from "./TripCalendarRangeField";

type CalendarRangeEntry = TripCalendarRangePickerProps & {
  disabled?: boolean;
  onChange(value: TripDateRange): void;
  onClose(): void;
};

export const OpenCalendarRangePickerContext = createContext<((read: () => CalendarRangeEntry | null) => boolean) | null>(null);

export const createCalendarRangePickerHandoff = () => createItineraryPickerHandoff<CalendarRangeEntry>();
