import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { readDayMoveSheet, releaseDayMoveSheet } from "@/features/day-feed/dayMoveConfirmationSheet";

export default function DayMoveLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  useEffect(() => () => {
    queueMicrotask(() => releaseDayMoveSheet(invocation, true));
  }, [invocation]);
  return <SheetRouteLayout
    interceptClose={() => readDayMoveSheet(invocation)?.confirmation.isBusy() ?? false}
    onDismiss={() => releaseDayMoveSheet(invocation, true)}
  />;
}
