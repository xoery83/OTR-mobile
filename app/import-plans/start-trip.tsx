import { Redirect, router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { StartTripChoices } from "@/components/StartTripSheet";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { readStartTrip, releaseStartTrip, subscribeStartTrip } from "@/features/sheet-navigation/startTripHandoff";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function StartTripRoute() {
  return hostedImportEnabled ? <HostedStartTrip /> : <Redirect href="/trip" />;
}

function HostedStartTrip() {
  useUiLocale();
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const entry = useSyncExternalStore(subscribeStartTrip, () => readStartTrip(invocation));
  const route = useRoute();
  const navigation = useNavigation();
  const opening = useRef(false);
  useFocusEffect(useCallback(() => { opening.current = false; }, []));
  const { requestCloseWithAction, isExitPending } = useSheetMotion();
  useEffect(() => () => {
    queueMicrotask(() => releaseStartTrip(invocation));
  }, [invocation]);

  const current = () => navigation.isFocused() && !isExitPending() && entry && readStartTrip(invocation) === entry;
  return <SheetRoutePanel title={t("actionIsland.startTrip")}>
    {entry ? <StartTripChoices onImport={() => {
      if (!entry || !current() || opening.current) return;
      opening.current = true;
      router.push({
        pathname: "/import-plans/start-trip-composer",
        params: { invocation, chooserKey: route.key, origin: "TRIPS", originGeneration: String(entry.generation) },
      });
    }} onCreate={() => {
      if (!entry || !current() || opening.current) return;
      requestCloseWithAction(() => {
        if (readStartTrip(invocation) === entry) entry.create();
      });
    }} /> : null}
  </SheetRoutePanel>;
}
