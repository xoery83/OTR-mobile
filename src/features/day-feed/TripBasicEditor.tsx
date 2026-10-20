import { useEffect, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
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
import {
  readTripPreparationSetupRepository,
  type TripPreparationSetup,
} from "@/data/repositories/tripPreparationSetupRepository";
import { TripCurrencyRow } from "./TripSetupRows";
import { SheetHeader } from "@/components/SheetHeader";
import { rawTripCover } from "@/features/trip-cover/coverDecision";
import {
  isTripCoverAssetId,
  parseTripPhotoCoverRef,
  tripPhotoCoverRef,
  type TripCoverChoice,
  type TripCoverUpdate,
} from "@/domain/trip/tripCoverAssets";
import * as ImagePicker from "expo-image-picker";
import { readLocalTripPhotoRepository } from "@/data/repositories/tripPhotoRepository";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { SafeAreaView } from "react-native-safe-area-context";
import { CurrencySettingsScreen } from "@/features/ledger/CurrencySettingsScreen";
import { createUuid } from "@/domain/localId";

export function TripBasicEditor({
  trip,
  onSelectCover,
  onSaveMetadata,
  metadataEditable,
  setup = null,
  currencyAvailable = false,
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
  currencyAvailable?: boolean;
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
  const initialRaw = rawTripCover(trip);
  const initialPhotoId = parseTripPhotoCoverRef(initialRaw);
  const [draftCover, setDraftCover] = useState<TripCoverChoice | null>(
    isTripCoverAssetId(initialRaw)
      ? initialRaw
      : initialPhotoId
        ? tripPhotoCoverRef(initialPhotoId)
        : null,
  );
  const alive = useRef(true);
  const generation = getAccountGeneration();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
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
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [currencySetup, setCurrencySetup] = useState<TripPreparationSetup | null>(null);
  const closeCurrency = () => {
    setCurrencyOpen(false);
    void (async () => {
      try {
        const reader = await readTripPreparationSetupRepository();
        if (!alive.current || generation !== getAccountGeneration()) return;
        const facts = await reader.read(trip.id);
        if (
          alive.current &&
          generation === getAccountGeneration() &&
          facts.context.tripId === trip.id &&
          facts.context.generation === generation
        )
          setCurrencySetup(facts);
      } catch {
        /* Keep the last authoritative currency presentation on read failure. */
      }
    })();
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
          <TripCoverPicker
            trip={{ ...trip, name: after.name, destination: after.destination }}
            selectedRaw={
              metadataEditable
                ? coverChanged
                  ? draftCover
                  : beforeCover
                : rawTripCover(trip)
            }
            onSelect={async (id) => {
              if (metadataEditable) {
                if (beforeCover === undefined)
                  throw new Error("TRIP_COVER_STATE_UNAVAILABLE");
                if (!busy.current) {
                  setDraftCover(id);
                  setCoverChanged(true);
                  setSaved(false);
                }
              } else if (id === null || isTripCoverAssetId(id)) {
                await onSelectCover(id);
              } else throw new Error("TRIP_COVER_NOT_EDITABLE");
            }}
            onChoosePhoto={
              metadataEditable && beforeCover !== undefined
                ? async () => {
                    const current = () =>
                      alive.current && generation === getAccountGeneration();
                    if (!current() || busy.current) return false;
                    const choice = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ["images"],
                      allowsMultipleSelection: false,
                      quality: 1,
                      base64: false,
                      exif: false,
                    });
                    if (!current() || choice.canceled) return false;
                    const repo = await readLocalTripPhotoRepository();
                    if (!current()) return false;
                    const uri = choice.assets[0]?.uri;
                    if (!uri?.startsWith("file://"))
                      throw new Error("TRIP_PHOTO_PICKER_FILE_UNAVAILABLE");
                    const photo = await repo.addTripPhoto(trip.id, uri);
                    if (!current()) return false;
                    if (!photo.localUri) throw new Error("TRIP_PHOTO_FILE_UNAVAILABLE");
                    setDraftCover(tripPhotoCoverRef(photo.assetId));
                    setCoverChanged(true);
                    setSaved(false);
                    return true;
                  }
                : undefined
            }
          />
        </UiSection>
        <TripCurrencyRow
          setup={currencySetup ?? setup}
          onOpen={saving || !currencyAvailable ? undefined : () => setCurrencyOpen(true)}
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
      <Modal
        visible={currencyOpen}
        presentationStyle="pageSheet"
        animationType="slide"
        allowSwipeDismissal
        onRequestClose={closeCurrency}
      >
        <SafeAreaView edges={["bottom"]} style={styles.container}>
          <SheetHeader
            title={t("currencySettings.heading")}
            leftLabel={t("common.back")}
            safeTop={false}
            onLeft={closeCurrency}
          />
          {currencyOpen ? (
            <CurrencySettingsScreen key={trip.id} journeyId={trip.id} />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    root: { padding: visual.space.page, gap: visual.space.section },
    label: { ...visual.type.meta, color: colors.textPrimary },
    hint: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
