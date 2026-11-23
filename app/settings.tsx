import { AppleAccountConnection } from "@/features/auth/AppleAccountConnection";
import {
  getUiAppearancePreference,
  subscribeUiAppearancePreference,
} from "@/native/uiAppearancePreference";
import { visual } from "@/ui/visual";
import { readCommittedLocalPrincipal } from "@/data/auth/authRepository";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { systemMessage } from "@/ui/domainLabels";
import { useEffect, useState, useSyncExternalStore } from "react";
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
  const locale = useUiLocale();
  const appearance = useSyncExternalStore(
    subscribeUiAppearancePreference,
    getUiAppearancePreference,
    getUiAppearancePreference,
  );
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration, getAccountGeneration, getAccountGeneration,
  );
  const [principal, setPrincipal] = useState<{ generation: number; kind: "GUEST" | "ACCOUNT" } | null>(null);
  const kind = principal?.generation === generation ? principal.kind : null;
  const developer = process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev" && kind === "ACCOUNT";
  useEffect(() => {
    let active = true;
    void readCommittedLocalPrincipal().then((value) => {
      if (active && generation === getAccountGeneration() &&
        (value?.kind === "GUEST" || value?.kind === "ACCOUNT")) {
        setPrincipal({ generation, kind: value.kind });
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [generation]);
  const [debugMode, setDebugMode] = useState(false);
  const [loadedGeneration, setLoadedGeneration] = useState<number | null>(null);
  const loading = loadedGeneration !== generation;
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!developer) return;
    let active = true;
    const current = () => active && getAccountGeneration() === generation;
    void getDefaultLedgerReportingRepository()
      .then((repository) => repository.getPreferences())
      .then((preferences) => {
        if (current()) {
          setDebugMode(preferences.debugMode);
          setMessage(null);
        }
      })
      .catch(() => {
        if (current()) setMessage(t("settings.loadFailed"));
      })
      .finally(() => {
        if (current()) setLoadedGeneration(generation);
      });
    return () => { active = false; };
  }, [developer, generation]);

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
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {t("navigation.account")}
      </Text>
      <View style={styles.group}>
        <SettingRow
          icon="person.crop.circle"
          label={t("privateProfile.title")}
          onPress={() => router.push("/profile")}
        />
        <SettingRow
          icon="person"
          label={t(kind === "GUEST" ? "navigation.signIn" : "settings.manageAccount")}
          onPress={() => router.push(kind === "GUEST" ? "/foundation" : "/account")}
        />
      </View>
      <AppleAccountConnection
        headingStyle={[styles.sectionTitle, { textTransform: "none" }]}
      />
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {t("settings.preferences")}
      </Text>
      <View style={styles.group}>
        <SettingRow
          icon="globe"
          label={t("navigation.language")}
          value={t(locale === "en" ? "navigation.english" : "navigation.chinese")}
          onPress={() => router.push("/settings-language")}
        />
        <SettingRow
          icon="circle.lefthalf.filled"
          label={t("authSettings.appearance")}
          value={t(`authSettings.appearance.${appearance}`)}
          onPress={() => router.push("/settings-appearance")}
        />
      </View>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {t("navigation.dataSync")}
      </Text>
      <View style={styles.group}>
        <SettingRow
          icon="checkmark.shield"
          label={t("navigation.dataSync")}
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
      {developer && !loading && message ? (
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
  value,
  onPress,
}: {
  icon: Parameters<typeof AppIcon>[0]["name"];
  label: string;
  value?: string;
  onPress: () => void;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <AppIcon color={colors.textSecondary} name={icon} size={20} />
      <View style={styles.grow}>
        <Text style={styles.label}>{label}</Text>
        {value ? <Text style={styles.detail}>{value}</Text> : null}
      </View>
      <AppIcon color={colors.textTertiary} name="chevron.right" size={14} />
    </Pressable>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { backgroundColor: colors.background },
    content: {
      padding: visual.space.page,
      width: "100%",
      maxWidth: 640,
      alignSelf: "center",
    },
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
