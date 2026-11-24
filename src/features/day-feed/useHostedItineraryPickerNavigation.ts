import { useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useSheetMotion } from "@/components/SheetHost";

export function useHostedItineraryPickerNavigation() {
  const { invocation, selection, editorKey } = useLocalSearchParams<{
    invocation?: string; selection?: string; editorKey?: string;
  }>();
  const navigation = useNavigation();
  const route = useRoute();
  const { isExitPending, requestClose } = useSheetMotion();
  const hasEditor = () => {
    const state = navigation.getState();
    return Boolean(editorKey && state?.routes[state.index]?.key === route.key
      && state.routes[state.index - 1]?.key === editorKey);
  };
  const pop = () => {
    if (!navigation.isFocused() || isExitPending() || !hasEditor()) return false;
    const state = navigation.getState();
    if (!state) return false;
    navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
    const result = navigation.getState();
    return result?.key === state.key && result.routes[result.index]?.key === editorKey
      && !result.routes.some(candidate => candidate.key === route.key);
  };
  const back = () => {
    if (!navigation.isFocused() || isExitPending()) return;
    const state = navigation.getState();
    if (state?.routes[state.index]?.key !== route.key) return;
    if (state.index === 0) requestClose();
    else navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
  };
  return { invocation, selection, hasEditor, pop, back };
}
