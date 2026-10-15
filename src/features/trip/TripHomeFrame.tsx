import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from "react-native";
import { UiButton, UiText } from "@/ui/controls";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { TripCoverVisual } from "@/features/day-feed/TripCoverVisual";
import { TripHomeWidgetHost, type TripHomeWidget } from "./TripHomeWidgetHost";

export function TripHomeFrame({
  title,
  metadata,
  cover,
  widgets = [],
  modules,
  onEdit,
  notice,
  onBack,
}: {
  title: string;
  metadata: readonly string[];
  cover: ImageSourcePropType;
  widgets?: readonly TripHomeWidget[];
  modules?: ReactNode;
  onEdit?: () => void;
  notice?: string;
  onBack?: () => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const detailsBelow = fontScale > 1 || width > height;
  return (
    <View style={styles.frame}>
      <TripCoverVisual
        source={cover}
        style={[styles.hero, { width, height: Math.min(232, height * 0.4) }]}
      >
        <View
          style={[
            styles.copy,
            {
              paddingLeft: Math.max(visual.space.page, insets.left),
              paddingRight: Math.max(visual.space.page, insets.right),
            },
          ]}
        >
          <UiText
            accessibilityRole="header"
            style={styles.title}
            numberOfLines={detailsBelow ? 1 : 2}
          >
            {title}
          </UiText>
          {!detailsBelow
            ? metadata.map((line, index) => (
                <UiText key={index} style={styles.meta} numberOfLines={1}>
                  {line}
                </UiText>
              ))
            : null}
        </View>
      </TripCoverVisual>
      {detailsBelow ? (
        <View style={styles.details}>
          <UiText accessibilityRole="header" style={styles.heading}>
            {title}
          </UiText>
          {metadata.map((line, index) => (
            <UiText key={index} style={styles.notice}>
              {line}
            </UiText>
          ))}
        </View>
      ) : null}
      {onBack ? (
        <UiButton variant="text" label={t("dayFeed.myTrips")} onPress={onBack} />
      ) : null}
      {onEdit ? (
        <UiButton variant="secondary" label={t("tripHome.edit")} onPress={onEdit} />
      ) : null}
      {notice ? <UiText style={styles.notice}>{notice}</UiText> : null}
      <View style={styles.workspace}>
        <TripHomeWidgetHost widgets={widgets} />
      </View>
      {modules ? (
        <View style={styles.workspace}>
          <UiText accessibilityRole="header" style={styles.heading}>
            {t("tripHome.tools")}
          </UiText>
          {modules}
        </View>
      ) : null}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    frame: { gap: visual.space.section },
    hero: { alignSelf: "center", borderRadius: visual.radius.hero },
    copy: {
      paddingHorizontal: visual.space.page,
      paddingVertical: visual.space.card,
      gap: visual.space.heading,
    },
    title: { ...visual.type.section, color: colors.mediaText },
    meta: { ...visual.type.meta, color: colors.mediaText },
    details: { gap: visual.space.heading },
    notice: { ...visual.type.meta, color: colors.textSecondary },
    workspace: { gap: visual.space.card },
    heading: { ...visual.type.section, color: colors.textPrimary },
  });
