import { useState } from "react";
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
} from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";

export function TripCoverVisual({
  source,
  style,
}: {
  source: ImageSourcePropType;
  style: StyleProp<ImageStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  return failed ? (
    <View style={[style, styles.fallback]} accessible={false}>
      <AppIcon name="suitcase" color={colors.accent} size={32} />
    </View>
  ) : (
    <Image
      source={source}
      style={style}
      resizeMode="cover"
      accessible={false}
      onError={() => setFailed(true)}
    />
  );
}

const createStyles = (c: UiColors) =>
  StyleSheet.create({
    fallback: {
      backgroundColor: c.accentSurface,
      alignItems: "center",
      justifyContent: "center",
    },
  });
