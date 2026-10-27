import { DayReadSkeleton } from "./DayReadSkeleton";
import { Pressable, StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiButton, UiText as Text } from "@/ui/controls";
import { formatUiDate, formatUiNumber, t } from "@/ui/locale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { snapshotItemDate } from "@/domain/trip/journeySnapshot";
import type { PreparationFamily, TripPreparation } from "@/domain/trip/tripPreparation";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import { TripSetupRows, type TripSetupMetadata } from "./TripSetupRows";

export type TripPreparationCopy = {
  title: string;
  empty: string;
  recent: string;
  loading: string;
  unavailable: string;
  importPlans: string;
  buildItinerary: string;
  importMore: string;
  openDay: string;
  families: Record<PreparationFamily, string>;
};
const icons = {
  P1: "mappin.and.ellipse",
  P2: "airplane",
  P3: "bed.double",
  P4: "car",
  P5: "tram",
  P6: "ticket",
} as const;

const displayDate = (date: string) =>
  formatUiDate(new Date(`${date}T00:00:00Z`), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// Home owns loading, account fencing, action eligibility and revalidated navigation.
export function TripPreparationWidget({
  value,
  state,
  copy,
  onImport,
  onBuildItinerary,
  onOpenDay,
  onOpenItem,
  setup = null,
  metadata,
  onEdit,
  onCurrency,
  onCover,
}: {
  value: TripPreparation | null;
  state: "LOADING" | "READY" | "UNAVAILABLE";
  copy: TripPreparationCopy;
  onImport?: () => void;
  onBuildItinerary?: () => void;
  onOpenDay?: () => void;
  onOpenItem?: (itemId: string) => void;
  setup?: TripPreparationSetup | null;
  metadata?: TripSetupMetadata;
  onEdit?: () => void;
  onCurrency?: () => void;
  onCover?: () => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const ready = state === "READY" && value !== null;
  return (
    <View style={styles.widget}>
      <Text accessibilityRole="header" style={styles.heading}>
        {copy.title}
      </Text>
      {!ready ? (
        state === "LOADING" ? (
          <DayReadSkeleton compact />
        ) : (
          <Text accessibilityRole="alert" style={styles.meta}>
            {copy.unavailable}
          </Text>
        )
      ) : value.itemCount === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.meta}>{copy.empty}</Text>
          {onImport ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.importPlans}
              accessibilityHint={t("tripHome.preparation.importHint")}
              onPress={onImport}
              style={styles.startAction}
            >
              <View style={styles.startIcon}>
                <AppIcon name="square.and.arrow.down" size={26} color={colors.accent} />
              </View>
              <View style={styles.itemText}>
                <Text style={styles.row}>{copy.importPlans}</Text>
                <Text style={styles.meta}>{t("tripHome.preparation.importHint")}</Text>
              </View>
              <AppIcon name="chevron.right" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          {onBuildItinerary ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.buildItinerary}
              accessibilityHint={t("tripHome.preparation.buildHint")}
              onPress={onBuildItinerary}
              style={styles.startAction}
            >
              <View style={styles.startIcon}>
                <AppIcon name="map" size={26} color={colors.accent} />
              </View>
              <View style={styles.itemText}>
                <Text style={styles.row}>{copy.buildItinerary}</Text>
                <Text style={styles.meta}>{t("tripHome.preparation.buildHint")}</Text>
              </View>
              <AppIcon name="chevron.right" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.counts}>
            {value.counts.map(({ family, count }) => (
              <View key={family} style={styles.count}>
                <AppIcon name={icons[family]} size={22} color={colors.textSecondary} />
                <Text style={styles.metric}>{formatUiNumber(count)}</Text>
                <Text style={styles.meta}>{copy.families[family]}</Text>
              </View>
            ))}
          </View>
          {value.recent.length ? (
            <View style={styles.recent}>
              <Text accessibilityRole="header" style={styles.meta}>
                {copy.recent}
              </Text>
              {value.recent.map(({ item }) => {
                const date = snapshotItemDate(item);
                return (
                  <Pressable
                    key={item.itemId}
                    accessibilityRole="button"
                    accessibilityLabel={String(item.title)}
                    accessibilityState={{ disabled: !onOpenItem }}
                    disabled={!onOpenItem}
                    onPress={() => onOpenItem?.(item.itemId)}
                    style={styles.item}
                  >
                    <AppIcon
                      name={icons[item.family as PreparationFamily]}
                      color={colors.textSecondary}
                      size={22}
                    />
                    <View style={styles.itemText}>
                      <Text style={styles.row} numberOfLines={2}>
                        {String(item.title)}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {date
                          ? displayDate(date)
                          : copy.families[item.family as PreparationFamily]}
                      </Text>
                    </View>
                    <AppIcon
                      name="chevron.right"
                      color={colors.textSecondary}
                      size={16}
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.actions}>
            {onImport ? (
              <UiButton label={copy.importMore} variant="text" onPress={onImport} />
            ) : null}
            {onOpenDay ? (
              <UiButton label={copy.openDay} variant="text" onPress={onOpenDay} />
            ) : null}
          </View>
        </>
      )}
      {ready || setup ? (
        <TripSetupRows
          setup={setup}
          metadata={metadata}
          onEdit={onEdit}
          onCurrency={onCurrency}
          onCover={onCover}
        />
      ) : null}
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    widget: {
      gap: visual.space.card,
    },
    heading: { ...visual.type.section, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    metric: { ...visual.type.metric, color: c.textPrimary },
    empty: { gap: visual.space.card },
    startAction: {
      minHeight: 88,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      padding: visual.space.card,
      borderRadius: visual.radius.card,
      backgroundColor: c.accentSurface,
    },
    startIcon: {
      padding: visual.space.card,
      borderRadius: visual.radius.control,
      backgroundColor: c.surface,
    },
    counts: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.section },
    count: { alignItems: "center", gap: 4, flexBasis: "28%", flexGrow: 1 },
    recent: { gap: visual.space.heading },
    item: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      paddingVertical: visual.space.heading,
    },
    itemText: { flex: 1, gap: visual.space.heading },
    row: { ...visual.type.row, color: c.textPrimary },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: visual.space.card,
    },
  });
