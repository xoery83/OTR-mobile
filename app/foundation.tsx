import { Stack, useNavigation } from "expo-router";
import { useNavigationState, useRoute } from "expo-router/react-navigation";
import { AccountManagementScreen } from "@/components/AccountManagementScreen";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function FoundationDiagnosticsRoute() {
  useUiLocale();
  const navigation = useNavigation("/");
  const route = useRoute();
  const hasPredecessor = useNavigationState(state =>
    state.routes[state.index]?.key === route.key && state.index > 0,
  );

  // UIKit hides its automatic Back when Foundation is presented above the Import modal.
  return (
    <>
      <Stack.Screen options={{ headerBackVisible: false }} />
      {hasPredecessor ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="chevron.left"
            accessibilityLabel={t("common.back")}
            onPress={() => {
              const state = navigation.getState();
              if (state?.routes[state.index]?.key === route.key && state.index > 0) {
                navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
              }
            }}
          />
        </Stack.Toolbar>
      ) : null}
      <AccountManagementScreen authBoundary />
    </>
  );
}
