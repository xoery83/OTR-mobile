import { useRoute } from "expo-router/react-navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { Keyboard } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { LedgerSearchFilterForm } from "@/features/ledger/LedgerSearchScreen";
import {
  openLedgerSearchChoice,
  readLedgerSearchFilters,
  releaseLedgerSearchFilters,
  subscribeLedgerSearchFilters,
} from "@/features/ledger/ledgerSearchFilterInvocation";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function LedgerSearchFiltersRoute() {
  useUiLocale();
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const fields = useSyncExternalStore(subscribeLedgerSearchFilters, () => readLedgerSearchFilters(invocation));
  const navigation = useNavigation();
  const route = useRoute();
  const { requestClose, requestCloseWithAction, getExitAttempt, isExitPending, exitPending } = useSheetMotion();
  const preparing = useRef(false);

  useEffect(() => () => {
    queueMicrotask(() => releaseLedgerSearchFilters(invocation));
  }, [invocation]);

  if (!fields)
    return <SheetRoutePanel title={t("search.filters")}>{null}</SheetRoutePanel>;
  return (
    <LedgerSearchFilterForm
      {...fields}
      hosted
      onCancel={requestClose}
      exitPending={exitPending}
      isExitPending={isExitPending}
      openChoice={choice => {
        if (!navigation.isFocused() || isExitPending() || preparing.current) return;
        const selection = openLedgerSearchChoice(invocation, choice);
        if (selection) router.push({
          pathname: "/ledger-search-filters/choice",
          params: { invocation, selection, editorKey: route.key },
        });
      }}
      onApply={async (filters) => {
        if (preparing.current || !navigation.isFocused() || isExitPending() || readLedgerSearchFilters(invocation) !== fields) return false;
        preparing.current = true;
        const attempt = getExitAttempt();
        try {
          Keyboard.dismiss();
          const apply = await fields.prepareApply(filters);
          if (!apply || !navigation.isFocused() || getExitAttempt() !== attempt || isExitPending()
            || readLedgerSearchFilters(invocation) !== fields) return false;
          requestCloseWithAction(() => {
            if (readLedgerSearchFilters(invocation) !== fields) return;
            releaseLedgerSearchFilters(invocation);
            apply();
          });
          return true;
        } finally {
          preparing.current = false;
        }
      }}
    />
  );
}
