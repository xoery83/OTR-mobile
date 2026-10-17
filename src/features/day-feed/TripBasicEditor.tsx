import { useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
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
import { tripCoverSource } from "./tripCovers";
import { createUuid } from "@/domain/localId";

export function TripBasicEditor({
  trip,
  onSelectCover,
  onSaveMetadata,
  metadataEditable,
  setup = null,
  onOpenCurrency,
  onSavingChange,
}: {
  trip: Pick<
    Trip,
    "id" | "name" | "destination" | "startDate" | "endDate" | "selectedCoverAssetId"
  >;
  metadataEditable: boolean;
  onSelectCover(id: BuiltInTripCoverId): Promise<void>;
  onSaveMetadata(
    before: TripMetadata,
    after: TripMetadata,
    cover: { before: BuiltInTripCoverId | null; after: BuiltInTripCoverId | null },
    operationId: string,
  ): Promise<void>;
  setup?: TripPreparationSetup | null;
  onOpenCurrency?: () => void;
  onSavingChange?(saving: boolean): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [before, setBefore] = useState<TripMetadata>({
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  const [beforeCover, setBeforeCover] = useState(trip.selectedCoverAssetId ?? null);
  const [draftCover, setDraftCover] = useState(trip.selectedCoverAssetId ?? null);
  const busy = useRef(false);
  const saveIntent = useRef<{ fingerprint: string; operationId: string } | null>(null);
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
  const dirty =
    after.name !== before.name ||
    after.destination !== before.destination ||
    after.startDate !== before.startDate ||
    after.endDate !== before.endDate ||
    (metadataEditable && draftCover !== beforeCover);
  const openCurrency = () => {
    if (!onOpenCurrency || saving) return;
    if (!dirty) {
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
        <TripCoverVisual
          source={tripCoverSource({
            ...trip,
            selectedCoverAssetId: metadataEditable
              ? draftCover
              : trip.selectedCoverAssetId,
          })}
          style={styles.cover}
        />
        <UiText style={styles.hint}>
          {t(metadataEditable ? "tripForm.coverDraft" : "tripHome.editor.coverLocalOnly")}
        </UiText>
        <TripCoverPicker
          selected={metadataEditable ? draftCover : trip.selectedCoverAssetId}
          onSelect={
            metadataEditable
              ? async (id) => {
                  if (!busy.current) {
                    setDraftCover(id);
                    setSaved(false);
                  }
                }
              : onSelectCover
          }
        />
      </UiSection>
      <TripCurrencyRow
        setup={setup}
        onOpen={saving || !onOpenCurrency ? undefined : openCurrency}
      />
      <UiSection>
        {metadataEditable ? (
          <UiButton
            label={t("tripCreate.saveTrip")}
            disabled={saving || !valid || !dirty}
            onPress={() => {
              if (busy.current || !valid || !dirty) return;
              busy.current = true;
              onSavingChange?.(true);
              setSaving(true);
              setError(false);
              setSaved(false);
              const cover = { before: beforeCover, after: draftCover };
              const fingerprint = JSON.stringify({ before, after, cover });
              if (saveIntent.current?.fingerprint !== fingerprint)
                saveIntent.current = { fingerprint, operationId: createUuid() };
              void onSaveMetadata(before, after, cover, saveIntent.current.operationId)
                .then(() => {
                  setBefore(after);
                  setBeforeCover(draftCover);
                  saveIntent.current = null;
                  setSaved(true);
                })
                .catch(() => setError(true))
                .finally(() => {
                  busy.current = false;
                  onSavingChange?.(false);
                  setSaving(false);
                });
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
