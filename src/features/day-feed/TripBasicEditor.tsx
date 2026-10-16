import { StyleSheet, View } from "react-native";
import type { BuiltInTripCoverId, Trip } from "@/domain/trip/types";
import { UiSection, UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { TripCoverPicker } from "./TripCoverPicker";

const displayDate = (date: string | null) =>
  date
    ? formatUiDate(new Date(`${date}T12:00:00Z`), {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : t("tripCreate.notSet");

// Only the existing device-local cover preference has an owning update contract.
export function TripBasicEditor({
  trip,
  onSelectCover,
}: {
  trip: Pick<
    Trip,
    "name" | "destination" | "startDate" | "endDate" | "selectedCoverAssetId"
  >;
  onSelectCover(id: BuiltInTripCoverId): Promise<void>;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.root}>
      <UiSection>
        <UiText style={styles.hint}>{t("tripHome.editor.metadataReadOnly")}</UiText>
        {[
          { label: t("tripCreate.name"), value: trip.name },
          {
            label: t("tripCreate.destination"),
            value: trip.destination ?? t("tripCreate.notSet"),
          },
          { label: t("tripCreate.start"), value: displayDate(trip.startDate) },
          { label: t("tripCreate.end"), value: displayDate(trip.endDate) },
        ].map(({ label, value }) => (
          <View key={label} style={styles.field}>
            <UiText style={styles.label}>{label}</UiText>
            <UiTextInput
              accessibilityLabel={label}
              value={value}
              editable={false}
              multiline
            />
          </View>
        ))}
      </UiSection>
      <UiSection title={t("tripHome.coverTools")}>
        <UiText style={styles.hint}>{t("tripHome.editor.coverLocalOnly")}</UiText>
        <TripCoverPicker selected={trip.selectedCoverAssetId} onSelect={onSelectCover} />
      </UiSection>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    root: { gap: visual.space.section },
    field: { gap: visual.space.heading },
    label: { ...visual.type.meta, color: colors.textPrimary },
    hint: { ...visual.type.meta, color: colors.textSecondary },
  });
