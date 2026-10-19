import { useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import type { BuiltInTripCoverId, Trip } from "@/domain/trip/types";
import {
  tripMetadataSchema,
  type TripMetadata,
} from "@/domain/trip/tripMetadataContract";
import { UiSection, UiText } from "@/ui/controls";
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
import { SheetHeader } from "@/components/SheetHeader";
import { rawTripCover } from "@/features/trip-cover/coverDecision";
import type { TripCoverUpdate } from "@/domain/trip/tripCoverAssets";
import { createUuid } from "@/domain/localId";

export function TripBasicEditor({
  trip,
  onSelectCover,
  onSaveMetadata,
  metadataEditable,
  setup = null,
  onOpenCurrency,
  onSavingChange,
  onClose,
}: {
  trip: Pick<
    Trip,
    | "id"
    | "name"
    | "destination"
    | "startDate"
    | "endDate"
    | "selectedCoverAssetId"
    | "selectedCoverAssetIdRaw"
  >;
  metadataEditable: boolean;
  onSelectCover(id: BuiltInTripCoverId | null): Promise<void>;
  onSaveMetadata(
    before: TripMetadata,
    after: TripMetadata,
    cover: TripCoverUpdate | undefined,
    operationId: string,
  ): Promise<void>;
  setup?: TripPreparationSetup | null;
  onOpenCurrency?: () => void;
  onSavingChange?(saving: boolean): void;
  onClose?(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [before, setBefore] = useState<TripMetadata>({
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  const [beforeCover, setBeforeCover] = useState(rawTripCover(trip));
  const [draftCover, setDraftCover] = useState(trip.selectedCoverAssetId ?? null);
  const [coverChanged, setCoverChanged] = useState(false);
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
    (metadataEditable && coverChanged && draftCover !== beforeCover);
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
  const save = () => {
    if (busy.current || !valid || !dirty) return;
    busy.current = true;
    onSavingChange?.(true);
    setSaving(true);
    setError(false);
    setSaved(false);
    const cover: TripCoverUpdate | undefined =
      coverChanged && beforeCover !== undefined && draftCover !== beforeCover
        ? { before: beforeCover, after: draftCover }
        : undefined;
    const fingerprint = JSON.stringify({ before, after, cover });
    if (saveIntent.current?.fingerprint !== fingerprint)
      saveIntent.current = { fingerprint, operationId: createUuid() };
    void onSaveMetadata(before, after, cover, saveIntent.current.operationId)
      .then(() => {
        setBefore(after);
        if (cover) setBeforeCover(cover.after);
        setCoverChanged(false);
        saveIntent.current = null;
        setSaved(true);
      })
      .catch(() => setError(true))
      .finally(() => {
        busy.current = false;
        onSavingChange?.(false);
        setSaving(false);
      });
  };
  return (
    <View style={styles.container}>
      <SheetHeader
        title={t("tripHome.edit")}
        leftLabel={t("common.cancel")}
        onLeft={() => {
          if (!busy.current) onClose?.();
        }}
        rightLabel={t("ui.save")}
        onRight={metadataEditable ? save : undefined}
        rightDisabled={saving || !valid || !dirty}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.root}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <UiSection>
          {!metadataEditable ? (
            <UiText style={styles.hint}>{t("tripHome.editor.metadataReadOnly")}</UiText>
          ) : null}
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
              name: after.name,
              destination: after.destination,
              ...(metadataEditable && coverChanged
                ? {
                    selectedCoverAssetId: draftCover,
                    selectedCoverAssetIdRaw: draftCover,
                  }
                : {}),
            })}
            style={styles.cover}
          />
          <UiText style={styles.hint}>
            {t(
              metadataEditable ? "tripForm.coverDraft" : "tripHome.editor.coverLocalOnly",
            )}
          </UiText>
          <TripCoverPicker
            trip={{ ...trip, name: after.name, destination: after.destination }}
            selectedRaw={
              metadataEditable
                ? coverChanged
                  ? draftCover
                  : beforeCover
                : rawTripCover(trip)
            }
            onSelect={
              metadataEditable
                ? async (id) => {
                    if (beforeCover === undefined)
                      throw new Error("TRIP_COVER_STATE_UNAVAILABLE");
                    if (!busy.current) {
                      setDraftCover(id);
                      setCoverChanged(true);
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
          {saved ? (
            <UiText style={styles.hint}>{t("actionIsland.savedLocally")}</UiText>
          ) : null}
          {error ? (
            <UiText accessibilityRole="alert" style={styles.error}>
              {t("tripCreate.saveFailed")}
            </UiText>
          ) : null}
        </UiSection>
      </ScrollView>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    root: { padding: visual.space.page, gap: visual.space.section },
    label: { ...visual.type.meta, color: colors.textPrimary },
    cover: { height: 128, borderRadius: visual.radius.card, overflow: "hidden" },
    hint: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
