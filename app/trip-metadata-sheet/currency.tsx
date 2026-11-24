import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove, useRoute } from "expo-router/react-navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { SheetScrollView } from "@/components/SheetScrollView";
import {
  metadataCurrencyPicker,
  readTripMetadataCurrency,
  releaseTripMetadataCurrency,
  setTripMetadataCurrencyWorking,
  subscribeTripMetadataSheet,
} from "@/features/day-feed/tripMetadataSheet";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import { CurrencySettingsScreen } from "@/features/ledger/CurrencySettingsScreen";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function TripMetadataCurrencyRoute() {
  useUiLocale();
  const { currency, editorKey } = useLocalSearchParams<{ currency?: string; editorKey?: string }>();
  const { invocation, hasEditor, back } = useHostedItineraryPickerNavigation();
  const navigation = useNavigation();
  const route = useRoute();
  const { isExitPending } = useSheetMotion();
  const entry = useSyncExternalStore(
    subscribeTripMetadataSheet,
    () => readTripMetadataCurrency(invocation, currency),
  );
  const [working, setWorking] = useState(false);
  const reportWorking = useCallback((value: boolean) => {
    if (setTripMetadataCurrencyWorking(entry, value)) setWorking(value);
  }, [entry]);

  usePreventRemove(working && !!entry, () => {});
  useEffect(() => () => {
    queueMicrotask(() => releaseTripMetadataCurrency(invocation, currency));
  }, [currency, invocation]);

  function cancel() {
    if (!readTripMetadataCurrency(invocation, currency)?.working) back();
  }

  const stack = navigation.getState();
  const position = stack?.routes.findIndex(candidate => candidate.key === route.key) ?? -1;
  const canShowSettings = entry && entry.editorKey === editorKey && position > 0 &&
    stack?.routes[position - 1]?.key === entry.editorKey;
  return (
    <SheetRoutePanel title={t("currencySettings.heading")} ownsScroll onBack={cancel} leadingDisabled={working}>
      {canShowSettings ? (
        <CurrencySettingsScreen
          journeyId={entry.tripId}
          ScrollContainer={SheetScrollView}
          reportWorking={reportWorking}
          openInParent={choice => {
            if (!invocation || !currency || !navigation.isFocused() || !hasEditor() ||
                entry.working || isExitPending() || readTripMetadataCurrency(invocation, currency) !== entry)
              return false;
            const selection = metadataCurrencyPicker.stage(() =>
              readTripMetadataCurrency(invocation, currency) === entry && choice.isCurrent?.() !== false
                ? choice
                : null,
            );
            if (!selection) return false;
            router.push({ pathname: "/trip-metadata-sheet/currency-picker", params: {
              invocation, currency, selection, editorKey: route.key,
            } });
            return true;
          }}
        />
      ) : null}
    </SheetRoutePanel>
  );
}
