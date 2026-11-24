import { useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove, useRoute } from "expo-router/react-navigation";
import { useSyncExternalStore } from "react";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { finishSignIn, hasSignInResult, interceptSignInClose, subscribeSignIn } from "@/features/auth/hostedSignIn";

export default function AccountSignInLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const navigation = useNavigation("/");
  const route = useRoute();
  const guarded = useSyncExternalStore(subscribeSignIn, () =>
    interceptSignInClose(invocation) || hasSignInResult(invocation),
  );
  usePreventRemove(guarded, ({ data: { action } }) => {
    if (interceptSignInClose(invocation) || !hasSignInResult(invocation)) return;
    const state = navigation.getState();
    if (state?.routes[state.index]?.key !== route.key) return;
    const previous = state.routes[state.index - 1];
    const singleBack = action.type === "GO_BACK" ||
      (action.type === "POP" && action.payload && "count" in action.payload && action.payload.count === 1);
    if (!previous || !singleBack || (action.target && action.target !== state.key) ||
        (action.source && action.source !== route.key)) return;

    // React Navigation marks this route as visited on a replayed removal action.
    navigation.dispatch(action);
    const updated = navigation.getState();
    if (updated?.key === state.key && updated.routes[updated.index]?.key === previous.key &&
        !updated.routes.some(candidate => candidate.key === route.key)) finishSignIn(invocation);
  });
  return <SheetRouteLayout
    interceptClose={() => interceptSignInClose(invocation)}
    onDismiss={() => finishSignIn(invocation)}
  />;
}
