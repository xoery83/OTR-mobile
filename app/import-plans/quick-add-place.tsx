import { Redirect } from "expo-router";
import { useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { SheetScrollView } from "@/components/SheetScrollView";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { hostedManualItineraryEnabled, readManualItinerary, subscribeManualItinerary } from "@/features/day-feed/hostedManualItinerary";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import { HostedPlaceSearchHandoffContext } from "@/features/place-search/hostedPlaceSearch";
import { PlaceSearchContent, type PlaceSearchResult, type PlaceSearchSurfaceProps } from "@/features/place-search/PlaceSearchSheet";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function QuickAddPlaceRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedPlace />;
}

function HostedPlace() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation, selection, hasEditor, pop, back } = useHostedItineraryPickerNavigation();
  const place = useContext(HostedPlaceSearchHandoffContext);
  const completed = useRef(false);
  const owner = useSyncExternalStore(subscribeManualItinerary, () => readManualItinerary(invocation));
  const current = owner && hasEditor() ? place?.read(selection) : null;
  useEffect(() => () => {
    queueMicrotask(() => {
      const entry = readManualItinerary(invocation) ? place?.read(selection) : null;
      place?.release(selection);
      if (!completed.current && entry?.binding.accountGeneration === getAccountGeneration()) entry.onCancel();
    });
  }, [invocation, place, selection]);

  const complete = (result: PlaceSearchResult) => {
    if (completed.current || !owner || readManualItinerary(invocation) !== owner) return;
    const before = place?.read(selection);
    if (!before || before.binding !== current?.binding || !before.binding.isCurrent() || !pop()) return;
    const latest = readManualItinerary(invocation) === owner ? place?.read(selection) : null;
    if (!latest || latest.binding !== before.binding || !latest.binding.isCurrent()) return;
    completed.current = true;
    Keyboard.dismiss();
    latest.onConfirm(result);
  };

  if (!current?.binding.isCurrent()) {
    return <SheetRoutePanel title={t("placeSearch.title")} onBack={back}>{null}</SheetRoutePanel>;
  }
  return (
    <PlaceSearchContent
      {...current}
      onCancel={() => { Keyboard.dismiss(); back(); }}
      onConfirm={complete}
      HostedSurface={HostedPlaceSurface}
    />
  );
}

function HostedPlaceSurface({ title, back, search, results }: PlaceSearchSurfaceProps) {
  return (
    <SheetRoutePanel title={title} onBack={back} ownsScroll>
      <View style={styles.column}>{search}</View>
      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.column}
      >
        {results}
      </SheetScrollView>
    </SheetRoutePanel>
  );
}

const styles = StyleSheet.create({
  column: { alignSelf: "center", width: "100%", maxWidth: 680 },
});
