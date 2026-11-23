import { useEffect, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { DayFeedCalendarContent } from "@/features/day-feed/DayFeedCalendarSheet";
import { readDayCalendar } from "@/features/day-feed/dayCalendarHandoff";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function DayCalendarRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration, getAccountGeneration);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const { requestClose, requestCloseWithAction, isExitPending } = useSheetMotion();
  const calendar = readDayCalendar(invocation);
  useEffect(() => () => {
    // Allow the enclosing route to finish its synchronous pop and selection callback.
    queueMicrotask(() => readDayCalendar(invocation)?.onClose());
  }, [invocation]);

  return (
    <SheetRoutePanel title={calendar?.tripName ?? t("dayShell.calendar.open")} ownsScroll>
      {calendar ? (
        <DayFeedCalendarContent
          {...calendar}
          hosted
          onClose={requestClose}
          onSelect={date => {
            if (isExitPending() || readDayCalendar(invocation) !== calendar || !calendar.canSelect(date)) return;
            requestCloseWithAction(() => {
              if (readDayCalendar(invocation) === calendar) calendar.onSelect(date);
            });
          }}
        />
      ) : null}
    </SheetRoutePanel>
  );
}
