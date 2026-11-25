import { Stack, useLocalSearchParams, useNavigation } from "expo-router";
import { useNavigationState } from "expo-router/react-navigation";

import { SettlementReadinessScreen } from "@/features/ledger/SettlementReadinessScreen";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function SettlementRoute() {
  useUiLocale();
  const { journeyId, journeyTitle } = useLocalSearchParams<{
    journeyId?: string;
    journeyTitle?: string;
  }>();
  const ledgerNavigation = useNavigation();
  const rootNavigation = useNavigation("/");
  const root = rootNavigation.getState();
  const isFirstLedgerScreen = useNavigationState(state => state.index === 0);
  const activeRootRoute = root?.routes[root.index];
  const searchTrip = root?.routes[root.index - 1];
  // Search Trip is on the root stack, so UIKit has no Ledger predecessor to display.
  const showSearchTripBack =
    isFirstLedgerScreen && activeRootRoute?.name === "(tabs)" && searchTrip?.name === "search-trip";

  return (
    <>
      {showSearchTripBack ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="chevron.left"
            accessibilityLabel={t("common.back")}
            onPress={() => {
              const current = rootNavigation.getState();
              if (
                current &&
                ledgerNavigation.isFocused() &&
                current.routes[current.index]?.key === activeRootRoute.key &&
                current.routes[current.index - 1]?.key === searchTrip.key
              ) {
                rootNavigation.dispatch({
                  type: "GO_BACK",
                  target: current.key,
                  source: activeRootRoute.key,
                });
              }
            }}
          />
        </Stack.Toolbar>
      ) : null}
      <SettlementReadinessScreen journeyId={journeyId} journeyTitle={journeyTitle} />
    </>
  );
}
