import { useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useEffect, useSyncExternalStore } from "react";
import { View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { LedgerSearchChoiceForm } from "@/features/ledger/LedgerSearchScreen";
import { readLedgerSearchChoice, releaseLedgerSearchChoice, subscribeLedgerSearchFilters } from "@/features/ledger/ledgerSearchFilterInvocation";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function LedgerSearchFilterChoiceRoute() {
  useUiLocale();
  const { invocation, selection, editorKey } = useLocalSearchParams<{
    invocation?: string; selection?: string; editorKey?: string;
  }>();
  const navigation = useNavigation();
  const route = useRoute();
  const { isExitPending, requestClose } = useSheetMotion();
  const choice = useSyncExternalStore(subscribeLedgerSearchFilters, () => readLedgerSearchChoice(invocation, selection));
  const state = navigation.getState();
  const owned = editorKey && state?.routes[state.index - 1]?.key === editorKey;
  useEffect(() => () => {
    queueMicrotask(() => releaseLedgerSearchChoice(invocation, selection));
  }, [invocation, selection]);

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
  if (!choice || !owned) return <SheetRoutePanel title={t("search.filters")} onBack={back}>{null}</SheetRoutePanel>;
  return (
    <LedgerSearchChoiceForm
      choice={choice}
      complete={commit => {
        if (readLedgerSearchChoice(invocation, selection) !== choice || !pop()) return;
        if (readLedgerSearchChoice(invocation, selection) !== choice) return;
        releaseLedgerSearchChoice(invocation, selection);
        commit();
      }}
      render={(body, action) => (
        <SheetRoutePanel title={choice.title} onBack={back} action={action}>
          <View style={{ padding: visual.space.page }}>{body}</View>
        </SheetRoutePanel>
      )}
    />
  );
}
