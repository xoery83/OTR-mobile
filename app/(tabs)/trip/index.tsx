import { useLocalSearchParams } from "expo-router";
import { TripScreen } from "@/features/day-feed/TripScreen";
import { GlobalMenu } from "@/components/GlobalMenu";
import { TripSearchEntry } from "@/features/trip-search/TripSearchEntry";
import { NavigationContentFrame } from "@/components/navigationChrome";
import { View } from "react-native";
export default function TripRoute() {
  const params = useLocalSearchParams<{ tripId?: string; view?: string }>();
  const selectedTrip =
    !!params.tripId && !["trips", "create"].includes(params.view ?? "");
  const home = selectedTrip && params.view !== "day";
  const day = selectedTrip && params.view === "day";
  return (
    <>
      <GlobalMenu module="TRIP" nativeToolbar />
      <TripSearchEntry
        nativeToolbar
        entry={selectedTrip ? "HOME" : "MY_TRIPS"}
        tripId={selectedTrip ? params.tripId : undefined}
        showUnavailableTripEdit={home}
      />
      {home ? (
        <View style={{ flex: 1 }}>
          <TripScreen />
        </View>
      ) : (
        <NavigationContentFrame underlapHeader={day}>
          <TripScreen contentFrameManaged={!day} />
        </NavigationContentFrame>
      )}
    </>
  );
}
