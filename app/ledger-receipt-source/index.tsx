import { useEffect, useSyncExternalStore } from "react";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { View } from "react-native";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { ReceiptScanSourceFields } from "@/features/ledger/ReceiptScanSourceFields";
import { readLedgerReceiptSource, releaseLedgerReceiptSourceRoute, stageLedgerReceiptNativeHandoff } from "@/features/ledger/ledgerReceiptSourceSheet";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function LedgerReceiptSourceRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const navigation = useNavigation();
  const { isExitPending, requestCloseWithAction } = useSheetMotion();
  const source = readLedgerReceiptSource(invocation);
  useEffect(() => () => {
    queueMicrotask(() => releaseLedgerReceiptSourceRoute(invocation));
  }, [invocation]);

  return (
    <SheetRoutePanel title={t("ui.scanReceipt")}>
      {source ? (
        <View style={{ padding: visual.space.page }}>
          <ReceiptScanSourceFields
            count={source.count}
            slots={source.slots}
            onChoose={kind => {
              if (!navigation.isFocused() || isExitPending() || source.slots === 0 ||
                  readLedgerReceiptSource(invocation) !== source) return;
              requestCloseWithAction(() => {
                if (readLedgerReceiptSource(invocation) !== source) return;
                stageLedgerReceiptNativeHandoff(invocation, kind);
              });
            }}
          />
        </View>
      ) : null}
    </SheetRoutePanel>
  );
}
