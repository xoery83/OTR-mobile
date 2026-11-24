import { Stack, useLocalSearchParams, useNavigation, usePathname } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { useUiTheme } from "@/ui/theme";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { createFlightAirportHandoff, FlightAirportHandoffContext } from "@/features/day-feed/hostedFlightAirport";
import { createParticipantPickerHandoff, ParticipantPickerHandoffContext } from "@/features/day-feed/participantPickerHandoff";
import { CalendarRangePickerHandoffContext, createCalendarRangePickerHandoff } from "@/features/day-feed/calendarRangePickerHandoff";
import { ItineraryClockHandoffContext, createItineraryClockHandoff } from "@/features/day-feed/itineraryClockPicker";
import { createHostedPlaceSearchHandoff, HostedPlaceSearchHandoffContext } from "@/features/place-search/hostedPlaceSearch";
import { createFormScanSourceHandoff, FormScanSourceHandoffContext } from "@/features/day-feed/formScanSourceHandoff";
import { createTransportTypeHandoff, TransportTypeHandoffContext } from "@/features/day-feed/transportTypePickerHandoff";
import { ManualItineraryExitContext } from "@/features/day-feed/hostedManualItinerary";

export const unstable_settings = { initialRouteName: "index" };

export default function ImportSheetLayout() {
  const colors = useUiTheme();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const pathname = usePathname();
  if (!hostedImportEnabled) {
    return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.transparent } }} />;
  }
  const immersive = Boolean(jobId) || pathname === "/import-plans/quick-add-edit"
    || pathname === "/import-plans/quick-add-airport" || pathname === "/import-plans/quick-add-calendar-range"
    || pathname === "/import-plans/quick-add-place";
  return <HostedImportRoutes immersive={immersive} />;
}

function HostedImportRoutes({ immersive }: { immersive: boolean }) {
  const navigation = useNavigation("/");
  const route = useRoute();
  const [airport] = useState(createFlightAirportHandoff);
  const [participants] = useState(createParticipantPickerHandoff);
  const [calendar] = useState(createCalendarRangePickerHandoff);
  const [clock] = useState(createItineraryClockHandoff);
  const [place] = useState(createHostedPlaceSearchHandoff);
  const [scanSource] = useState(createFormScanSourceHandoff);
  const [transportType] = useState(createTransportTypeHandoff);
  const handler = useRef<(() => void) | null>(null);
  const allowed = useRef(false);
  const exit = useMemo(() => ({
    registerClose(close: () => void) {
      handler.current = close;
      return () => { if (handler.current === close) handler.current = null; };
    },
    allowClose() {
      allowed.current = true;
      queueMicrotask(() => { allowed.current = false; });
    },
    hasOrigin(routeKey: string) {
      const state = navigation.getState();
      return Boolean(state?.routes[state.index]?.key === route.key &&
        state.routes[state.index - 1]?.key === routeKey);
    },
  }), [navigation, route.key]);
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
        <ParticipantPickerHandoffContext.Provider value={participants}>
          <CalendarRangePickerHandoffContext.Provider value={calendar}>
            <ItineraryClockHandoffContext.Provider value={clock}>
              <HostedPlaceSearchHandoffContext.Provider value={place}>
                <FormScanSourceHandoffContext.Provider value={scanSource}>
                  <TransportTypeHandoffContext.Provider value={transportType}>
                    <SheetRouteLayout immersive={immersive} interceptClose={interceptClose} />
                  </TransportTypeHandoffContext.Provider>
                </FormScanSourceHandoffContext.Provider>
              </HostedPlaceSearchHandoffContext.Provider>
            </ItineraryClockHandoffContext.Provider>
          </CalendarRangePickerHandoffContext.Provider>
        </ParticipantPickerHandoffContext.Provider>
      </FlightAirportHandoffContext.Provider>
    </ManualItineraryExitContext.Provider>
  );
}
