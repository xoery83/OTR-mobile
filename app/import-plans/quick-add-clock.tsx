import { Redirect } from "expo-router";
import { useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { hostedManualItineraryEnabled, readManualItinerary, subscribeManualItinerary } from "@/features/day-feed/hostedManualItinerary";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import { ItineraryClockHandoffContext } from "@/features/day-feed/itineraryClockPicker";
import { UiButton, UiText } from "@/ui/controls";
import { UiDatePicker } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export default function QuickAddClockRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedClock />;
}

function HostedClock() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const styles = useThemedStyles(createStyles);
  const { invocation, selection, hasEditor, pop, back } = useHostedItineraryPickerNavigation();
  const clock = useContext(ItineraryClockHandoffContext);
  const committed = useRef(false);
  const owner = useSyncExternalStore(subscribeManualItinerary, () => readManualItinerary(invocation));
  const current = owner && hasEditor() ? clock?.read(selection) : null;
  const [selected, setSelected] = useState(() => current?.initial ?? new Date());
  useEffect(() => () => {
    queueMicrotask(() => {
      clock?.read(selection)?.onClose();
      clock?.release(selection);
    });
  }, [clock, selection]);

  if (!current) return <SheetRoutePanel title={t("formEntry.title")} onBack={back}>{null}</SheetRoutePanel>;

  function complete(clear: boolean) {
    if (committed.current || !owner || readManualItinerary(invocation) !== owner) return;
    const before = clock?.read(selection);
    if (!before || before.disabled || !pop()) return;
    const latest = readManualItinerary(invocation) === owner ? clock?.read(selection) : null;
    if (!latest || latest.disabled) return;
    committed.current = true;
    if (clear) latest.clear();
    else latest.apply(selected);
  }

  return (
    <SheetRoutePanel
      title={current.label}
      onBack={back}
      action={{ label: t("common.done"), onPress: () => complete(false), disabled: current.disabled }}
    >
      <View style={styles.content}>
        <UiDatePicker
          mode={current.mode ?? "time"}
          display="spinner"
          timeZoneName={current.mode === "datetime" ? "UTC" : undefined}
          value={selected}
          accessibilityLabel={current.label}
          onChange={(_, next) => { if (next) setSelected(next); }}
        />
        {current.zoneHint ? (
          <UiText style={styles.hint}>{t("tripCreate.placeTimeZoneHint", { zone: current.zoneHint })}</UiText>
        ) : null}
        <UiButton
          variant="text"
          label={t(current.mode === "date" ? "tripCreate.clearDate" : "tripCreate.clearTime")}
          disabled={current.disabled}
          onPress={() => complete(true)}
        />
      </View>
    </SheetRoutePanel>
  );
}

const createStyles = (colors: UiColors) => StyleSheet.create({
  content: { alignItems: "center", padding: visual.space.page, gap: visual.space.card },
  hint: { ...visual.type.meta, color: colors.textSecondary },
});
