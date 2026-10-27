import { useEffect } from "react";
import { ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

// DEV diagnostics only; no account, reader, repository or system-clock changes.
export function FidelityCalibration() {
  const window = useWindowDimensions(),
    insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  useEffect(() => {
    console.info(
      JSON.stringify({
        event: "day_fidelity_measurement",
        window,
        insets,
        font: "platform-default",
        bodyRole: visual.type.row,
        captionRole: visual.type.meta,
      }),
    );
  }, [window, insets]);
  return (
    <SafeAreaView style={styles.body}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <UiText style={styles.title}>{t("dayLab.title")}</UiText>
        <UiText
          style={styles.row}
          onTextLayout={({ nativeEvent }) =>
            console.info(
              JSON.stringify({
                event: "day_fidelity_font_measurement",
                role: "row",
                lines: nativeEvent.lines,
              }),
            )
          }
        >
          {t("dayLab.fixture4")}
        </UiText>
        <UiText
          style={styles.meta}
          onTextLayout={({ nativeEvent }) =>
            console.info(
              JSON.stringify({
                event: "day_fidelity_font_measurement",
                role: "meta",
                lines: nativeEvent.lines,
              }),
            )
          }
        >
          {t("dayLab.deferred")}
        </UiText>
      </ScrollView>
    </SafeAreaView>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    title: { ...visual.type.section, color: c.textPrimary },
    row: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
