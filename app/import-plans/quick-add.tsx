import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import { useSheetMotion } from "@/components/SheetHost";
import { TripQuickAddPanel } from "@/components/TripQuickAddMenu";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { readHostedQuickAdd, releaseHostedQuickAdd } from "@/features/sheet-navigation/quickAddHandoff";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function QuickAddSheetRoute() {
  return hostedImportEnabled ? <HostedQuickAddRoute /> : <Redirect href="/import-plans" />;
}

function HostedQuickAddRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration, getAccountGeneration);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const props = readHostedQuickAdd(invocation);
  const { requestCloseWithAction } = useSheetMotion();
  useEffect(() => () => {
    queueMicrotask(() => releaseHostedQuickAdd(invocation));
  }, [invocation]);
  return props ? <TripQuickAddPanel key={invocation} {...props} hosted closeHosted={action => {
    if (readHostedQuickAdd(invocation) !== props) return;
    requestCloseWithAction(() => {
      if (readHostedQuickAdd(invocation) === props) action();
    });
  }} /> :
    <SheetRoutePanel title={t("actionIsland.addToTrip")}>{null}</SheetRoutePanel>;
}
