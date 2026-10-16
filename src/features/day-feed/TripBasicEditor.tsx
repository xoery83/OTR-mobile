import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BuiltInTripCoverId, Trip } from "@/domain/trip/types";
import {
  tripMetadataSchema,
  type TripMetadata,
} from "@/domain/trip/tripMetadataContract";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { TripCoverPicker } from "./TripCoverPicker";
import { CalendarField } from "./TripCalendarField";

export function TripBasicEditor({
  trip,
  onSelectCover,
  onSaveMetadata,
  metadataEditable,
}: {
  trip: Pick<
    Trip,
    "name" | "destination" | "startDate" | "endDate" | "selectedCoverAssetId"
  >;
  metadataEditable: boolean;
  onSelectCover(id: BuiltInTripCoverId): Promise<void>;
  onSaveMetadata(before: TripMetadata, after: TripMetadata): Promise<void>;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [before, setBefore] = useState<TripMetadata>({
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  const [name, setName] = useState(trip.name),
    [destination, setDestination] = useState(trip.destination ?? ""),
    [start, setStart] = useState(trip.startDate ?? ""),
    [end, setEnd] = useState(trip.endDate ?? ""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(false),
    [saved, setSaved] = useState(false);
  const after = {
    name: name.trim(),
    destination: destination.trim() || null,
    startDate: start || null,
    endDate: end || null,
  };
  const valid = tripMetadataSchema.safeParse(after).success;
  return (
    <View style={styles.root}>
      <UiSection>
        <UiText style={styles.hint}>
          {t(
            metadataEditable
              ? "tripHome.editor.localFirst"
              : "tripHome.editor.metadataReadOnly",
          )}
        </UiText>
        <UiText style={styles.label}>{t("tripCreate.name")}</UiText>
        <UiTextInput
          accessibilityLabel={t("tripCreate.name")}
          value={name}
          onChangeText={setName}
          editable={metadataEditable && !saving}
        />
        <UiText style={styles.label}>{t("tripCreate.destination")}</UiText>
        <UiTextInput
          accessibilityLabel={t("tripCreate.destination")}
          value={destination}
          onChangeText={setDestination}
          editable={metadataEditable && !saving}
        />
        <CalendarField
          disabled={!metadataEditable || saving}
          label={t("tripCreate.start")}
          value={start}
          onChange={setStart}
        />
        <CalendarField
          disabled={!metadataEditable || saving}
          label={t("tripCreate.end")}
          value={end}
          onChange={setEnd}
        />
        {metadataEditable ? (
          <UiButton
            label={t("tripCreate.saveTrip")}
            disabled={saving || !valid}
            onPress={() => {
              if (saving || !valid) return;
              setSaving(true);
              setError(false);
              setSaved(false);
              void onSaveMetadata(before, after)
                .then(() => {
                  setBefore(after);
                  setSaved(true);
                })
                .catch(() => setError(true))
                .finally(() => setSaving(false));
            }}
          />
        ) : null}
        {saved ? (
          <UiText style={styles.hint}>{t("actionIsland.savedLocally")}</UiText>
        ) : null}
        {error ? (
          <UiText accessibilityRole="alert" style={styles.error}>
            {t("tripCreate.saveFailed")}
          </UiText>
        ) : null}
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
    label: { ...visual.type.meta, color: colors.textPrimary },
    hint: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
