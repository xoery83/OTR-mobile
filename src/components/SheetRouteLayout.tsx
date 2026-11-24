import { Stack, router, useNavigation } from "expo-router";
import { usePreventRemove, useRoute } from "expo-router/react-navigation";
import { useCallback, useRef, useState } from "react";
import { SheetHost, useSheetMotion } from "@/components/SheetHost";
import { SheetRouteContext } from "./sheetRouteContext";
import { useUiTheme } from "@/ui/theme";

export function SheetRouteLayout({ immersive = false, interceptClose, confirmClose, guardNativeBack = false, onDismiss }: {
  immersive?: boolean;
  interceptClose?(): boolean;
  confirmClose?(): boolean | Promise<boolean>;
  guardNativeBack?: boolean;
  onDismiss?(): void;
}) {
  const colors = useUiTheme();
  const navigation = useNavigation("/");
  const route = useRoute();
  const approvedRemoval = useRef(false);
  const [measuredHeight, reportContentHeight] = useState<number>();
  const [headerHeight, reportHeaderHeight] = useState(0);
  const close = useCallback((action?: () => void) => {
    const state = navigation.getState();
    if (state?.routes[state.index]?.key !== route.key) return false;
    const previous = state.routes[state.index - 1];
    if (!previous) {
      if (action) return false;
      onDismiss?.();
      router.replace("/");
      return true;
    }
    approvedRemoval.current = true;
    try {
      navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
    } finally {
      approvedRemoval.current = false;
    }
    const result = navigation.getState();
    if (result?.key !== state.key || result.routes[result.index]?.key !== previous.key ||
        result.routes.some(candidate => candidate.key === route.key)) return false;
    if (action) action();
    else onDismiss?.();
    return true;
  }, [navigation, onDismiss, route.key]);

  return (
    <SheetRouteContext.Provider value={{ reportContentHeight, reportHeaderHeight }}>
      <SheetHost
        height={immersive ? { mode: "immersive" } : { mode: "content", measuredHeight }}
        headerHeight={headerHeight}
        interceptClose={interceptClose}
        confirmClose={confirmClose ?? allowClose}
        onClose={close}
      >
        {guardNativeBack ? <GuardedNativeBack approvedRemoval={approvedRemoval} /> : null}
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

const allowClose = () => true;

function GuardedNativeBack({ approvedRemoval }: { approvedRemoval: { current: boolean } }) {
  const navigation = useNavigation("/");
  const { key } = useRoute();
  const { requestClose } = useSheetMotion();
  const backedByCaller = (navigation.getState()?.routes.findIndex(route => route.key === key) ?? -1) > 0;
  usePreventRemove(backedByCaller, ({ data: { action } }) => {
    if (approvedRemoval.current) {
      navigation.dispatch(action);
      return;
    }
    const state = navigation.getState();
    const singleBack = action.type === "GO_BACK" || (action.type === "POP" &&
      action.payload && "count" in action.payload && action.payload.count === 1);
    if (state?.routes[state.index]?.key === key && singleBack &&
        (!action.target || action.target === state.key) && (!action.source || action.source === key)) {
      requestClose();
    }
  });
  return null;
}
