import { useSyncExternalStore } from "react";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { useTripView } from "@/features/day-feed/TripViewContext";
import { Stack, router } from "expo-router";
import { LocalTripWorkspace } from "@/features/day-feed/LocalTripWorkspace";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";

const unusedAction = () => {};
export default function PastTripsRoute() {
  useUiLocale();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { switchTrip } = useTripView();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("myTrips.past"),
          headerBackTitle: t("dayFeed.myTrips"),
        }}
      />
      <LocalTripWorkspace
        mode="PAST"
        tripId={null}
        onOpen={(id) => {
          if (generation !== getAccountGeneration()) return;
          switchTrip(id, generation);
          router.navigate({
            pathname: "/trip",
            params: { tripId: id, date: "", zone: "", view: "home" },
          });
        }}
        onKnownTrip={unusedAction}
        onOpenToday={unusedAction}
        onCreate={unusedAction}
        onBackToTrips={() => router.back()}
      />
    </>
  );
}
