import type { UiColors } from "@/ui/palette";
import { useUiTheme, useThemedStyles } from "@/ui/theme";
import type { ReactNode } from "react";
import { useHeaderHeight } from "expo-router/react-navigation";
import { StyleSheet, Text, View } from "react-native";

export function NavigationContextTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string | null;
}) {
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View
      accessible
      accessibilityLabel={[title, subtitle].filter(Boolean).join(", ")}
      style={styles.titleBlock}
    >
      <Text
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.35}
        numberOfLines={1}
        style={[styles.title, { color: colors.textPrimary }]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          numberOfLines={1}
          style={[styles.subtitle, { color: colors.textSecondary }]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    titleBlock: { alignItems: "center", maxWidth: 250, flexShrink: 1 },
    title: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
    subtitle: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  });

// The frame, not each scroll view or overlay, owns the native header inset.
export const navigationContentFrameOptions = { headerTransparent: true } as const;
export function NavigationContentFrame({ children }: { children: ReactNode }) {
  const headerHeight = useHeaderHeight();
  const styles = useThemedStyles(createContentFrameStyles);
  return (
    <View style={[styles.frame, { paddingTop: headerHeight }]}>
      <View style={styles.viewport}>{children}</View>
    </View>
  );
}
const createContentFrameStyles = (colors: UiColors) =>
  StyleSheet.create({
    frame: { flex: 1, backgroundColor: colors.background },
    viewport: { flex: 1, overflow: "hidden" },
  });
