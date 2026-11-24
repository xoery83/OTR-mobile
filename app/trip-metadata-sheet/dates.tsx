import { useEffect, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { TripCalendarRangePicker } from "@/features/day-feed/TripCalendarRangeField";
import {
  metadataCalendar, readTripMetadataSheet, subscribeTripMetadataSheet,
} from "@/features/day-feed/tripMetadataSheet";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function TripMetadataDatesRoute() {
  useUiLocale();
  const { invocation, selection, hasEditor, pop, back } = useHostedItineraryPickerNavigation();
  const sheet = useSyncExternalStore(subscribeTripMetadataSheet, () => readTripMetadataSheet(invocation));
  const date = sheet?.open && hasEditor() ? metadataCalendar.read(selection) : undefined;
  useEffect(() => () => {
    queueMicrotask(() => {
      metadataCalendar.read(selection)?.onClose();
      metadataCalendar.release(selection);
    });
  }, [selection]);
  const title = t("tripForm.dateTitle");
  if (!date) return <SheetRoutePanel title={title}>{null}</SheetRoutePanel>;
  return (
    <TripCalendarRangePicker {...date} hosted onDone={range => {
      const current = metadataCalendar.read(selection);
      if (!current || current.disabled || !pop() || !readTripMetadataSheet(invocation)?.open) return;
      const owner = metadataCalendar.read(selection);
      if (!owner || owner.disabled) return;
      metadataCalendar.release(selection);
      try {
        owner.onChange(range);
      } finally {
        owner.onClose();
      }
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
