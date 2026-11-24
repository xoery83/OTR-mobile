import { Redirect, useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { PlanParticipantsPicker } from "@/features/day-feed/PlanParticipantsField";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { hostedManualItineraryEnabled, readManualItinerary, subscribeManualItinerary } from "@/features/day-feed/hostedManualItinerary";
import { canApplyParticipation, ParticipantPickerHandoffContext } from "@/features/day-feed/participantPickerHandoff";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function QuickAddParticipantsRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedParticipants />;
}

function HostedParticipants() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation, selection, editorKey } = useLocalSearchParams<{
    invocation?: string; selection?: string; editorKey?: string;
  }>();
  const picker = useContext(ParticipantPickerHandoffContext);
  const navigation = useNavigation();
  const route = useRoute();
  const { isExitPending, requestClose } = useSheetMotion();
  const committed = useRef(false);
  const owner = useSyncExternalStore(subscribeManualItinerary, () => readManualItinerary(invocation));
  const state = navigation.getState();
  const ownsPicker = editorKey && state?.routes[state.index - 1]?.key === editorKey;
  const current = owner && ownsPicker ? picker?.read(selection) : null;
  const title = t("tripCreate.planParticipants");
  useEffect(() => () => picker?.release(selection), [picker, selection]);

  const pop = () => {
    if (!navigation.isFocused() || isExitPending()) return false;
    const state = navigation.getState();
    if (state?.routes[state.index]?.key !== route.key || !editorKey ||
      state.routes[state.index - 1]?.key !== editorKey) return false;
    navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
    const result = navigation.getState();
    return result?.key === state.key && result.routes[result.index]?.key === editorKey
      && !result.routes.some(candidate => candidate.key === route.key);
  };
  const back = () => {
    if (navigation.isFocused() && navigation.getState()?.index === 0) requestClose();
    else pop();
  };
  if (!current) return <SheetRoutePanel title={title} onBack={back}>{null}</SheetRoutePanel>;
  return (
    <PlanParticipantsPicker
      {...current}
      onDone={draft => {
        if (committed.current || !readManualItinerary(invocation)) return;
        const before = picker?.read(selection);
        if (!before || !canApplyParticipation(before, draft) || !pop()) return;
        committed.current = true;
        const latest = readManualItinerary(invocation) ? picker?.read(selection) : null;
        if (latest && canApplyParticipation(latest, draft)) latest.onChange(draft);
      }}
    >
      {(action, content) => <SheetRoutePanel title={title} onBack={back} action={action}>{content}</SheetRoutePanel>}
    </PlanParticipantsPicker>
  );
}
