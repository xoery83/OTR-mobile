import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { cloneElement, useEffect, useRef, useSyncExternalStore } from "react";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { OpenCalendarRangePickerContext } from "@/features/day-feed/calendarRangePickerHandoff";
import {
  metadataCalendar, readTripMetadataSheet, releaseTripMetadataSheet, subscribeTripMetadataSheet,
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
  usePreventRemove(!!sheet?.open, () => {
    if (navigation.isFocused()) requestClose();
  });
  useEffect(() => {
    if (sheet?.open) opened.current = true;
    else if (opened.current) requestClose();
  }, [requestClose, sheet]);
  useEffect(() => () => {
    queueMicrotask(() => releaseTripMetadataSheet(invocation));
  }, [invocation]);
  if (!sheet?.open || !sheet.editor) return <SheetRoutePanel title={t("tripHome.edit")}>{null}</SheetRoutePanel>;
  return (
    <OpenCalendarRangePickerContext.Provider value={read => {
      if (!invocation || !navigation.isFocused() || isExitPending()) return false;
      const selection = metadataCalendar.stage(() => readTripMetadataSheet(invocation)?.open ? read() : null);
      if (!selection) return false;
      router.push({ pathname: "/trip-metadata-sheet/dates", params: { invocation, selection } });
      return true;
    }}>
      {cloneElement(sheet.editor, { SheetPanel: SheetRoutePanel })}
    </OpenCalendarRangePickerContext.Provider>
  );
}
