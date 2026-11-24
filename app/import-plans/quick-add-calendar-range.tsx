import { Redirect } from "expo-router";
import { useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { TripCalendarRangePicker } from "@/features/day-feed/TripCalendarRangeField";
import { CalendarRangePickerHandoffContext } from "@/features/day-feed/calendarRangePickerHandoff";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { hostedManualItineraryEnabled, readManualItinerary, subscribeManualItinerary } from "@/features/day-feed/hostedManualItinerary";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function QuickAddCalendarRangeRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedCalendarRange />;
}

function HostedCalendarRange() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation, selection, hasEditor, pop, back } = useHostedItineraryPickerNavigation();
  const calendar = useContext(CalendarRangePickerHandoffContext);
  const committed = useRef(false);
  const owner = useSyncExternalStore(subscribeManualItinerary, () => readManualItinerary(invocation));
  const current = owner && hasEditor() ? calendar?.read(selection) : null;
  const title = current?.label && current.label !== t("tripForm.dates") ? current.label : t("tripForm.dateTitle");
  useEffect(() => () => {
    queueMicrotask(() => {
      calendar?.read(selection)?.onClose();
      calendar?.release(selection);
    });
  }, [calendar, selection]);

  if (!current) return <SheetRoutePanel title={title} onBack={back}>{null}</SheetRoutePanel>;
  return (
    <TripCalendarRangePicker
      {...current}
      hosted
      onDone={range => {
        if (committed.current || !owner || readManualItinerary(invocation) !== owner) return;
        const before = calendar?.read(selection);
        if (!before || before.disabled || !pop()) return;
        const latest = readManualItinerary(invocation) === owner ? calendar?.read(selection) : null;
        if (!latest || latest.disabled) return;
        committed.current = true;
        latest.onChange(range);
      }}
    >
      {(confirm, content) => (
        <SheetRoutePanel title={title} onBack={back} ownsScroll action={{ label: t("common.done"), onPress: confirm, disabled: current.disabled }}>
          {content}
        </SheetRoutePanel>
      )}
    </TripCalendarRangePicker>
  );
}
