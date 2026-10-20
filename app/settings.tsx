import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { systemMessage } from "@/ui/domainLabels";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";

export default function SettingsRoute() {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const developer = process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev";
  const [debugMode, setDebugMode] = useState(false);
  const [loading, setLoading] = useState(developer);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!developer) return;
    void getDefaultLedgerReportingRepository()
      .then((repository) => repository.getPreferences())
      .then((preferences) => setDebugMode(preferences.debugMode))
      .catch(() => setMessage(t("settings.loadFailed")))
      .finally(() => setLoading(false));
  }, [developer]);

  const toggleDebugMode = async (enabled: boolean) => {
    setDebugMode(enabled);
    setMessage(null);
    try {
      const repository = await getDefaultLedgerReportingRepository();
      await repository.setDebugMode(enabled);
    } catch {
      setDebugMode(!enabled);
      setMessage(t("settings.saveFailed"));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {t("settings.system")}
      </Text>
      <View style={styles.group}>
        <SettingRow
          icon="checkmark.shield"
          label={t("settings.health")}
          onPress={() => router.push("/data-sync")}
        />
      </View>
      {developer ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t("settings.developer")}
          </Text>
          <View style={styles.group}>
            {debugMode ? (
              <SettingRow
                icon="square.grid.2x2"
                label={t("fixture.open")}
                onPress={() => router.push("/ui-foundation-check")}
              />
            ) : null}
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.label}>{t("settings.debug")}</Text>
                <Text style={styles.detail}>{t("settings.debugDetail")}</Text>
              </View>
              {loading ? (
                <ActivityIndicator accessibilityLabel={t("settings.loadingDebug")} />
              ) : (
                <Switch
                  accessibilityLabel={t("settings.debug")}
                  onValueChange={(enabled) => void toggleDebugMode(enabled)}
                  trackColor={{ false: colors.separator, true: colors.accent }}
                  value={debugMode}
                />
              )}
            </View>
          </View>
        </>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {systemMessage(message)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function SettingRow({
  icon,
  label,
  onPress,
}: {
  icon: Parameters<typeof AppIcon>[0]["name"];
  label: string;
  onPress: () => void;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <AppIcon color={colors.textSecondary} name={icon} size={20} />
      <Text style={[styles.label, styles.grow]}>{label}</Text>
      <AppIcon color={colors.textTertiary} name="chevron.right" size={14} />
    </Pressable>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    content: { backgroundColor: colors.background, flexGrow: 1, padding: 20 },
    sectionTitle: {
      color: colors.textTertiary,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 7,
      marginLeft: 4,
      marginTop: 24,
      textTransform: "uppercase",
    },
    group: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: 58,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    grow: { flex: 1 },
    label: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
    detail: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
    error: { color: colors.destructive, fontSize: 14, marginTop: 12 },
  });
