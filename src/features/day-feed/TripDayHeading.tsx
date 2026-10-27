import { useCallback, useEffect, useSyncExternalStore } from "react";
import { dayHeaderStylePreference } from "@/native/dayHeaderStylePreference";
import { DayFeedFidelityHeading } from "./DayFeedFidelityHeading";
import { unresolvedDayHeaderDestination } from "./dayHeaderPresentation";

export function TripDayHeading({
  tripId,
  ...props
}: {
  tripId: string;
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
  useEffect(() => {
    void dayHeaderStylePreference.hydrate(tripId);
  }, [tripId]);
  return (
    <DayFeedFidelityHeading
      {...props}
      styleMode={styleMode}
      destination={unresolvedDayHeaderDestination}
      onCycleStyle={() => {
        void dayHeaderStylePreference.cycle(tripId);
      }}
    />
  );
}
