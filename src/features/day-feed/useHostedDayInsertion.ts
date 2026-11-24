import { router, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useLayoutEffect, useRef } from "react";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { hostedManualItineraryEnabled, readManualItinerary, releaseManualItinerary, stageManualItinerary } from "./hostedManualItinerary";

export function useHostedDayInsertion({
  active, today, tripId, generation, localOnly, tripStartDate, tripEndDate, onSaved,
}: {
  active: boolean;
  today: boolean;
  tripId: string;
  generation: number;
  localOnly: boolean;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  onSaved(tripId: string, generation: number): void;
}) {
  const navigation = useNavigation();
  const rootNavigation = useNavigation("/");
  const route = useRoute();
  const current = useRef<{ tripId: string; generation: number; invocation?: string } | null>(null);
  useLayoutEffect(() => {
    const scope = { tripId, generation, invocation: undefined as string | undefined };
    current.current = active ? scope : null;
    return () => {
      releaseManualItinerary(scope.invocation);
      if (current.current === scope) current.current = null;
    };
  }, [active, generation, localOnly, route.key, today, tripId]);

  const hasOrigin = (rootOriginKey: string) => {
    const state = navigation.getState();
    const origin = state?.routes.find(candidate => candidate.key === route.key);
    const params = origin?.params;
    return Boolean(origin && (rootOriginKey === route.key || state?.routes[state.index]?.key === route.key) &&
      generation === getAccountGeneration() && (today ||
      (params && "view" in params && params.view === "day" && "tripId" in params && params.tripId === tripId)));
  };

  return ({ date, startTime }: { date: string; startTime: string | null }) => {
    if (!hostedImportEnabled || !hostedManualItineraryEnabled) return false;
    const root = rootNavigation.getState();
    const rootOriginKey = root?.routes[root.index]?.key;
    const scope = current.current;
    if (!rootOriginKey || scope?.tripId !== tripId || scope.generation !== generation ||
        !navigation.isFocused() || !hasOrigin(rootOriginKey) || readManualItinerary(scope.invocation)) return true;

    const entry = {
      entryPoint: "day-insertion" as const,
      dayInsertionOriginKey: rootOriginKey,
      localOnly,
      tripId,
      generation,
      initialDate: date,
      initialStartTime: startTime,
      tripStartDate,
      tripEndDate,
      onClose: () => {},
      onSaved: () => {
        if (current.current === scope && hasOrigin(rootOriginKey) && navigation.isFocused())
          onSaved(tripId, generation);
      },
    };
    const invocation = stageManualItinerary(() =>
      current.current === scope && hasOrigin(rootOriginKey) ? entry : undefined);
    scope.invocation = invocation;
    router.push({ pathname: "/import-plans/quick-add-itinerary", params: { invocation, entryPoint: entry.entryPoint } });
    return true;
  };
}
