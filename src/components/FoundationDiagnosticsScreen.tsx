import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { UiTextInput as TextInput } from "@/ui/forms";
import { UiFoundationFixture } from "@/ui/UiFoundationFixture";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { Button, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useFoundationDiagnostics } from "@/hooks/useFoundationDiagnostics";

export function FoundationDiagnosticsScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { diagnostics, error, signIn, signOut, transportMode } =
    useFoundationDiagnostics();
  const [debugMode, setDebugMode] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setDebugMode(false);
      if (transportMode === "dev") {
        void getDefaultLedgerReportingRepository()
          .then((repository) => repository.getPreferences())
          .then((preferences) => {
            if (active) setDebugMode(preferences.debugMode);
          })
          .catch(() => {
            if (active) setDebugMode(false);
          });
      }
      return () => {
        active = false;
      };
    }, [transportMode]),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const submitSignIn = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      await signIn(email.trim(), password);
      setPassword("");
    } catch {
      setAuthError(t("diagnostics.signInFailed"));
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {transportMode === "dev" && debugMode ? <UiFoundationFixture /> : null}
        <Text style={styles.title}>{t("diagnostics.title")}</Text>
        {error ? <Text style={styles.value}>{error}</Text> : null}
        {diagnostics ? (
          <View style={styles.list}>
            <Text style={styles.value}>
              {t("diagnostics.db", {
                value: diagnostics.dbInitialized ? t("common.yes") : t("common.no"),
              })}
            </Text>
            <Text style={styles.value}>
              {t("diagnostics.schema", { value: diagnostics.schemaVersion })}
            </Text>
            <Text style={styles.value}>
              {t("diagnostics.auth", { value: diagnostics.authState })}
            </Text>
            <Text style={styles.value}>
              {t("diagnostics.network", { value: diagnostics.networkState })}
            </Text>
            <Text style={styles.value}>
              {t("diagnostics.pending", { value: diagnostics.pendingSyncCount })}
            </Text>
            <Text style={styles.value}>
              {t("diagnostics.itinerary", {
                value: diagnostics.pendingItineraryCreateCount,
              })}
            </Text>
            <Text style={styles.value}>
              {t("diagnostics.transport", { value: transportMode })}
            </Text>
          </View>
        ) : (
          <Text style={styles.value}>{t("common.loading")}</Text>
        )}

        {__DEV__ && transportMode === "dev" ? (
          <View style={styles.authHarness}>
            <Text style={styles.sectionTitle}>{t("diagnostics.authHeading")}</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder={t("diagnostics.email")}
              style={styles.input}
              value={email}
            />
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder={t("diagnostics.password")}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            {authError ? <Text style={styles.error}>{authError}</Text> : null}
            <Button
              disabled={!email.trim() || !password || isAuthenticating}
              onPress={() => void submitSignIn()}
              title={
                isAuthenticating ? t("diagnostics.signingIn") : t("diagnostics.signIn")
              }
            />
            <Button
              onPress={() => void signOut()}
              title={t("diagnostics.clearSession")}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { gap: 24, padding: 24 },
    title: { color: colors.textPrimary, fontSize: 24, fontWeight: "700" },
    list: { gap: 10 },
    value: { color: colors.textTertiary, fontSize: 16 },
    authHarness: {
      borderTopColor: colors.separator,
      borderTopWidth: 1,
      gap: 12,
      paddingTop: 20,
    },
    sectionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 6,
      borderWidth: 1,
      color: colors.textPrimary,
      fontSize: 16,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    error: { color: colors.destructive, fontSize: 14 },
  });
