import { Redirect, useLocalSearchParams } from "expo-router";
import { useSyncExternalStore } from "react";
import { useTripView } from "@/features/day-feed/TripViewContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { Stage4BPhysicalSmokeScreen } from "@/components/Stage4BPhysicalSmokeScreen";
import { isExplicitTripDay } from "@/components/tripShellNavigation";

export default function TodayRoute() {
  const params = useLocalSearchParams();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { view, resumeView } = useTripView();
  if (process.env.EXPO_PUBLIC_OTR_STAGE4B_PHYSICAL_SMOKE === "1") {
    return <Stage4BPhysicalSmokeScreen />;
  }
  if (!isExplicitTripDay(params))
    return (
      <Redirect href={{ pathname: "/trip", params: { view: "trips", tripId: "" } }} />
    );
  const saved = [view, resumeView].find((day) => day?.generation === generation);
  const malformed = ["tripId", "date", "zone", "viewMode"].some(
    (key) => params[key] !== undefined && typeof params[key] !== "string",
  );
  const tripId = params.tripId || saved?.tripId;
  if (malformed || typeof tripId !== "string" || !tripId.trim())
    return (
      <Redirect href={{ pathname: "/trip", params: { view: "trips", tripId: "" } }} />
    );
  const matching = [view, resumeView].find(
    (day) => day?.generation === generation && day.tripId === tripId,
  );
  // Legacy Day links replace the JS Tab with the existing native Trip Stack.
  return (
    <Redirect
      href={{
        pathname: "/trip-home",
        params: {
          ...params,
          tripId,
          view: "day",
          date: params.date ?? matching?.date ?? "",
          zone:
            params.zone ?? (params.viewMode === "FLOATING" ? "" : (matching?.zone ?? "")),
          viewMode:
            params.viewMode ??
            (params.zone !== undefined
              ? "NAMED_ZONE"
              : (matching?.viewMode ?? "NAMED_ZONE")),
        },
      }}
    />
  );
}
