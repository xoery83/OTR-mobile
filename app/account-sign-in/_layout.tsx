import { useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useSyncExternalStore } from "react";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { finishSignIn, interceptSignInClose, subscribeSignIn } from "@/features/auth/hostedSignIn";

export default function AccountSignInLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const installing = useSyncExternalStore(subscribeSignIn, () => interceptSignInClose(invocation));
  usePreventRemove(installing, () => {});
  return <SheetRouteLayout
    interceptClose={() => interceptSignInClose(invocation)}
    onDismiss={() => finishSignIn(invocation)}
  />;
}
