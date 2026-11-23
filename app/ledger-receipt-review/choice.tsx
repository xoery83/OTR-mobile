import { useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { CurrencyPicker } from "@/features/ledger/CurrencyPicker";
import { ReceiptScanSourceFields } from "@/features/ledger/ReceiptScanSourceFields";
import {
  readLedgerReceiptReviewPicker, releaseLedgerReceiptReviewPicker, subscribeLedgerReceiptReview,
} from "@/features/ledger/ledgerReceiptReviewSheet";
import { UiChoiceChip } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function LedgerReceiptReviewChoice() {
  useUiLocale();
  const { invocation, selection, editorKey } = useLocalSearchParams<{
    invocation?: string; selection?: string; editorKey?: string;
  }>();
  const navigation = useNavigation();
  const route = useRoute();
  const { requestClose, isExitPending } = useSheetMotion();
  const read = () => readLedgerReceiptReviewPicker(invocation, selection);
  const choice = useSyncExternalStore(subscribeLedgerReceiptReview, read);
  const state = navigation.getState();
  const owned = editorKey && state?.routes[state.index]?.key === route.key &&
    state.routes[state.index - 1]?.key === editorKey;
  useEffect(() => () => {
    queueMicrotask(() => releaseLedgerReceiptReviewPicker(invocation, selection));
  }, [invocation, selection]);

  const back = () => {
    if (!navigation.isFocused() || isExitPending()) return;
    const state = navigation.getState();
    if (state?.routes[state.index]?.key !== route.key) return;
    if (state.index === 0) requestClose();
    else navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
  };
  const complete = (commit: () => void) => {
    if (!choice || read() !== choice || !choice.isCurrent() ||
        !navigation.isFocused() || isExitPending() || !editorKey) return;
    const before = navigation.getState();
    if (before?.routes[before.index]?.key !== route.key || before.routes[before.index - 1]?.key !== editorKey) return;
    navigation.dispatch({ type: "GO_BACK", target: before.key, source: route.key });
    const after = navigation.getState();
    if (after?.key !== before.key || after.routes[after.index]?.key !== editorKey ||
        after.routes.some(candidate => candidate.key === route.key) || read() !== choice || !choice.isCurrent()) return;
    releaseLedgerReceiptReviewPicker(invocation, selection);
    Keyboard.dismiss();
    commit();
  };

  if (!choice || !owned || !choice.isCurrent()) {
    return <SheetRoutePanel title={t("ui.reviewReceipt")} onBack={back}>{null}</SheetRoutePanel>;
  }
  if (choice.kind === "currency") {
    return (
      <SheetRoutePanel title={choice.title} onBack={back} ownsScroll>
        <CurrencyPicker
          hosted
          selected={choice.selected}
          suggestions={choice.suggestions}
          onSelect={code => complete(() => choice.choose(code))}
        />
      </SheetRoutePanel>
    );
  }
  return (
    <SheetRoutePanel title={choice.title} onBack={back}>
      {choice.kind === "receipt-source" ? (
        <View style={styles.content}>
          <ReceiptScanSourceFields
            count={choice.count}
            slots={choice.slots}
            onChoose={source => complete(() => choice.choose(source))}
          />
        </View>
      ) : (
        <View style={styles.choices}>
          {choice.options.map(option => (
            <UiChoiceChip key={option.key} label={option.label} selected={option.selected}
              onPress={() => complete(option.onPress)} />
          ))}
        </View>
      )}
    </SheetRoutePanel>
  );
}

const styles = StyleSheet.create({
  content: { padding: visual.space.page },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.card, padding: visual.space.page },
});
