import { StyleSheet, Text, View } from "react-native";

export const navigationColors = {
  text: "#111827",
  muted: "#94A3B8",
  action: "#0F766E",
} as const;

export function NavigationContextTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string | null;
}) {
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
        style={styles.title}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: { alignItems: "center", maxWidth: 250, flexShrink: 1 },
  title: { color: navigationColors.text, fontSize: 17, fontWeight: "700" },
  subtitle: { color: navigationColors.muted, fontSize: 11, fontWeight: "600" },
});
