import type { NavigationProp, NavigationState, ParamListBase } from "expo-router/react-navigation";

type Navigation = Pick<NavigationProp<ParamListBase>, "dispatch" | "isFocused"> & {
  getState(): NavigationState | undefined;
};

export type RelatedImportActivity = { batchId: string; jobId: string; tripId: string };

export function activeImportSheetPage(navigation: Navigation, pageKey: string) {
  const state = navigation.getState();
  if (navigation.isFocused() && state?.routes[state.index]?.key === pageKey) return state;
}

export function pushImportHistoryFromActivity(
  navigation: Navigation,
  pageKey: string,
  params: { jobId: string; tripId?: string; originGeneration: string },
) {
  const state = activeImportSheetPage(navigation, pageKey);
  if (!state) return;
  navigation.dispatch({
    type: "PUSH",
    target: state.key,
    source: pageKey,
    payload: { name: "composer", params: { ...params, originKey: pageKey } },
  });
}

export function ownsImportSheetOrigin(navigation: Navigation, pageKey: string, originKey?: string) {
  const state = navigation.getState();
  const index = state?.routes.findIndex(route => route.key === pageKey) ?? -1;
  return Boolean(originKey && index > 0 && state?.routes[index - 1]?.key === originKey);
}

export function popImportSheetPage(navigation: Navigation, pageKey: string, originKey?: string) {
  const state = activeImportSheetPage(navigation, pageKey);
  if (!originKey || !state || state.routes[state.index - 1]?.key !== originKey) return;
  navigation.dispatch({ type: "GO_BACK", target: state.key, source: pageKey });
}
