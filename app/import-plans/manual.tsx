import { Redirect, router, useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { readImportManualFallback, releaseImportManualFallback } from "@/features/capture/hostedImportManual";
import { useImportManualTripChoices } from "@/features/capture/useImportManualTripChoices";
import {
  hostedManualItineraryEnabled, readManualItinerary, releaseManualItinerary, stageManualItinerary,
  type HostedManualItinerary,
} from "@/features/day-feed/hostedManualItinerary";
import { isManualItineraryFamily, ManualItineraryChoices } from "@/features/day-feed/ManualItineraryContent";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function ImportManualSheetRoute() {
  const { fallback } = useLocalSearchParams<{ fallback?: string }>();
  const generation = useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedImportManual key={`${generation}:${fallback ?? ""}`} fallback={fallback} generation={generation} />;
}

function HostedImportManual({ fallback, generation }: { fallback?: string; generation: number }) {
  useUiLocale();
  const { editorKey } = useLocalSearchParams<{ editorKey?: string }>();
  const { back, hasEditor } = useHostedItineraryPickerNavigation();
  const navigation = useNavigation();
  const route = useRoute();
  const { isExitPending } = useSheetMotion();
  const owner = readImportManualFallback(fallback);
  const invocation = useRef<string | undefined>(undefined);
  const stack = navigation.getState();
  const position = stack?.routes.findIndex(candidate => candidate.key === route.key) ?? -1;
  const belongsToBatch = !!owner && editorKey === owner.sourceKey && position > 0 &&
    stack?.routes[position - 1]?.key === owner.sourceKey;
  const { choices, target, failed, current, setTarget } = useImportManualTripChoices({
    tripId: owner?.tripId,
    originGeneration: belongsToBatch ? String(owner.generation) : undefined,
  }, generation);
  useEffect(() => () => {
    const staged = invocation.current;
    queueMicrotask(() => {
      releaseManualItinerary(staged);
      releaseImportManualFallback(fallback);
    });
  }, [fallback]);

  function canAct() {
    return belongsToBatch && owner === readImportManualFallback(fallback) && current &&
      !failed && navigation.isFocused() && hasEditor() && !isExitPending();
  }

  function cancel() {
    if (canAct() && target && !owner?.tripId) setTarget(null);
    else back();
  }

  const usable = belongsToBatch && current && !failed;
  return (
    <SheetRoutePanel title={t(usable && target ? "formEntry.title" : "capture.results.addManually")} onBack={cancel}>
      {usable && target && owner ? (
        <ManualItineraryChoices onChoose={family => {
          if (!fallback || !canAct() || !isManualItineraryFamily(family) ||
              readManualItinerary(invocation.current)) return;
          let id: string;
          const editor: HostedManualItinerary = {
            tripId: target,
            generation,
            initialDate: null,
            importFallback: { invocation: fallback, sourceKey: owner.sourceKey, chooserKey: route.key },
            onClose: () => releaseManualItinerary(id),
            onSaved: () => releaseManualItinerary(id),
          };
          id = stageManualItinerary(() => readImportManualFallback(fallback) === owner ? editor : undefined);
          invocation.current = id;
          router.push({
            pathname: "/import-plans/quick-add-edit",
            params: { invocation: id, family, fallback, chooserKey: route.key },
          });
        }} />
      ) : (
        <>
          <UiText accessibilityRole={usable ? undefined : "alert"}>
            {t(!usable ? "capture.results.manualUnavailable" : choices ? "documents.chooseTrip" : "common.loading")}
          </UiText>
          {usable ? choices?.map(trip => (
            <UiButton key={trip.id} label={trip.name} variant="text" onPress={() => {
              if (canAct()) setTarget(trip.id);
            }} />
          )) : null}
        </>
      )}
    </SheetRoutePanel>
  );
}
