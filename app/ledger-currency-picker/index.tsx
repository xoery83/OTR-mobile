import { useLocalSearchParams } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { CurrencyPicker } from "@/features/ledger/CurrencyPicker";
import { completeLedgerCurrencySheet, readLedgerCurrencySheet, releaseLedgerCurrencySheet } from "@/features/ledger/ledgerCurrencySheet";
import { UiChoiceChip, UiDatePicker } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function LedgerCurrencyPickerRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const picker = readLedgerCurrencySheet(invocation);
  const [date, setDate] = useState(() => picker?.kind === "date" ? picker.initial : new Date());
  const { requestCloseWithAction, isExitPending, exitPending } = useSheetMotion();
  useEffect(() => () => {
    queueMicrotask(() => releaseLedgerCurrencySheet(invocation));
  }, [invocation]);

  function select(apply: () => void) {
    if (isExitPending() || !picker || readLedgerCurrencySheet(invocation) !== picker) return;
    Keyboard.dismiss();
    requestCloseWithAction(() => completeLedgerCurrencySheet(invocation, picker, apply));
  }

  const title = t(picker?.titleKey ?? "currencySettings.copy31");
  if (picker?.kind === "currency") {
    return <SheetRoutePanel title={title} ownsScroll>
      <CurrencyPicker hosted selected={picker.selected} suggestions={picker.suggestions} onSelect={code => select(() => picker.choose(code))} />
    </SheetRoutePanel>;
  }
  if (picker?.kind === "display") {
    return <SheetRoutePanel title={title}>
      <View style={styles.choices}>
        {picker.options.map(code => (
          <UiChoiceChip
            key={code}
            label={code}
            selected={code === picker.selected}
            onPress={() => select(() => picker.choose(code))}
          />
        ))}
      </View>
    </SheetRoutePanel>;
  }
  return <SheetRoutePanel title={title} action={picker?.kind === "date" ? {
    label: t("common.done"), disabled: exitPending, onPress: () => select(() => picker.choose(date)),
  } : undefined}>
    {picker?.kind === "date" ? <View style={styles.clock}>
      <UiDatePicker display="spinner" maximumDate={picker.maximumDate} mode="date" value={date}
        accessibilityLabel={title} onChange={(_, next) => { if (next) setDate(next); }} />
    </View> : null}
  </SheetRoutePanel>;
}

const styles = StyleSheet.create({
  choices: { padding: visual.space.page, gap: visual.space.card },
  clock: { alignItems: "center", padding: visual.space.page },
});
