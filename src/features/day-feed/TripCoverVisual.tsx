import { useState, type ReactNode } from "react";
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewProps,
} from "react-native";
import type { TripCoverAssetId } from "@/domain/trip/tripCoverAssets";
import { AppIcon } from "@/components/AppIcon";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";

export function TripCoverVisual({
  source,
  assetId,
  style,
  children,
  onLayout,
}: {
  source: ImageSourcePropType;
  assetId?: TripCoverAssetId;
  style: StyleProp<ImageStyle>;
  children?: ReactNode;
  onLayout?: ViewProps["onLayout"];
}) {
  const [failedSource, setFailedSource] = useState<ImageSourcePropType | null>(null);
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View onLayout={onLayout} style={[style, styles.cover]}>
      {failedSource === source ? (
        <View style={[StyleSheet.absoluteFill, styles.fallback]} accessible={false}>
          <AppIcon name="suitcase" color={colors.accent} size={32} />
        </View>
      ) : (
        <Image
          source={source}
          style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
          // Frozen Owner22 crop policy preserves the full iceberg in every cover surface.
          resizeMode={assetId === "owner-photo-593487a64e45" ? "contain" : "cover"}
          accessible={false}
          onError={() => setFailedSource(source)}
        />
      )}
      {children ? <View style={styles.overlay}>{children}</View> : null}
    </View>
  );
}

const createStyles = (c: UiColors) =>
  StyleSheet.create({
    cover: { overflow: "hidden", backgroundColor: c.mediaBackground },
    overlay: {
      flexGrow: 1,
      justifyContent: "flex-end",
      experimental_backgroundImage: [
        {
          type: "linear-gradient",
          // ui-foundation-exception: string -- Native gradient direction identifier, not user-facing copy.
          direction: "to bottom",
          colorStops: [
            { color: c.transparent, positions: ["0%"] },
            { color: c.mediaScrim, positions: ["25%"] },
            { color: c.mediaBackground, positions: ["100%"] },
          ],
        },
      ],
    },
    fallback: {
      backgroundColor: c.accentSurface,
      alignItems: "center",
      justifyContent: "center",
    },
  });
