import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { dayHeaderStylePreference } from "@/native/dayHeaderStylePreference";
import { DayFeedFidelityHeading } from "./DayFeedFidelityHeading";
import { unresolvedDayHeaderDestination } from "./dayHeaderPresentation";
import {
  resolveDayHeaderDestination,
  type DayHeaderDestinationRead,
} from "./dayHeaderDestinationRead";
import { useUiLocale } from "@/ui/useUiLocale";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";

export function TripDayHeading({
  tripId,
  destinationRead,
  ...props
}: {
  tripId: string;
  destinationRead?: DayHeaderDestinationRead | null;
} & Omit<
  Parameters<typeof DayFeedFidelityHeading>[0],
  "styleMode" | "destination" | "onCycleStyle"
>) {
  const subscribe = useCallback(
    (notify: () => void) => dayHeaderStylePreference.subscribe(tripId, notify),
    [tripId],
  );
  const snapshot = useCallback(() => dayHeaderStylePreference.get(tripId), [tripId]);
  const styleMode = useSyncExternalStore(subscribe, snapshot, snapshot);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const locale = useUiLocale();
  const destination = useMemo(() => {
    // Locale is an explicit cache fence; accepted business labels remain original.
    void locale;
    return destinationRead &&
      destinationRead.tripId === tripId &&
      destinationRead.generation === generation
      ? resolveDayHeaderDestination(destinationRead, props.date)
      : unresolvedDayHeaderDestination;
  }, [destinationRead, tripId, props.date, generation, locale]);
  useEffect(() => {
    void dayHeaderStylePreference.hydrate(tripId);
  }, [tripId]);
  return (
    <DayFeedFidelityHeading
      {...props}
      styleMode={styleMode}
      destination={destination}
      onCycleStyle={() => {
        void dayHeaderStylePreference.cycle(tripId);
      }}
    />
  );
}
