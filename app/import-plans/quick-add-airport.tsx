import { Redirect, useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { SheetScrollView } from "@/components/SheetScrollView";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedManualItineraryEnabled, readManualItinerary } from "@/features/day-feed/hostedManualItinerary";
import { FlightAirportPicker } from "@/features/day-feed/FlightAirportField";
import { FlightAirportHandoffContext, type FlightAirportChoice } from "@/features/day-feed/hostedFlightAirport";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function QuickAddAirportRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedQuickAddAirport />;
}

function HostedQuickAddAirport() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation, selection } = useLocalSearchParams<{ invocation?: string; selection?: string }>();
  const airport = useContext(FlightAirportHandoffContext);
  const navigation = useNavigation();
  const route = useRoute();
  const { isExitPending } = useSheetMotion();
  const completed = useRef(false);
  const current = readManualItinerary(invocation) ? airport?.read(selection) : null;
  useEffect(() => () => {
    airport?.read(selection)?.onClose();
    airport?.release(selection);
  }, [airport, selection]);

  const complete = (choice?: FlightAirportChoice) => {
    const state = navigation.getState();
    if (completed.current || !navigation.isFocused() || isExitPending() || state?.routes[state.index]?.key !== route.key) return;
    const latest = readManualItinerary(invocation) ? airport?.read(selection) : null;
    if (choice && (!latest || latest.disabled)) return;
    completed.current = true;
    Keyboard.dismiss();
    navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
    if (choice && readManualItinerary(invocation) && airport?.read(selection)) latest?.onChange(choice);
  };
  const back = () => complete();
  if (!current || current.disabled) {
    return <SheetRoutePanel title={current?.label ?? t("formEntry.title")} onBack={back}>{null}</SheetRoutePanel>;
  }
  return (
    <FlightAirportPicker label={current.label} initialQuery={current.initialQuery} onClose={back} onSelect={complete} doneInToolbar>
      {(search, results) => (
        <SheetRoutePanel title={current.label} onBack={back} ownsScroll action={{ label: t("common.done"), onPress: back }}>
          <View style={styles.column}>{search}</View>
          <SheetScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={styles.column}
          >
            {results}
          </SheetScrollView>
        </SheetRoutePanel>
      )}
    </FlightAirportPicker>
  );
}

const styles = StyleSheet.create({
  column: { alignSelf: "center", width: "100%", maxWidth: 680 },
});
