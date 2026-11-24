import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove, useRoute } from "expo-router/react-navigation";
import { cloneElement, useEffect, useRef, useSyncExternalStore } from "react";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { openTripCoverSheet, releaseTripMetadataCoverOwner } from "@/features/day-feed/tripCoverSheet";
import { OpenCalendarRangePickerContext } from "@/features/day-feed/calendarRangePickerHandoff";
import {
  metadataCalendar, readTripMetadataSheet, releaseTripMetadataSheet, stageTripMetadataCurrency, subscribeTripMetadataSheet,
} from "@/features/day-feed/tripMetadataSheet";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function TripMetadataSheetRoute() {
  useUiLocale();
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const navigation = useNavigation();
  const { requestClose, isExitPending } = useSheetMotion();
  const sheet = useSyncExternalStore(subscribeTripMetadataSheet, () => readTripMetadataSheet(invocation));
  const opened = useRef(false);
  const route = useRoute();
  usePreventRemove(!!sheet?.open, () => {
    if (navigation.isFocused()) requestClose();
  });
  useEffect(() => {
    if (sheet?.open) opened.current = true;
    else if (opened.current) requestClose();
  }, [requestClose, sheet]);
  useEffect(() => () => {
    queueMicrotask(() => {
      releaseTripMetadataCoverOwner(invocation);
      releaseTripMetadataSheet(invocation);
    });
  }, [invocation]);
  if (!sheet?.open || !sheet.editor) return <SheetRoutePanel title={t("tripHome.edit")}>{null}</SheetRoutePanel>;
  return (
    <OpenCalendarRangePickerContext.Provider value={read => {
      if (!invocation || !navigation.isFocused() || isExitPending()) return false;
      const selection = metadataCalendar.stage(() => readTripMetadataSheet(invocation)?.open ? read() : null);
      if (!selection) return false;
      router.push({
        pathname: "/trip-metadata-sheet/dates",
        params: { invocation, selection, editorKey: route.key },
      });
      return true;
    }}>
      {cloneElement(sheet.editor, {
        SheetPanel: SheetRoutePanel,
        openCurrencySettings: (tripId, onClose) => {
          if (!invocation || !navigation.isFocused() || isExitPending()) return false;
          const currency = stageTripMetadataCurrency(invocation, tripId, route.key, onClose);
          if (!currency) return false;
          router.push({ pathname: "/trip-metadata-sheet/currency", params: {
            invocation, currency, editorKey: route.key,
          } });
          return true;
        },
        openCoverLibrary: cover => {
          if (!invocation || !navigation.isFocused() || isExitPending() ||
              !readTripMetadataSheet(invocation)?.open) return;
          const selection = openTripCoverSheet(getAccountGeneration(), cover, invocation);
          if (!selection) return;
          router.push({ pathname: "/trip-metadata-sheet/cover", params: {
            invocation, selection, editorKey: route.key,
          } });
        },
      })}
    </OpenCalendarRangePickerContext.Provider>
  );
}
