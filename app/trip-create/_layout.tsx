import { router, useNavigationContainerRef } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { TripCreateSheetContext } from "@/features/day-feed/hostedTripCreate";
import { useTripView } from "@/features/day-feed/TripViewContext";

export default function TripCreateLayout() {
  const navigation = useNavigationContainerRef() as {
    getCurrentRoute(): { key: string } | undefined;
  };
  const { switchTrip } = useTripView();
  const closeGuard = useRef<(() => boolean | Promise<boolean>) | undefined>(undefined);
  const created = useRef<{ tripId: string; originRouteKey: string; generation: number } | undefined>(undefined);
  const port = useMemo(() => ({
    registerClose(guard: () => boolean | Promise<boolean>) {
      closeGuard.current = guard;
      return () => {
        if (closeGuard.current === guard) closeGuard.current = undefined;
      };
    },
    recordCreatedTrip(tripId: string, owner: { originRouteKey: string; generation: number }) {
      created.current = { tripId, originRouteKey: owner.originRouteKey, generation: owner.generation };
    },
  }), []);
  const confirmClose = useCallback(() => closeGuard.current?.() ?? true, []);
  const onDismiss = useCallback(() => {
    const saved = created.current;
    if (!saved) return;
    created.current = undefined;
    if (saved.generation !== getAccountGeneration() ||
        navigation.getCurrentRoute()?.key !== saved.originRouteKey) return;
    switchTrip(saved.tripId, saved.generation);
    router.push({ pathname: "/trip-home", params: { tripId: saved.tripId, view: "home" } });
  }, [navigation, switchTrip]);
  return (
    <TripCreateSheetContext.Provider value={port}>
      <SheetRouteLayout immersive guardNativeBack confirmClose={confirmClose} onDismiss={onDismiss} />
    </TripCreateSheetContext.Provider>
  );
}
