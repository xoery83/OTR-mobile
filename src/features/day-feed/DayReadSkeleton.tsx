import { StyleSheet, View } from "react-native";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

// Presentation only; placeholder shapes never stand in for business facts or actions.
export function DayReadSkeleton({ compact = false }: { compact?: boolean }) {
  useUiLocale();
  const s = useThemedStyles(styles);
  return (
    <View
      testID={compact ? "day-widget-skeleton" : "day-detail-skeleton"}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessibilityLabel={t("dayFeed.loading")}
      style={s.root}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={s.root}
      >
        <View style={[s.line, s.short]} />
        {!compact ? <View style={s.title} /> : null}
        <View style={[!compact && s.card, s.content]}>
          <View style={s.line} />
          <View style={[s.line, s.medium]} />
          <View style={[s.line, s.short]} />
        </View>
        {!compact ? (
          <>
            <View style={[s.card, s.content]}>
              <View style={[s.line, s.short]} />
              <View style={[s.line, s.medium]} />
            </View>
            <View style={s.actions}>
              <View style={[s.card, s.action]} />
              <View style={[s.card, s.action]} />
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}
const styles = (c: UiColors) =>
  StyleSheet.create({
    root: { gap: visual.space.row },
    line: {
      height: 14,
      width: "90%",
      backgroundColor: c.controlTrack,
      borderRadius: visual.radius.control,
    },
    short: { width: "32%" },
    medium: { width: "66%" },
    title: {
      height: 32,
      width: "64%",
      backgroundColor: c.controlTrack,
      borderRadius: visual.radius.control,
      marginBottom: visual.space.heading,
    },
    card: { backgroundColor: c.surface, borderRadius: visual.radius.association },
    content: { padding: visual.space.page, gap: visual.space.row },
    actions: { flexDirection: "row", gap: visual.space.row },
    action: { flex: 1, height: 64 },
  });
