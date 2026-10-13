import { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { UiButton } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { builtInTripCoverIds, builtInTripCoverSource } from "./tripCovers";
import type { BuiltInTripCoverId } from "./tripCoverSelection";
import { TripCoverVisual } from "./TripCoverVisual";

export function TripCoverPicker({
  selected,
  onSelect,
}: {
  selected?: BuiltInTripCoverId | null;
  onSelect(id: BuiltInTripCoverId): Promise<void>;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const largeText = useWindowDimensions().fontScale > 2;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  return (
    <View style={styles.root}>
      <UiButton
        label={t("myTrips.chooseCover")}
        variant="text"
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <View style={[styles.choices, largeText && styles.largeChoices]}>
          {builtInTripCoverIds.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={t(`myTrips.cover.${id}`)}
              accessibilityState={{ selected: selected === id, disabled: saving }}
              disabled={saving}
              onPress={() => {
                setSaving(true);
                setError(false);
                void onSelect(id)
                  .then(() => setOpen(false))
                  .catch(() => setError(true))
                  .finally(() => setSaving(false));
              }}
              style={[styles.choice, largeText && styles.largeChoice]}
            >
              <TripCoverVisual
                source={builtInTripCoverSource(id)}
                style={[styles.image, largeText && styles.largeImage]}
              />
              <Text style={[styles.label, largeText && styles.largeLabel]}>
                {t(`myTrips.cover.${id}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t("myTrips.coverFailed")}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { gap: visual.space.heading },
    choices: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: visual.space.heading,
    },
    largeChoices: { flexDirection: "column" },
    choice: {
      flex: 1,
      minHeight: 72,
      gap: visual.space.heading,
      backgroundColor: c.surface,
      borderRadius: visual.radius.card,
      overflow: "hidden",
    },
    largeChoice: { flex: 0, width: "100%", flexDirection: "row", alignItems: "center" },
    image: { width: "100%", height: 76 },
    largeImage: { width: 96 },
    label: {
      ...visual.type.meta,
      color: c.textPrimary,
      paddingHorizontal: visual.space.heading,
      paddingBottom: visual.space.heading,
    },
    largeLabel: { flexShrink: 1, paddingVertical: visual.space.heading },
    error: { ...visual.type.meta, color: c.destructive },
  });
