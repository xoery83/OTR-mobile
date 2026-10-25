import { StyleSheet, View } from "react-native";
import { UiButton, UiText } from "@/ui/controls";
import { formatUiDate, formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
export function DayFeedFidelityHeading({
  date,
  start,
  today,
  empty,
  onAdd,
  previousColor,
  dayColor,
}: {
  date: string;
  start: string;
  today: string;
  empty: boolean;
  onAdd?(): void;
  previousColor?: string;
  dayColor?: string;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const ordinal =
    Math.round(
      (Date.parse(date + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000,
    ) + 1;
  const delta = Math.round(
    (Date.parse(date + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000,
  );
  const at = new Date(date + "T12:00:00Z"),
    isToday = delta === 0,
    isTomorrow = delta === 1,
    past = delta < 0;
  const title = isToday
    ? t("search.today")
    : isTomorrow
      ? t("fidelity.tomorrow")
      : formatUiDate(at, { weekday: "long", timeZone: "UTC" });
  return (
    <View
      style={[
        styles.root,
        previousColor && dayColor
          ? {
              experimental_backgroundImage: [
                {
                  type: "linear-gradient",
                  // ui-foundation-exception: string -- Native gradient direction from the existing shared cover implementation.
                  direction: "to bottom",
                  colorStops: [
                    { color: previousColor, positions: ["0%"] },
                    { color: dayColor, positions: ["38px", "100%"] },
                  ],
                },
              ],
            }
          : undefined,
      ]}
    >
      <View style={[styles.heading, isToday && styles.todayHeading]}>
        <View
          accessibilityLabel={t("fidelity.dayOrdinal", { day: ordinal })}
          style={[styles.badge, isToday && styles.todayBadge]}
        >
          <View
            style={[
              styles.binding,
              styles.bindingLeft,
              isToday && styles.bindingOnAccent,
            ]}
          />
          <View
            style={[
              styles.binding,
              styles.bindingRight,
              isToday && styles.bindingOnAccent,
            ]}
          />
          <UiText style={[styles.badgeLabel, isToday && styles.badgeOnAccent]}>
            {formatUiNumber(ordinal)}
          </UiText>
        </View>
        <View style={styles.copy}>
          <UiText
            accessibilityRole="header"
            style={[
              styles.title,
              past && styles.past,
              isToday && styles.today,
              isTomorrow && styles.tomorrow,
            ]}
          >
            {title}
          </UiText>
          <UiText style={styles.meta}>
            {formatUiDate(at, {
              dateStyle: isToday || isTomorrow ? "full" : "medium",
              timeZone: "UTC",
            })}
          </UiText>
        </View>
      </View>
      {empty ? (
        past ? (
          <UiText style={styles.empty}>{t("fidelity.empty")}</UiText>
        ) : (
          <View style={styles.emptyCard}>
            <UiText style={styles.meta}>{t("fidelity.empty")}</UiText>
            {onAdd ? (
              <UiButton variant="text" label={t("fidelity.manualAdd")} onPress={onAdd} />
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { paddingTop: 20, paddingBottom: 10 },
    heading: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginBottom: 10,
    },
    todayHeading: {
      minHeight: 83,
      marginBottom: 8,
      paddingBottom: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    badge: {
      width: 43,
      height: 49,
      borderWidth: 1,
      borderTopWidth: 6,
      borderColor: c.separator,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
    },
    todayBadge: {
      width: 49,
      height: 55,
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    binding: {
      position: "absolute",
      top: -9,
      width: 4,
      height: 8,
      borderRadius: 2,
      backgroundColor: c.separator,
    },
    bindingLeft: { left: 10 },
    bindingRight: { right: 10 },
    bindingOnAccent: { backgroundColor: c.onAccent },
    badgeLabel: { ...visual.type.section, color: c.textPrimary },
    badgeOnAccent: { color: c.onAccent },
    copy: { flex: 1, minWidth: 0, gap: 4 },
    title: { ...visual.type.section, color: c.textPrimary },
    past: { color: c.textSecondary },
    today: { fontSize: 27, color: c.accent },
    tomorrow: { fontSize: 21, color: c.accent },
    meta: { ...visual.type.meta, color: c.textSecondary },
    empty: { ...visual.type.meta, color: c.textSecondary, paddingVertical: 12 },
    emptyCard: {
      backgroundColor: c.surface,
      borderRadius: visual.radius.card,
      padding: 17,
      gap: 9,
    },
  });
