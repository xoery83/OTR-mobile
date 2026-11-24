import { useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { HostedConfirmExpenseDate } from "@/features/ledger/ConfirmExpenseDateScreen";
import { CurrencyPicker } from "@/features/ledger/CurrencyPicker";
import { ExpenseSharingSheet } from "@/features/ledger/ExpenseSharingSheet";
import { ExpenseCategoryPicker } from "@/features/ledger/ExpenseCategoryPicker";
import { completeLedgerCurrencySheet, readLedgerCurrencySheet, releaseLedgerCurrencySheet, type LedgerCurrencyChoice } from "@/features/ledger/ledgerCurrencySheet";
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
    queueMicrotask(() => releaseLedgerCurrencySheet(invocation, true));
  }, [invocation]);

  function select(apply: () => void) {
    if (isExitPending() || !picker || readLedgerCurrencySheet(invocation) !== picker) return;
    Keyboard.dismiss();
    requestCloseWithAction(() => completeLedgerCurrencySheet(invocation, picker, apply));
  }

  const title = t(picker?.titleKey ?? "currencySettings.copy31");
  if (picker?.kind === "confirm-date") {
    return <HostedConfirmExpenseDate
      key={invocation}
      choice={picker}
      isCurrent={() => !isExitPending() && readLedgerCurrencySheet(invocation) === picker}
    />;
  }
  if (picker?.kind === "fx-details") return <ExpenseFxSheet key={invocation} choice={picker} />;
  if (picker?.kind === "currency") {
    return <SheetRoutePanel title={title} ownsScroll>
      <CurrencyPicker hosted selected={picker.selected} suggestions={picker.suggestions} onSelect={code => select(() => picker.choose(code))} />
    </SheetRoutePanel>;
  }
  if (picker?.kind === "display") {
    return <DisplayCurrencyOptions choice={picker} onSelect={code => {
      if (picker.readOptions().includes(code)) select(() => picker.choose(code));
    }} />;
  }
  if (picker?.kind === "sharing") {
    return <ExpenseSharingSheet
      key={invocation}
      {...picker}
      hosted
      exitPending={exitPending}
      onApply={staged => select(() => picker.onApply(staged))}
    />;
  }
  if (picker?.kind === "category") {
    return <SheetRoutePanel title={title}>
      <ExpenseCategoryPicker hosted category={picker.selected} onSelect={category => select(() => picker.choose(category))} />
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

function DisplayCurrencyOptions({ choice, onSelect }: {
  choice: Extract<LedgerCurrencyChoice, { kind: "display" }>;
  onSelect(code: string): void;
}) {
  const options = useSyncExternalStore(choice.subscribeOptions, choice.readOptions);
  return <SheetRoutePanel title={t(choice.titleKey)}>
    <View style={styles.choices}>
      {options.map(code => (
        <UiChoiceChip key={code} label={code} selected={code === choice.selected} onPress={() => onSelect(code)} />
      ))}
    </View>
  </SheetRoutePanel>;
}

function ExpenseFxSheet({ choice }: { choice: Extract<LedgerCurrencyChoice, { kind: "fx-details" }> }) {
  const content = useSyncExternalStore(choice.subscribe, choice.read);
  const { isExitPending } = useSheetMotion();
  const busy = choice.isBusy();
  usePreventRemove(busy, () => {});
  useLayoutEffect(() => {
    choice.bindExitPending(isExitPending);
    return () => choice.bindExitPending(undefined);
  }, [choice, isExitPending]);
  return <SheetRoutePanel title={t(choice.titleKey)} leadingDisabled={busy} ownsScroll>
    {content}
  </SheetRoutePanel>;
}

const styles = StyleSheet.create({
  choices: { padding: visual.space.page, gap: visual.space.card },
  clock: { alignItems: "center", padding: visual.space.page },
});
