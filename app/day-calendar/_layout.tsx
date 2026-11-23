import { useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { readDayCalendar } from "@/features/day-feed/dayCalendarHandoff";

export default function DayCalendarLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  return (
    <SheetRouteLayout
      immersive
      onDismiss={() => readDayCalendar(invocation)?.onClose()}
    />
  );
}
