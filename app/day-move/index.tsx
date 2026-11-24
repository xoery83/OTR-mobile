import { useSyncExternalStore } from "react";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { StyleSheet, View } from "react-native";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { dayMoveVersion, readDayMoveSheet, subscribeDayMove } from "@/features/day-feed/dayMoveConfirmationSheet";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function DayMoveRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeDayMove, dayMoveVersion);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const navigation = useNavigation();
  const root = useNavigation("/");
  const { requestClose, isExitPending, exitPending } = useSheetMotion();
  const entry = readDayMoveSheet(invocation);
  const busy = entry?.confirmation.isBusy() ?? false;
  usePreventRemove(busy, () => {});
  const ownsOrigin = () => {
    const state = root.getState();
    return !!entry && readDayMoveSheet(invocation) === entry && entry.originCurrent() && navigation.isFocused() &&
      state?.routes[state.index]?.name === "day-move" && state.routes[state.index - 1]?.key === entry.originKey;
  };
  const confirmation = entry && !entry.retired && ownsOrigin() && entry.confirmation.isCurrent()
    ? entry.confirmation
    : null;
  const apply = async () => {
    if (!confirmation || confirmation.disabled || confirmation.isBusy() || isExitPending() ||
        !ownsOrigin() || !confirmation.isCurrent() || entry?.confirmation !== confirmation) return;
    if (await confirmation.apply() && ownsOrigin()) requestClose();
  };

  return <SheetRoutePanel title={t(confirmation?.titleKey ?? "fidelity.moveTitle")} leadingDisabled={busy}
    action={confirmation ? {
      label: t("fidelity.moveConfirm"),
      disabled: confirmation.disabled || busy || exitPending,
      onPress: () => { void apply(); },
    } : undefined}
  >
    {confirmation ? <View style={styles.details}>{confirmation.body}</View> : null}
  </SheetRoutePanel>;
}

const styles = StyleSheet.create({
  details: { padding: visual.space.page, gap: visual.space.card },
});
