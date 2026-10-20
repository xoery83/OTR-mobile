import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { AppIcon } from "@/components/AppIcon";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import {
  isTripCoverAssetId,
  parseTripPhotoCoverRef,
  type TripCoverChoice,
} from "@/domain/trip/tripCoverAssets";
import { type CoverMetadata } from "@/features/trip-cover/coverDecision";
import { builtInTripCoverSource, tripCoverId, tripCoverSource } from "./tripCovers";
import { suggestedCoverIds, tripCoverDescription } from "./tripCoverRecommendations";
import { TripCoverVisual } from "./TripCoverVisual";

export function TripCoverPicker({
  trip,
  selectedRaw,
  onSelect,
  onChoosePhoto,
}: {
  trip: CoverMetadata;
  selectedRaw?: string | null;
  onSelect(id: TripCoverChoice | null): Promise<void>;
  onChoosePhoto?(): Promise<boolean>;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState(false);
  const [chooseManual, setChooseManual] = useState(false);
  const current = { ...trip, selectedCoverAssetIdRaw: selectedRaw };
  const currentId = tripCoverId(current);
  const personal = parseTripPhotoCoverRef(selectedRaw) !== null;
  const order = open ? suggestedCoverIds(trip, personal ? selectedRaw : currentId) : [];
  const select = async (id: TripCoverChoice | null, closeAfter = true) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(false);
    try {
      await onSelect(id);
      if (closeAfter) setOpen(false);
      setChooseManual(false);
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const choosePhoto = async () => {
    if (busy.current || !onChoosePhoto) return;
    busy.current = true;
    setSaving(true);
    setError(false);
    try {
      if (await onChoosePhoto()) setOpen(false);
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const close = () => {
    if (!busy.current) setOpen(false);
  };
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("myTrips.chooseCover")}
        onPress={() => {
          setError(false);
          setChooseManual(false);
          setOpen(true);
        }}
        style={styles.preview}
      >
        <TripCoverVisual
          tripId={trip.id}
          rawSelection={selectedRaw}
          source={tripCoverSource(current)}
          assetId={currentId}
          style={styles.cover}
        />
        <View pointerEvents="none" style={styles.edit}>
          <AppIcon name="square.and.pencil" color={colors.mediaText} size={22} />
        </View>
      </Pressable>
      <Modal
        visible={open}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={close}
        allowSwipeDismissal={!saving}
      >
        <SafeAreaView edges={["bottom"]} style={styles.root}>
          <SheetHeader
            title={t("myTrips.chooseCover")}
            leftLabel={t("common.close")}
            onLeft={close}
            safeTop={false}
          />
          <ScrollView style={styles.root} contentContainerStyle={styles.list}>
            <View style={styles.firstRow}>
              <View style={styles.tile}>
                <TripCoverVisual
                  tripId={trip.id}
                  rawSelection={selectedRaw}
                  source={tripCoverSource(current)}
                  assetId={currentId}
                  style={styles.image}
                />
                <UiText style={styles.caption}>{t("coverLibrary.current")}</UiText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("coverLibrary.choosePhoto")}
                accessibilityState={{ disabled: saving || !onChoosePhoto }}
                disabled={saving || !onChoosePhoto}
                onPress={() => void choosePhoto()}
                style={[
                  styles.tile,
                  styles.upload,
                  (saving || !onChoosePhoto) && styles.disabled,
                ]}
              >
                <AppIcon name="photo.badge.plus" color={colors.accent} size={28} />
                <UiText style={styles.caption}>{t("coverLibrary.choosePhoto")}</UiText>
              </Pressable>
            </View>
            {selectedRaw !== null &&
            selectedRaw !== undefined &&
            !isTripCoverAssetId(selectedRaw) &&
            !personal ? (
              <UiText style={styles.meta}>{t("coverLibrary.unavailable")}</UiText>
            ) : null}
            <View style={styles.grid}>
              {order.map((id, index) => (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={t("coverLibrary.option", {
                    number: index + 1,
                    description: tripCoverDescription(id),
                  })}
                  accessibilityState={{ disabled: saving }}
                  disabled={saving}
                  onPress={() => void select(id)}
                  style={styles.tile}
                >
                  <TripCoverVisual
                    source={builtInTripCoverSource(id)}
                    assetId={id}
                    style={styles.image}
                  />
                </Pressable>
              ))}
            </View>
            {error ? (
              <UiText accessibilityRole="alert" style={styles.error}>
                {t("myTrips.coverFailed")}
              </UiText>
            ) : null}
            <View style={styles.automatic}>
              <UiText style={styles.caption}>{t("coverLibrary.automatic")}</UiText>
              <Switch
                accessibilityLabel={t("coverLibrary.automatic")}
                value={selectedRaw === null}
                disabled={saving || selectedRaw === undefined}
                onValueChange={(automatic) => {
                  if (automatic) void select(null, false);
                  else if (selectedRaw === null) setChooseManual(true);
                }}
              />
            </View>
            {chooseManual && selectedRaw === null ? (
              <UiText accessibilityLiveRegion="polite" style={styles.meta}>
                {t("coverLibrary.chooseManual")}
              </UiText>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    list: { padding: visual.space.page, gap: visual.space.section },
    preview: { position: "relative" },
    cover: { height: 128, borderRadius: visual.radius.card },
    edit: {
      position: "absolute",
      top: 0,
      right: 0,
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    firstRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: visual.space.card,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: visual.space.card,
    },
    tile: { width: "47%", minHeight: 88, gap: visual.space.heading },
    image: { width: "100%", aspectRatio: 1.5, borderRadius: visual.radius.card },
    upload: {
      borderRadius: visual.radius.card,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
      padding: visual.space.card,
    },
    caption: { ...visual.type.meta, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    disabled: { opacity: 0.5 },
    automatic: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      minHeight: 44,
      gap: visual.space.card,
    },
    error: { ...visual.type.meta, color: c.destructive },
  });
