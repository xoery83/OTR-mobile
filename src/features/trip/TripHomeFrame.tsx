import type { TripCoverAssetId } from "@/domain/trip/tripCoverAssets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from "react-native";
import { UiText } from "@/ui/controls";
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
  coverAssetId,
  widgets = [],
  modules,
  notice,
  onHeroHeight,
  onEdit,
}: {
  title: string;
  metadata: readonly string[];
  cover: ImageSourcePropType;
  coverAssetId?: TripCoverAssetId;
  widgets?: readonly TripHomeWidget[];
  modules?: ReactNode;
  notice?: string;
  onHeroHeight?: (height: number) => void;
  onEdit?: () => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.frame}>
      <TripCoverVisual
        onLayout={
          onHeroHeight
            ? (event) => onHeroHeight(event.nativeEvent.layout.height)
            : undefined
        }
        source={cover}
        assetId={coverAssetId}
        style={[styles.hero, { width, minHeight: height * 0.32 }]}
      >
        <Pressable
          onPress={onEdit}
          disabled={!onEdit}
          accessible={!!onEdit}
          accessibilityRole={onEdit ? "button" : undefined}
          accessibilityLabel={
            onEdit
              ? `${t("tripHome.edit")}: ${[title, ...metadata].join(", ")}`
              : undefined
          }
          style={[
            styles.copy,
            {
              paddingLeft: Math.max(visual.space.page, insets.left),
              paddingRight: Math.max(visual.space.page, insets.right),
              paddingTop: insets.top + 60,
            },
          ]}
        >
          <UiText accessibilityRole="header" style={styles.title}>
            {title}
          </UiText>
          {metadata.map((line, index) => (
            <UiText key={index} style={index === 0 ? styles.date : styles.meta}>
              {line}
            </UiText>
          ))}
        </Pressable>
      </TripCoverVisual>
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
    hero: { alignSelf: "center", borderRadius: 0 },
    copy: {
      paddingHorizontal: visual.space.page,
      paddingVertical: visual.space.card,
      gap: visual.space.heading / 2,
    },
    title: {
      ...visual.type.tripHeroTitle,
      color: colors.mediaText,
      textShadowColor: colors.mediaBackground,
      textShadowRadius: 4,
      textShadowOffset: { width: 0, height: 1 },
    },
    meta: { ...visual.type.meta, color: colors.mediaText, opacity: 0.85 },
    date: { ...visual.type.tripDate, color: colors.mediaText },
    notice: {
      ...visual.type.meta,
      color: colors.textSecondary,
      paddingHorizontal: visual.space.page,
    },
    workspace: { gap: visual.space.card, paddingHorizontal: visual.space.page },
    heading: { ...visual.type.section, color: colors.textPrimary },
  });
