import { Redirect, useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useCallback, useSyncExternalStore } from "react";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { readStartTrip, subscribeStartTrip } from "@/features/sheet-navigation/startTripHandoff";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import CaptureRoute from "../(tabs)/capture";

export default function StartTripComposerRoute() {
  return hostedImportEnabled ? <HostedStartTripComposer /> : <Redirect href="/trip" />;
}

function HostedStartTripComposer() {
  useUiLocale();
  const { invocation, chooserKey } = useLocalSearchParams<{ invocation?: string; chooserKey?: string }>();
  const entry = useSyncExternalStore(subscribeStartTrip, () => readStartTrip(invocation));
  const navigation = useNavigation();
  const { key } = useRoute();
  const { isExitPending, requestClose } = useSheetMotion();
  const current = useCallback(() => {
    if (!entry || readStartTrip(invocation) !== entry || !chooserKey) return false;
    const state = navigation.getState();
    const index = state?.routes.findIndex(route => route.key === key) ?? -1;
    return index > 0 && state?.routes[index - 1]?.key === chooserKey;
  }, [chooserKey, entry, invocation, key, navigation]);

  const back = () => {
    if (!navigation.isFocused() || isExitPending()) return;
    const state = navigation.getState();
    if (state?.routes[state.index]?.key !== key) return;
    if (state.index === 0) requestClose();
    else navigation.dispatch({ type: "GO_BACK", target: state.key, source: key });
  };
  if (entry && current()) {
    return <CaptureRoute overlay hosted hostedChild canUseHostedSource={current} onHostedClose={back} />;
  }
  return <SheetRoutePanel title={t("actionIsland.importPlans")} onBack={back}>{null}</SheetRoutePanel>;
}
