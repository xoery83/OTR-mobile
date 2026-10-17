import { useState } from "react";
import { Alert, StyleSheet, View, type ImageSourcePropType } from "react-native";
import type { BuiltInTripCoverId, Trip } from "@/domain/trip/types";
import {
  tripMetadataSchema,
  type TripMetadata,
} from "@/domain/trip/tripMetadataContract";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { TripCoverPicker } from "./TripCoverPicker";
import { TripMetadataFields } from "./TripMetadataFields";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import { TripCurrencyRow } from "./TripSetupRows";
import { TripCoverVisual } from "./TripCoverVisual";

export function TripBasicEditor({
  trip,
  onSelectCover,
  onSaveMetadata,
  metadataEditable,
  cover,
  setup = null,
  onOpenCurrency,
}: {
  trip: Pick<
    Trip,
    "name" | "destination" | "startDate" | "endDate" | "selectedCoverAssetId"
  >;
  metadataEditable: boolean;
  onSelectCover(id: BuiltInTripCoverId): Promise<void>;
  onSaveMetadata(before: TripMetadata, after: TripMetadata): Promise<void>;
  cover?: ImageSourcePropType;
  setup?: TripPreparationSetup | null;
  onOpenCurrency?: () => void;
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
  const openCurrency = () => {
    if (!onOpenCurrency || saving) return;
    if (
      after.name === before.name &&
      after.destination === before.destination &&
      after.startDate === before.startDate &&
      after.endDate === before.endDate
    ) {
      onOpenCurrency();
      return;
    }
    Alert.alert(t("actionIsland.unsavedTitle"), t("actionIsland.unsavedHint"), [
      { text: t("actionIsland.stay"), style: "cancel" },
      { text: t("actionIsland.discard"), style: "destructive", onPress: onOpenCurrency },
    ]);
  };
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
        <TripMetadataFields
          name={name}
          destination={destination}
          range={{ start, end }}
          disabled={!metadataEditable || saving}
          onName={setName}
          onDestination={setDestination}
          onRange={(range) => {
            setStart(range.start);
            setEnd(range.end);
          }}
        />
      </UiSection>
      <UiSection title={t("tripHome.coverTools")}>
        {cover ? <TripCoverVisual source={cover} style={styles.cover} /> : null}
        <UiText style={styles.hint}>{t("tripHome.editor.coverLocalOnly")}</UiText>
        <TripCoverPicker selected={trip.selectedCoverAssetId} onSelect={onSelectCover} />
      </UiSection>
      <TripCurrencyRow
        setup={setup}
        onOpen={saving || !onOpenCurrency ? undefined : openCurrency}
      />
      <UiSection>
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
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    root: { gap: visual.space.section },
    label: { ...visual.type.meta, color: colors.textPrimary },
    cover: { height: 128, borderRadius: visual.radius.card, overflow: "hidden" },
    hint: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
