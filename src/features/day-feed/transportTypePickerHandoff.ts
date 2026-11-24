import { createContext } from "react";
import { createItineraryPickerHandoff } from "./itineraryPickerHandoff";

export const transportPickerTypes = ["TRAIN", "BUS", "FERRY", "WATER_TAXI", "SHUTTLE", "TRANSFER"] as const;
export type EditableTransportType = typeof transportPickerTypes[number];
export type TransportTypeEntry = {
  selected?: string;
  isCurrent(): boolean;
  choose(value: EditableTransportType): void;
};

export const OpenTransportTypeContext = createContext<((entry: TransportTypeEntry) => void) | null>(null);
export const createTransportTypeHandoff = () => createItineraryPickerHandoff<TransportTypeEntry>();
export const TransportTypeHandoffContext = createContext<ReturnType<typeof createTransportTypeHandoff> | null>(null);
