import { Stack, useLocalSearchParams, usePathname } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useUiTheme } from "@/ui/theme";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { createFlightAirportHandoff, FlightAirportHandoffContext } from "@/features/day-feed/hostedFlightAirport";
import { ManualItineraryExitContext } from "@/features/day-feed/hostedManualItinerary";

export const unstable_settings = { initialRouteName: "index" };

export default function ImportSheetLayout() {
  const colors = useUiTheme();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const pathname = usePathname();
  if (!hostedImportEnabled) {
    return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.transparent } }} />;
  }
  const batchPage = pathname === "/import-plans/review" || pathname === "/import-plans/updates";
  return <HostedImportRoutes immersive={Boolean(jobId) || batchPage} />;
}

function HostedImportRoutes({ immersive }: { immersive: boolean }) {
  const [airport] = useState(createFlightAirportHandoff);
  const handler = useRef<(() => void) | null>(null);
  const allowed = useRef(false);
  const exit = useMemo(() => ({
    registerClose(close: () => void) {
      handler.current = close;
      return () => { if (handler.current === close) handler.current = null; };
    },
    allowClose() { allowed.current = true; },
  }), []);
  const interceptClose = useCallback(() => {
    if (allowed.current) {
      allowed.current = false;
      return false;
    }
    if (!handler.current) return false;
    handler.current();
    return true;
  }, []);
  return (
    <ManualItineraryExitContext.Provider value={exit}>
      <FlightAirportHandoffContext.Provider value={airport}>
        <SheetRouteLayout immersive={immersive} interceptClose={interceptClose} />
      </FlightAirportHandoffContext.Provider>
    </ManualItineraryExitContext.Provider>
  );
}
