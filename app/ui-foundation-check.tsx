import { useCallback, useState } from "react";
import { Stack, useFocusEffect } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { UiFoundationFixture } from "@/ui/UiFoundationFixture";
import { t } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

// Temporary verification route. Remove after foundation device acceptance.
export default function UiFoundationCheckRoute() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const developer = process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev";
  const [debugMode, setDebugMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setDebugMode(false);
      setMessage(null);
      if (developer) {
        void getDefaultLedgerReportingRepository()
          .then((repository) => repository.getPreferences())
          .then((preferences) => {
            if (active) setDebugMode(preferences.debugMode);
          })
          .catch(() => {
            if (active) setMessage(t("settings.loadFailed"));
          });
      }
      return () => {
        active = false;
      };
    }, [developer]),
  );

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.page}>
      <Stack.Screen options={{ headerShown: true, headerTitle: t("fixture.open") }} />
      <ScrollView style={styles.page} keyboardShouldPersistTaps="handled">
        {developer && debugMode ? <UiFoundationFixture /> : null}
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    error: {
      color: colors.destructive,
      padding: visual.space.page,
      ...visual.type.meta,
    },
  });
