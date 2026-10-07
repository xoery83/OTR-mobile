import { useEffect, useState, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { UiButton, UiSection } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { pickCaptureMaterial } from "@/native/capturePicker";
import { createCaptureStaging, type CaptureStagingSnapshot } from "./captureStaging";

// Hosts remount on invocation-context change. Context is a prior, never assignment.
export function CaptureContent({
  isCurrent,
  tripName,
  onCancel,
}: {
  isCurrent: () => boolean;
  tripName?: string;
  onCancel: () => void;
}) {
  const [{ staging, invocationTripName }] = useState(() => ({
    staging: createCaptureStaging(pickCaptureMaterial, isCurrent),
    invocationTripName: tripName,
  }));
  const snapshot = useSyncExternalStore(
    staging.subscribe,
    staging.getSnapshot,
    staging.getSnapshot,
  );
  useEffect(() => staging.attach(), [staging]);
  return (
    <CaptureTray
      snapshot={snapshot}
      tripName={invocationTripName}
      onFiles={() => {
        void staging.pick("files");
      }}
      onPhotos={() => {
        void staging.pick("photos");
      }}
      onRemove={staging.remove}
      onCancel={() => {
        staging.cancel();
        onCancel();
      }}
    />
  );
}

export function CaptureTray({
  snapshot,
  tripName,
  onFiles,
  onPhotos,
  onRemove,
  onCancel,
}: {
  snapshot: CaptureStagingSnapshot;
  tripName?: string;
  onFiles: () => void;
  onPhotos: () => void;
  onRemove: (id: number) => void;
  onCancel: () => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.content}>
      <UiSection
        title={tripName ? t("capture.context", { name: tripName }) : t("capture.title")}
      >
        <Text style={styles.secondary}>{t("capture.transient")}</Text>
        {tripName ? (
          <Text style={styles.secondary}>{t("capture.contextHint")}</Text>
        ) : null}
        <UiButton
          label={t("capture.files")}
          variant="secondary"
          disabled={snapshot.selecting}
          onPress={onFiles}
        />
        <UiButton
          label={t("capture.photos")}
          variant="secondary"
          disabled={snapshot.selecting}
          onPress={onPhotos}
        />
        {snapshot.selecting ? (
          <Text accessibilityLiveRegion="polite" style={styles.secondary}>
            {t("capture.selecting")}
          </Text>
        ) : null}
        {snapshot.error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {t("capture.pickerError")}
          </Text>
        ) : null}
      </UiSection>
      <UiSection
        title={t(
          snapshot.items.length === 1 ? "capture.countOne" : "capture.countOther",
          { count: snapshot.items.length },
        )}
      >
        {snapshot.items.length === 0 ? (
          <Text style={styles.secondary}>{t("capture.empty")}</Text>
        ) : null}
        {snapshot.items.map((item) => {
          const name = item.name ?? t("capture.unnamed");
          return (
            <View key={item.stagingId} style={styles.item}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.secondary}>
                {t(
                  item.source === "files"
                    ? "capture.sourceFiles"
                    : "capture.sourcePhotos",
                )}
              </Text>
              <Text style={styles.secondary}>
                {t(
                  item.availability === "unavailable"
                    ? "capture.unavailable"
                    : "capture.unverified",
                )}
              </Text>
              <UiButton
                label={t("capture.remove", { name })}
                variant="text"
                onPress={() => onRemove(item.stagingId)}
              />
            </View>
          );
        })}
      </UiSection>
      <Text style={styles.secondary}>{t("capture.submitUnavailable")}</Text>
      <UiButton
        label={t(snapshot.items.length === 1 ? "capture.addOne" : "capture.addOther", {
          count: snapshot.items.length,
        })}
        disabled
        onPress={() => undefined}
      />
      <UiButton label={t("common.cancel")} variant="text" onPress={onCancel} />
    </ScrollView>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    secondary: { color: colors.textSecondary, ...visual.type.meta },
    error: { color: colors.destructive, ...visual.type.row },
    name: { color: colors.textPrimary, ...visual.type.row },
    item: { gap: visual.space.heading },
  });
