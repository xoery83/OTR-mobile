import { Stack, router, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useCallback, useState } from "react";
import { SheetHost } from "@/components/SheetHost";
import { SheetRouteContext } from "./sheetRouteContext";
import { useUiTheme } from "@/ui/theme";

export function SheetRouteLayout({ immersive = false, interceptClose, onDismiss }: {
  immersive?: boolean;
  interceptClose?(): boolean;
  onDismiss?(): void;
}) {
  const colors = useUiTheme();
  const navigation = useNavigation("/");
  const route = useRoute();
  const [measuredHeight, reportContentHeight] = useState<number>();
  const [headerHeight, reportHeaderHeight] = useState(0);
  const close = useCallback((action?: () => void) => {
    const state = navigation.getState();
    if (state?.routes[state.index]?.key !== route.key) return false;
    if (!action) onDismiss?.();
    if (state.index > 0) navigation.dispatch({ type: "GO_BACK", target: state.key });
    else router.replace("/");
    action?.();
    return true;
  }, [navigation, onDismiss, route.key]);

  return (
    <SheetRouteContext.Provider value={{ reportContentHeight, reportHeaderHeight }}>
      <SheetHost
        height={immersive ? { mode: "immersive" } : { mode: "content", measuredHeight }}
        headerHeight={headerHeight}
        interceptClose={interceptClose}
        confirmClose={() => true}
        onClose={close}
      >
        <Stack
          screenOptions={{
            headerBackVisible: false,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.surface },
            contentStyle: { backgroundColor: colors.surface },
            animation: "slide_from_right",
            gestureEnabled: false,
            orientation: "all",
          }}
        />
      </SheetHost>
    </SheetRouteContext.Provider>
  );
}
