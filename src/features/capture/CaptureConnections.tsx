import { View, StyleSheet } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

// Discovery only. No address, provider connection or authorization is fabricated.
export function CaptureConnections({
  page,
  onBack,
}: {
  page: "email" | "ai";
  onBack(): void;
}) {
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  return (
    <View style={styles.page}>
      {page === "email" ? (
        <>
          <View style={styles.row}>
            <AppIcon name="envelope" size={24} color={colors.accent} />
            <View style={styles.copy}>
              <UiText style={styles.title}>{t("capture.connections.forwarding")}</UiText>
              <UiText style={styles.detail}>
                {t("capture.connections.notConfigured")}
              </UiText>
            </View>
          </View>
          <UiButton
            label={t("capture.connections.setupForwarding")}
            disabled
            onPress={() => undefined}
          />
          <View style={styles.row}>
            <AppIcon name="tray" size={24} color={colors.accent} />
            <View style={styles.copy}>
              <UiText style={styles.title}>{t("capture.connections.mailbox")}</UiText>
              <UiText style={styles.detail}>
                {t("capture.connections.notConnected")}
              </UiText>
            </View>
          </View>
          <UiButton
            label={t("capture.connections.connectMailbox")}
            disabled
            onPress={() => undefined}
          />
        </>
      ) : (
        <>
          <View style={styles.row}>
            <AppIcon name="link" size={24} color={colors.accent} />
            <View style={styles.copy}>
              <UiText style={styles.title}>{t("capture.connections.plugins")}</UiText>
              <UiText style={styles.detail}>
                {t("capture.connections.notConnected")}
              </UiText>
            </View>
          </View>
          <UiButton
            label={t("capture.connections.connectAI")}
            disabled
            onPress={() => undefined}
          />
        </>
      )}
      <UiText style={styles.detail}>
        {t(
          page === "email"
            ? "capture.composer.emailUnavailable"
            : "capture.composer.aiUnavailable",
        )}
      </UiText>
      <UiButton variant="text" label={t("common.back")} onPress={onBack} />
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    page: { padding: visual.space.page, gap: 10 },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    copy: { flex: 1 },
    title: { ...visual.type.row, color: c.textPrimary },
    detail: { ...visual.type.meta, color: c.textSecondary },
  });
