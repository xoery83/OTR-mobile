import { useLocalSearchParams } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import {
  metadataCurrencyPicker,
  readTripMetadataCurrency,
  subscribeTripMetadataSheet,
} from "@/features/day-feed/tripMetadataSheet";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import { CurrencyPicker } from "@/features/ledger/CurrencyPicker";
import { UiDatePicker } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function TripMetadataCurrencyPickerRoute() {
  useUiLocale();
  const { currency } = useLocalSearchParams<{ currency?: string }>();
  const { invocation, selection, hasEditor, pop, back } = useHostedItineraryPickerNavigation();
  const { exitPending } = useSheetMotion();
  const entry = useSyncExternalStore(
    subscribeTripMetadataSheet,
    () => readTripMetadataCurrency(invocation, currency),
  );
  const choice = entry && hasEditor() ? metadataCurrencyPicker.read(selection) : undefined;
  const [date, setDate] = useState(() => choice?.kind === "date" ? choice.initial : new Date());
  useEffect(() => () => {
    queueMicrotask(() => metadataCurrencyPicker.release(selection));
  }, [selection]);

  function select(apply: () => void) {
    if (!choice || entry?.working || metadataCurrencyPicker.read(selection) !== choice ||
        readTripMetadataCurrency(invocation, currency) !== entry) return;
    Keyboard.dismiss();
    if (!pop() || metadataCurrencyPicker.read(selection) !== choice ||
        readTripMetadataCurrency(invocation, currency) !== entry) return;
    metadataCurrencyPicker.release(selection);
    apply();
  }

  const title = t(choice?.titleKey ?? "currencySettings.copy31");
  if (choice?.kind === "currency") return (
    <SheetRoutePanel title={title} ownsScroll onBack={back}>
      <CurrencyPicker hosted selected={choice.selected} suggestions={choice.suggestions}
        onSelect={code => select(() => choice.choose(code))} />
    </SheetRoutePanel>
  );
  return (
    <SheetRoutePanel title={title} onBack={back}
      action={choice?.kind === "date" ? {
        label: t("common.done"), disabled: exitPending, onPress: () => select(() => choice.choose(date)),
      } : undefined}
    >
      {choice?.kind === "date" ? (
        <View style={styles.clock}>
          <UiDatePicker display="spinner" maximumDate={choice.maximumDate} mode="date" value={date}
            accessibilityLabel={title} onChange={(_, next) => { if (next) setDate(next); }} />
        </View>
      ) : null}
    </SheetRoutePanel>
  );
}

const styles = StyleSheet.create({
  clock: { alignItems: "center", padding: visual.space.page },
});
