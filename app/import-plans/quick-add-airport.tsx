import { Redirect } from "expo-router";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { SheetScrollView } from "@/components/SheetScrollView";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedManualItineraryEnabled, readManualItinerary, subscribeManualItinerary } from "@/features/day-feed/hostedManualItinerary";
import { FlightAirportPicker } from "@/features/day-feed/FlightAirportField";
import { FlightAirportHandoffContext, type FlightAirportChoice } from "@/features/day-feed/hostedFlightAirport";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function QuickAddAirportRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedQuickAddAirport />;
}

function HostedQuickAddAirport() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation, selection, hasEditor, pop, back } = useHostedItineraryPickerNavigation();
  const airport = useContext(FlightAirportHandoffContext);
  const completed = useRef(false);
  const entry = useSyncExternalStore(subscribeManualItinerary, () => readManualItinerary(invocation));
  const current = entry && hasEditor() ? airport?.read(selection) : null;
  useEffect(() => () => {
    queueMicrotask(() => {
      const pending = airport?.read(selection);
      airport?.release(selection);
      pending?.onClose();
    });
  }, [airport, selection]);

  const complete = (choice: FlightAirportChoice) => {
    if (completed.current || !entry || readManualItinerary(invocation) !== entry) return;
    const latest = airport?.read(selection);
    if (!latest || latest.disabled || !pop()) return;
    completed.current = true;
    const returned = readManualItinerary(invocation) === entry ? airport?.read(selection) : null;
    if (!airport || !returned) return;
    airport.release(selection);
    Keyboard.dismiss();
    try {
      if (!returned.disabled) returned.onChange(choice);
    } finally {
      returned.onClose();
    }
  };
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
