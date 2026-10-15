import { useLocalSearchParams } from "expo-router";
import { TripScreen } from "@/features/day-feed/TripScreen";
import { GlobalMenu } from "@/components/GlobalMenu";
import { TripSearchEntry } from "@/features/trip-search/TripSearchEntry";
import { NavigationContentFrame } from "@/components/navigationChrome";
export default function TripRoute() {
  const params = useLocalSearchParams<{ tripId?: string; view?: string }>();
  const home = !!params.tripId && !["trips", "create"].includes(params.view ?? "");
  return (
    <>
      <GlobalMenu module="TRIP" nativeToolbar />
      <TripSearchEntry
        nativeToolbar
        entry={home ? "HOME" : "MY_TRIPS"}
        tripId={home ? params.tripId : undefined}
      />
      <NavigationContentFrame>
        <TripScreen />
      </NavigationContentFrame>
    </>
  );
}
