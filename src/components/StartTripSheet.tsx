import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "./AppIcon";
import { SheetHeader } from "./SheetHeader";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
export function StartTripSheet({
  visible,
  onClose,
  onImport,
  onCreate,
}: {
  visible: boolean;
  onClose(): void;
  onImport(): void;
  onCreate(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaProvider style={styles.host}>
        <View style={styles.backdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["bottom", "left", "right"]} style={styles.sheet}>
            <SheetHeader
              category="action"
              title={t("actionIsland.startTrip")}
              safeTop={false}
              leftLabel={t("common.cancel")}
              onLeft={onClose}
            />
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              <UiText style={styles.meta}>{t("createTripV2.startHint")}</UiText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("actionIsland.importPlans")}
                onPress={onImport}
                style={styles.row}
              >
                <View style={styles.icon}>
                  <AppIcon name="doc.badge.arrow.up" color={colors.accent} size={24} />
                </View>
                <View style={styles.copy}>
                  <UiText style={styles.title}>{t("actionIsland.importPlans")}</UiText>
                  <UiText style={styles.meta}>{t("createTripV2.importHint")}</UiText>
                </View>
                <AppIcon name="chevron.right" color={colors.textSecondary} size={16} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("actionIsland.createManually")}
                onPress={onCreate}
                style={styles.row}
              >
                <View style={styles.icon}>
                  <AppIcon name="map" color={colors.accent} size={24} />
                </View>
                <View style={styles.copy}>
                  <UiText style={styles.title}>{t("actionIsland.createManually")}</UiText>
                  <UiText style={styles.meta}>{t("createTripV2.manualHint")}</UiText>
                </View>
                <AppIcon name="chevron.right" color={colors.textSecondary} size={16} />
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    host: { flex: 1 },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
    sheet: {
      maxHeight: "90%",
      backgroundColor: colors.background,
      borderTopLeftRadius: visual.radius.sheet,
      borderTopRightRadius: visual.radius.sheet,
      overflow: "hidden",
    },
    scroll: { flexGrow: 0, flexShrink: 1 },
    content: { padding: visual.space.page, gap: visual.space.card },
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 88,
      gap: visual.space.card,
      padding: visual.space.card,
      backgroundColor: colors.surface,
      borderRadius: visual.radius.card,
    },
    icon: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSurface,
      borderRadius: visual.radius.card,
    },
    copy: { flex: 1, gap: visual.space.heading },
    title: { ...visual.type.row, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
  });
