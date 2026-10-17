import { StyleSheet, View } from "react-native";
import { UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { TripCalendarRangeField, type TripDateRange } from "./TripCalendarRangeField";

export function TripMetadataFields({
  name,
  destination,
  range,
  disabled,
  onName,
  onDestination,
  onRange,
}: {
  name: string;
  destination: string;
  range: TripDateRange;
  disabled: boolean;
  onName(value: string): void;
  onDestination(value: string): void;
  onRange(value: TripDateRange): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.fields}>
      <UiText style={styles.label}>{t("tripCreate.name")}</UiText>
      <UiTextInput
        accessibilityLabel={t("tripCreate.name")}
        placeholder={t("tripCreate.name")}
        maxLength={256}
        value={name}
        onChangeText={onName}
        editable={!disabled}
      />
      <UiText style={styles.label}>{t("tripCreate.destination")}</UiText>
      <UiTextInput
        accessibilityLabel={t("tripCreate.destination")}
        placeholder={t("tripCreate.destination")}
        maxLength={256}
        value={destination}
        onChangeText={onDestination}
        editable={!disabled}
      />
      <TripCalendarRangeField value={range} onChange={onRange} disabled={disabled} />
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    fields: { gap: visual.space.card },
    label: { ...visual.type.meta, color: c.textPrimary },
  });
