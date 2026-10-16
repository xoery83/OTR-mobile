import { Redirect, useLocalSearchParams } from "expo-router";
import { TripScreen } from "@/features/day-feed/TripScreen";
import { Stage4BPhysicalSmokeScreen } from "@/components/Stage4BPhysicalSmokeScreen";
import { isExplicitTripDay } from "@/components/tripShellNavigation";

export default function TodayRoute() {
  const params = useLocalSearchParams();
  if (process.env.EXPO_PUBLIC_OTR_STAGE4B_PHYSICAL_SMOKE === "1") {
    return <Stage4BPhysicalSmokeScreen />;
  }
  if (!isExplicitTripDay(params))
    return (
      <Redirect href={{ pathname: "/trip", params: { view: "trips", tripId: "" } }} />
    );
  return <TripScreen today />;
}
