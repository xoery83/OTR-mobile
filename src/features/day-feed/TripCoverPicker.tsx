import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
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
  presentation = "editor",
  onClose,
}: {
  trip: CoverMetadata;
  selectedRaw?: string | null;
  onSelect(id: TripCoverChoice | null): Promise<void>;
  onChoosePhoto?(processing: () => Promise<void>): Promise<boolean>;
  presentation?: "editor" | "standalone";
  onClose?(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const [open, setOpen] = useState(presentation === "standalone");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [photoSaved, setPhotoSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const current = { ...trip, selectedCoverAssetIdRaw: selectedRaw };
  const currentId = tripCoverId(current);
  const personal = parseTripPhotoCoverRef(selectedRaw) !== null;
  const order = open ? suggestedCoverIds(trip, personal ? selectedRaw : currentId) : [];
  const dismiss = () => {
    setOpen(false);
    onClose?.();
  };
  const select = async (id: TripCoverChoice | null, closeAfter = true) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(false);
    setPhotoSaved(false);
    try {
      await onSelect(id);
      if (closeAfter) dismiss();
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
    setPhotoSaved(false);
    try {
      const chosen = await onChoosePhoto(async () => {
        if (!alive.current) return;
        setProcessingPhoto(true);
        // Give native feedback a paint before synchronous local file verification.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      if (chosen && alive.current) {
        if (presentation === "standalone") setPhotoSaved(true);
        else dismiss();
      }
    } catch {
      if (alive.current) setError(true);
    } finally {
      busy.current = false;
      if (alive.current) {
        setSaving(false);
        setProcessingPhoto(false);
      }
    }
  };
  const close = () => {
    if (!busy.current) dismiss();
  };
  return (
    <View>
      {presentation === "editor" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("myTrips.chooseCover")}
          onPress={() => {
            setError(false);
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
      ) : null}
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
            leftDisabled={saving}
            safeTop={false}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.root}
            contentContainerStyle={styles.list}
          >
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
            {processingPhoto ? (
              <View accessibilityState={{ busy: true }} style={styles.progress}>
                <ActivityIndicator color={colors.accent} />
                <UiText accessibilityLiveRegion="polite" style={styles.meta}>
                  {t("coverLibrary.processingPhoto")}
                </UiText>
              </View>
            ) : photoSaved ? (
              <UiText accessibilityLiveRegion="polite" style={styles.meta}>
                {t("coverLibrary.photoSaved")}
              </UiText>
            ) : null}
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
                  else if (selectedRaw === null) {
                    if (isTripCoverAssetId(currentId)) void select(currentId, false);
                    else setError(true);
                  }
                }}
              />
            </View>
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
    progress: { flexDirection: "row", alignItems: "center", gap: visual.space.card },
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
