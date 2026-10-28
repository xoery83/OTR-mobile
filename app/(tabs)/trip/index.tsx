import { useSyncExternalStore } from "react";
import { useTripView } from "@/features/day-feed/TripViewContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { useLocalSearchParams } from "expo-router";
import { TripScreen } from "@/features/day-feed/TripScreen";
import { GlobalMenu } from "@/components/GlobalMenu";
import { TripSearchEntry } from "@/features/trip-search/TripSearchEntry";
import { NavigationContentFrame } from "@/components/navigationChrome";
export default function TripRoute() {
  const params = useLocalSearchParams<{ tripId?: string; view?: string }>();
  const selectedTrip =
    !!params.tripId && !["trips", "create"].includes(params.view ?? "");
  const home = selectedTrip && params.view !== "day";
  const day = selectedTrip && params.view === "day";
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { dayShellChrome } = useTripView();
  const hideActions =
    day &&
    !!dayShellChrome &&
    dayShellChrome.tripId === params.tripId &&
    dayShellChrome.generation === generation &&
    !dayShellChrome.navigationVisible;
  return (
    <>
      {!hideActions ? <GlobalMenu module="TRIP" nativeToolbar /> : null}
      {!hideActions ? (
        <TripSearchEntry
          nativeToolbar
          entry={selectedTrip ? "HOME" : "MY_TRIPS"}
          tripId={selectedTrip ? params.tripId : undefined}
          showUnavailableTripEdit={home}
        />
      ) : null}
      <NavigationContentFrame underlapHeader={home || day}>
        <TripScreen contentFrameManaged={!home && !day} />
      </NavigationContentFrame>
    </>
  );
}
