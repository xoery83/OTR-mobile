import { useTripCreatePickerBack } from "@/features/day-feed/TripCreatePickerFields";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import {
  getTripCreatePickerVersion, readTripCreateCalendar, releaseTripCreateCalendar, subscribeTripCreatePickers,
} from "@/features/day-feed/hostedTripCreatePickers";
import { TripCalendarRangePicker } from "@/features/day-feed/TripCalendarRangeField";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function TripCreateCalendarRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeTripCreatePickers, getTripCreatePickerVersion);
  const { selection, ownerKey } = useLocalSearchParams<{ selection?: string; ownerKey?: string }>();
  const { boundToOwner, back } = useTripCreatePickerBack(ownerKey);
  const { exitPending } = useSheetMotion();
  const date = boundToOwner ? readTripCreateCalendar(selection) : undefined;
  useEffect(() => () => {
    queueMicrotask(() => {
      readTripCreateCalendar(selection)?.onClose();
      releaseTripCreateCalendar(selection);
    });
  }, [selection]);
  const title = t("tripForm.dateTitle");

  if (!date) return <SheetRoutePanel title={title} onBack={boundToOwner ? back : undefined}>{null}</SheetRoutePanel>;
  return (
    <TripCalendarRangePicker
      {...date}
      hosted
      onDone={range => {
        const current = readTripCreateCalendar(selection);
        if (current && !current.disabled && back()) readTripCreateCalendar(selection)?.onChange(range);
      }}
    >
      {(confirm, content) => (
        <SheetRoutePanel title={title} onBack={back} ownsScroll action={{ label: t("common.done"), onPress: confirm, disabled: date.disabled || exitPending }}>
          {content}
        </SheetRoutePanel>
      )}
    </TripCalendarRangePicker>
  );
}
