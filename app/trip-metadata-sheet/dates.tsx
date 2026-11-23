import { useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useEffect, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { TripCalendarRangePicker } from "@/features/day-feed/TripCalendarRangeField";
import {
  metadataCalendar, readTripMetadataSheet, subscribeTripMetadataSheet,
} from "@/features/day-feed/tripMetadataSheet";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function TripMetadataDatesRoute() {
  useUiLocale();
  const { invocation, selection } = useLocalSearchParams<{ invocation?: string; selection?: string }>();
  const navigation = useNavigation();
  const { requestClose, isExitPending } = useSheetMotion();
  const sheet = useSyncExternalStore(subscribeTripMetadataSheet, () => readTripMetadataSheet(invocation));
  const date = sheet?.open ? metadataCalendar.read(selection) : undefined;
  const route = useRoute();
  const pop = () => {
    if (!navigation.isFocused() || isExitPending()) return false;
    const state = navigation.getState();
    if (!state || state.routes[state.index]?.key !== route.key) return false;
    const previous = state.routes[state.index - 1];
    if (!previous || previous.name !== "index") return false;
    navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
    const result = navigation.getState();
    return result?.key === state.key && result.routes[result.index]?.key === previous.key
      && !result.routes.some(candidate => candidate.key === route.key);
  };
  const back = () => {
    if (navigation.getState()?.index === 0) requestClose();
    else pop();
  };
  useEffect(() => () => {
    metadataCalendar.read(selection)?.onClose();
    metadataCalendar.release(selection);
  }, [selection]);
  const title = t("tripForm.dateTitle");
  if (!date) return <SheetRoutePanel title={title} onBack={back}>{null}</SheetRoutePanel>;
  return (
    <TripCalendarRangePicker {...date} hosted onDone={range => {
      const current = metadataCalendar.read(selection);
      if (!current || current.disabled || !pop() || !readTripMetadataSheet(invocation)?.open) return;
      const owner = metadataCalendar.read(selection);
      if (owner && !owner.disabled) owner.onChange(range);
    }}>
      {(confirm, content) => (
        <SheetRoutePanel title={title} ownsScroll onBack={back}
          action={{ label: t("common.done"), onPress: confirm, disabled: date.disabled }}>
          {content}
        </SheetRoutePanel>
      )}
    </TripCalendarRangePicker>
  );
}
