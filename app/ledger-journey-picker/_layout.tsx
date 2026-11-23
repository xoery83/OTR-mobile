import { useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useCallback, useMemo, useRef } from "react";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { LedgerJourneyCloseContext } from "@/features/ledger/LedgerJourneyCloseContext";
import { isLedgerJourneyOrigin } from "@/features/ledger/ledgerJourneySheet";

export default function LedgerJourneyPickerLayout() {
  const navigation = useNavigation("/");
  const route = useRoute();
  const busy = useRef(false);
  const close = useMemo(() => ({
    setBusy(value: boolean) { busy.current = value; },
    hasOrigin(routeKey: string, ledgerRouteKey: string) {
      const state = navigation.getState();
      const previous = state?.routes[state.index - 1];
      return Boolean(state?.routes[state.index]?.key === route.key &&
        previous?.key === routeKey && isLedgerJourneyOrigin(previous, ledgerRouteKey));
    },
  }), [navigation, route.key]);
  const interceptClose = useCallback(() => busy.current, []);
  return <LedgerJourneyCloseContext.Provider value={close}>
    <SheetRouteLayout immersive interceptClose={interceptClose} />
  </LedgerJourneyCloseContext.Provider>;
}
