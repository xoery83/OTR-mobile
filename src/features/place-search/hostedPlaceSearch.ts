import { createContext } from "react";
import type { PlaceSearchBinding } from "@/data/places/applePlaceProvider";
import { createItineraryPickerHandoff } from "@/features/day-feed/itineraryPickerHandoff";
import type { PlaceSearchResult } from "./PlaceSearchSheet";

export type PlaceSearchSheetProps = {
  binding: PlaceSearchBinding;
  initialQuery: string;
  nameChoice: boolean;
  selectionMode?: "confirm" | "immediate";
  onCancel(): void;
  onConfirm(result: PlaceSearchResult): void;
};

export const OpenHostedPlaceSearchContext = createContext<((read: () => PlaceSearchSheetProps | null) => (() => void) | undefined) | null>(null);
export const createHostedPlaceSearchHandoff = () => createItineraryPickerHandoff<PlaceSearchSheetProps>();
export const HostedPlaceSearchHandoffContext = createContext<ReturnType<typeof createHostedPlaceSearchHandoff> | null>(null);
