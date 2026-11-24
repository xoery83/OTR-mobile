import { useTripCreatePickerBack } from "@/features/day-feed/TripCreatePickerFields";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import {
  getTripCreatePickerVersion, readTripCreateName, releaseTripCreateName, subscribeTripCreatePickers,
} from "@/features/day-feed/hostedTripCreatePickers";
import { UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export default function TripCreateNameRoute() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  useSyncExternalStore(subscribeTripCreatePickers, getTripCreatePickerVersion);
  const { selection, ownerKey } = useLocalSearchParams<{ selection?: string; ownerKey?: string }>();
  const { boundToOwner, back } = useTripCreatePickerBack(ownerKey);
  const { exitPending, isExitPending } = useSheetMotion();
  const name = boundToOwner ? readTripCreateName(selection) : undefined;
  const [value, setValue] = useState(name?.initial ?? "");
  const latestValue = useRef(value);
  useEffect(() => () => {
    queueMicrotask(() => {
      readTripCreateName(selection)?.onClose();
      releaseTripCreateName(selection);
    });
  }, [selection]);

  const apply = () => {
    const current = readTripCreateName(selection);
    if (!current || current.disabled) return;
    const confirmedValue = latestValue.current;
    Keyboard.dismiss();
    if (back()) readTripCreateName(selection)?.apply(confirmedValue);
  };
  const title = t(name?.self ? "createTripV2.editName" : "createTripV2.editTraveler");
  return (
    <SheetRoutePanel title={title} onBack={boundToOwner ? back : undefined} action={name ? { label: t("common.done"), onPress: apply, disabled: name.disabled || exitPending } : undefined}>
      {name ? (
        <View style={styles.fields}>
          <UiTextInput
            autoFocus
            accessibilityLabel={t("createTripV2.nickname")}
            placeholder={t("createTripV2.nickname")}
            value={value}
            maxLength={256}
            editable={!name.disabled && !exitPending}
            returnKeyType="done"
            onChangeText={next => {
              if (isExitPending()) return;
              latestValue.current = next;
              setValue(next);
            }}
            onSubmitEditing={apply}
          />
          <UiText style={styles.hint}>{t("createTripV2.optional")}</UiText>
        </View>
      ) : null}
    </SheetRoutePanel>
  );
}

const createStyles = (colors: UiColors) => StyleSheet.create({
  fields: { padding: visual.space.page, gap: visual.space.card },
  hint: { ...visual.type.meta, color: colors.textSecondary },
});
