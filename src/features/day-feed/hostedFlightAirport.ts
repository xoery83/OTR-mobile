import { createContext } from "react";
import { createItineraryPickerHandoff } from "./itineraryPickerHandoff";

export type FlightAirportChoice = { code: string; name: string; zone: string | null };
export type FlightAirportFieldProps = {
  label: string;
  code: string;
  name: string;
  disabled: boolean;
  onEditingChange?(open: boolean): void;
  onChange(value: FlightAirportChoice): void;
};

type AirportEntry = FlightAirportFieldProps & {
  initialQuery: string;
  onClose(): void;
};

export const OpenFlightAirportContext = createContext<((read: () => AirportEntry | null) => boolean) | null>(null);
export const createFlightAirportHandoff = () => createItineraryPickerHandoff<AirportEntry>();
export const FlightAirportHandoffContext = createContext<ReturnType<typeof createFlightAirportHandoff> | null>(null);
