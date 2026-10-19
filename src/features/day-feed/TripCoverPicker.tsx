import { useState } from "react";
import { FlatList, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import {
  isTripCoverAssetId,
  legacyTripCoverAssetIds,
  type TripCoverAssetId,
} from "@/domain/trip/tripCoverAssets";
import {
  coverCatalog,
  rankedTripCovers,
  type CoverMetadata,
} from "@/features/trip-cover/coverDecision";
import { builtInTripCoverIds, builtInTripCoverSource } from "./tripCovers";
import { TripCoverVisual } from "./TripCoverVisual";

export function TripCoverPicker({
  trip,
  selectedRaw,
  onSelect,
}: {
  trip: CoverMetadata;
  selectedRaw?: string | null;
  onSelect(id: TripCoverAssetId | null): Promise<void>;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [credits, setCredits] = useState(false);
  const ranked = open ? rankedTripCovers(trip, 48) : [];
  const recommended = new Set(ranked.map((row) => row.asset.id));
  const order = [
    ...ranked.map((row) => row.asset.id).filter(isTripCoverAssetId),
    ...builtInTripCoverIds.filter((id) => !recommended.has(id)),
  ];
  const select = (id: TripCoverAssetId | null) => {
    if (saving) return;
    setSaving(true);
    setError(false);
    void onSelect(id)
      .then(() => setOpen(false))
      .catch(() => setError(true))
      .finally(() => setSaving(false));
  };
  return (
    <View>
      <UiButton
        label={t("myTrips.chooseCover")}
        variant="text"
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => {
          if (!saving) setOpen(false);
        }}
      >
        <View
          style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        >
          <SheetHeader
            title={t("myTrips.chooseCover")}
            leftLabel={t("common.close")}
            onLeft={() => {
              if (!saving) setOpen(false);
            }}
          />
          <FlatList
            data={open ? order : []}
            keyExtractor={(id) => id}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.header}>
                <UiText>{t("coverLibrary.preview")}</UiText>
                {selectedRaw !== null && !isTripCoverAssetId(selectedRaw) ? (
                  <UiText>{t("coverLibrary.unavailable")}</UiText>
                ) : null}
                <UiButton
                  label={t("coverLibrary.automatic")}
                  variant={selectedRaw === null ? "primary" : "secondary"}
                  disabled={saving}
                  onPress={() => select(null)}
                />
                <UiButton
                  label={t("coverLibrary.credits")}
                  variant="text"
                  onPress={() => setCredits(!credits)}
                />
                {credits ? (
                  <View>
                    <UiText>{t("coverLibrary.geoCredits")}</UiText>
                    <UiButton
                      label={t("coverLibrary.geoNames")}
                      variant="text"
                      onPress={() => {
                        void Linking.openURL("https://www.geonames.org/").catch(() =>
                          setError(true),
                        );
                      }}
                    />
                    <UiButton
                      label={t("coverLibrary.wikidata")}
                      variant="text"
                      onPress={() => {
                        void Linking.openURL("https://www.wikidata.org/").catch(() =>
                          setError(true),
                        );
                      }}
                    />
                    <UiButton
                      label={t("coverLibrary.geoLicense")}
                      variant="text"
                      onPress={() => {
                        void Linking.openURL(
                          "https://creativecommons.org/licenses/by/4.0/",
                        ).catch(() => setError(true));
                      }}
                    />
                  </View>
                ) : null}
                {error ? (
                  <UiText accessibilityRole="alert" style={styles.error}>
                    {t("myTrips.coverFailed")}
                  </UiText>
                ) : null}
              </View>
            }
            renderItem={({ item: id }) => {
              const asset = coverCatalog.find((row) => row.id === id);
              const legacy = legacyTripCoverAssetIds.find((value) => value === id);
              const title = legacy ? t(`myTrips.cover.${legacy}`) : (asset?.title ?? id);
              return (
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={title}
                    accessibilityState={{
                      selected: selectedRaw === id,
                      disabled: saving,
                    }}
                    disabled={saving}
                    onPress={() => select(id)}
                    style={styles.choice}
                  >
                    <TripCoverVisual
                      source={builtInTripCoverSource(id)}
                      style={styles.image}
                    />
                    <View style={styles.body}>
                      <UiText style={styles.title}>{title}</UiText>
                      {recommended.has(id) ? (
                        <UiText style={styles.meta}>
                          {t("coverLibrary.recommended")}
                        </UiText>
                      ) : null}
                      {asset ? (
                        <UiText style={styles.meta}>
                          {asset.provenance.author} · {asset.provenance.license}
                        </UiText>
                      ) : null}
                      {asset?.provenance.kind === "generated_illustration" ? (
                        <UiText style={styles.meta}>
                          {t("coverLibrary.illustration")}
                        </UiText>
                      ) : null}
                    </View>
                  </Pressable>
                  {credits && asset ? (
                    <View style={styles.credits}>
                      <UiText style={styles.meta}>{asset.provenance.attribution}</UiText>
                      {asset.provenance.sourceUrl.startsWith("https://") ? (
                        <UiButton
                          label={t("coverLibrary.source")}
                          variant="text"
                          onPress={() => {
                            void Linking.openURL(asset.provenance.sourceUrl).catch(() =>
                              setError(true),
                            );
                          }}
                        />
                      ) : null}
                      {asset.provenance.licenseUrl.startsWith("https://") ? (
                        <UiButton
                          label={t("coverLibrary.license")}
                          variant="text"
                          onPress={() => {
                            void Linking.openURL(asset.provenance.licenseUrl).catch(() =>
                              setError(true),
                            );
                          }}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    list: { padding: visual.space.page, gap: visual.space.heading },
    header: { gap: visual.space.heading, paddingBottom: visual.space.heading },
    row: {
      backgroundColor: c.surface,
      borderRadius: visual.radius.card,
      overflow: "hidden",
    },
    choice: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 88,
      gap: visual.space.heading,
      padding: visual.space.heading,
    },
    body: { flex: 1, gap: visual.space.heading },
    image: { width: 96, height: 76, borderRadius: visual.radius.card },
    title: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    credits: { padding: visual.space.heading },
    error: { ...visual.type.meta, color: c.destructive },
  });
